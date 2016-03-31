/* jslint  node:true */

'use strict';

var assert = require('assert'),
    apps = require('../apps'),
    authcodedb = require('../authcodedb'),
    clientdb = require('../clientdb'),
    config = require('../config.js'),
    constants = require('../constants.js'),
    DatabaseError = require('../databaseerror'),
    debug = require('debug')('box:routes/oauth2'),
    HttpError = require('connect-lastmile').HttpError,
    middleware = require('../middleware/index.js'),
    oauth2orize = require('oauth2orize'),
    passport = require('passport'),
    querystring = require('querystring'),
    util = require('util'),
    session = require('connect-ensure-login'),
    settings = require('../settings.js'),
    tokendb = require('../tokendb'),
    appdb = require('../appdb'),
    url = require('url'),
    user = require('../user.js'),
    UserError = user.UserError,
    hat = require('hat');

// create OAuth 2.0 server
var gServer = oauth2orize.createServer();


// Register serialialization and deserialization functions.
//
// The client id is stored in the session and can thus be retrieved for each
// step in the oauth flow transaction, which involves multiple http requests.

gServer.serializeClient(function (client, callback) {
    return callback(null, client.id);
});

gServer.deserializeClient(function (id, callback) {
    clientdb.get(id, callback);
});


// Register supported grant types.

// Grant authorization codes.  The callback takes the `client` requesting
// authorization, the `redirectURI` (which is used as a verifier in the
// subsequent exchange), the authenticated `user` granting access, and
// their response, which contains approved scope, duration, etc. as parsed by
// the application.  The application issues a code, which is bound to these
// values, and will be exchanged for an access token.

gServer.grant(oauth2orize.grant.code({ scopeSeparator: ',' }, function (client, redirectURI, user, ares, callback) {
    debug('grant code:', client.id, redirectURI, user.id, ares);

    var code = hat(256);
    var expiresAt = Date.now() + 60 * 60000; // 1 hour

    authcodedb.add(code, client.id, user.username, expiresAt, function (error) {
        if (error) return callback(error);

        debug('grant code: new auth code for client %s code %s', client.id, code);

        callback(null, code);
    });
}));


gServer.grant(oauth2orize.grant.token({ scopeSeparator: ',' }, function (client, user, ares, callback) {
    debug('grant token:', client.id, user.id, ares);

    var token = tokendb.generateToken();
    var expires = Date.now() + 24 * 60 * 60 * 1000; // 1 day

    tokendb.add(token, tokendb.PREFIX_USER + user.id, client.id, expires, client.scope, function (error) {
        if (error) return callback(error);

        debug('grant token: new access token for client %s token %s', client.id, token);

        callback(null, token);
    });
}));


// Exchange authorization codes for access tokens.  The callback accepts the
// `client`, which is exchanging `code` and any `redirectURI` from the
// authorization request for verification.  If these values are validated, the
// application issues an access token on behalf of the user who authorized the
// code.

gServer.exchange(oauth2orize.exchange.code(function (client, code, redirectURI, callback) {
    debug('exchange:', client, code, redirectURI);

    authcodedb.get(code, function (error, authCode) {
        if (error && error.reason === DatabaseError.NOT_FOUND) return callback(null, false);
        if (error) return callback(error);
        if (client.id !== authCode.clientId) return callback(null, false);

        authcodedb.del(code, function (error) {
            if(error) return callback(error);

            var token = tokendb.generateToken();
            var expires = Date.now() + 24 * 60 * 60 * 1000; // 1 day

            tokendb.add(token, tokendb.PREFIX_USER + authCode.userId, authCode.clientId, expires, client.scope, function (error) {
                if (error) return callback(error);

                debug('exchange: new access token for client %s token %s', client.id, token);

                callback(null, token);
            });
        });
    });
}));

// overwrite the session.ensureLoggedIn to not use res.redirect() due to a chrome bug not sending cookies on redirects
session.ensureLoggedIn = function (redirectTo) {
    assert.strictEqual(typeof redirectTo, 'string');

    return function (req, res, next) {
        if (!req.isAuthenticated || !req.isAuthenticated()) {
            if (req.session) {
                req.session.returnTo = req.originalUrl || req.url;
            }

            res.status(200).send(util.format('<script>window.location.href = "%s";</script>', redirectTo));
        } else {
            next();
        }
    };
};

function renderTemplate(res, template, data) {
    assert.strictEqual(typeof res, 'object');
    assert.strictEqual(typeof template, 'string');
    assert.strictEqual(typeof data, 'object');

    res.render(template, data);
}

function sendErrorPageOrRedirect(req, res, message) {
    assert.strictEqual(typeof req, 'object');
    assert.strictEqual(typeof res, 'object');
    assert.strictEqual(typeof message, 'string');

    debug('sendErrorPageOrRedirect: returnTo %s.', req.query.returnTo, message);

    if (typeof req.query.returnTo !== 'string') {
        renderTemplate(res, 'error', {
            adminOrigin: config.adminOrigin(),
            message: message,
            title: 'Cloudron Error'
        });
    } else {
        var u = url.parse(req.query.returnTo);
        if (!u.protocol || !u.host) {
            return renderTemplate(res, 'error', {
                adminOrigin: config.adminOrigin(),
                message: 'Invalid request. returnTo query is not a valid URI. ' + message,
                title: 'Cloudron Error'
            });
        }

        res.redirect(util.format('%s//%s', u.protocol, u.host));
    }
}

// use this instead of sendErrorPageOrRedirect(), in case we have a returnTo provided in the query, to avoid login loops
// This usually happens when the OAuth client ID is wrong
function sendError(req, res, message) {
    assert.strictEqual(typeof req, 'object');
    assert.strictEqual(typeof res, 'object');
    assert.strictEqual(typeof message, 'string');

    renderTemplate(res, 'error', {
        adminOrigin: config.adminOrigin(),
        message: message,
        title: 'Cloudron Error'
    });
}

// -> GET /api/v1/session/login
function loginForm(req, res) {
    if (typeof req.session.returnTo !== 'string') return sendErrorPageOrRedirect(req, res, 'Invalid login request. No returnTo provided.');

    var u = url.parse(req.session.returnTo, true);
    if (!u.query.client_id) return sendErrorPageOrRedirect(req, res, 'Invalid login request. No client_id provided.');

    function render(applicationName, applicationLogo) {
        renderTemplate(res, 'login', {
            adminOrigin: config.adminOrigin(),
            csrf: req.csrfToken(),
            applicationName: applicationName,
            applicationLogo: applicationLogo,
            error: req.query.error || null,
            title: applicationName + ' Login'
        });
    }

    clientdb.get(u.query.client_id, function (error, result) {
        if (error) return sendError(req, res, 'Unknown OAuth client');

        switch (result.type) {
            case clientdb.TYPE_ADMIN: return render(constants.ADMIN_NAME, '/api/v1/cloudron/avatar');
            case clientdb.TYPE_EXTERNAL: return render('External Application', '/api/v1/cloudron/avatar');
            case clientdb.TYPE_SIMPLE_AUTH: return sendError(req, res, 'Unknown OAuth client');
            default: break;
        }

        appdb.get(result.appId, function (error, result) {
            if (error) return sendErrorPageOrRedirect(req, res, 'Unknown Application for those OAuth credentials');

            var applicationName = result.location || config.fqdn();
            render(applicationName, '/api/v1/apps/' + result.id + '/icon');
        });
    });
}

// -> POST /api/v1/session/login
function login(req, res) {
    var returnTo = req.session.returnTo || req.query.returnTo;

    var failureQuery = querystring.stringify({ error: 'Invalid username or password', returnTo: returnTo });
    passport.authenticate('local', {
        failureRedirect: '/api/v1/session/login?' + failureQuery
    })(req, res, function () {
        res.redirect(returnTo);
    });
}

// -> GET /api/v1/session/logout
function logout(req, res) {
    req.logout();

    if (req.query && req.query.redirect) res.redirect(req.query.redirect);
    else res.redirect('/');
}

// Form to enter email address to send a password reset request mail
// -> GET /api/v1/session/password/resetRequest.html
function passwordResetRequestSite(req, res) {
    renderTemplate(res, 'password_reset_request', { adminOrigin: config.adminOrigin(), csrf: req.csrfToken(), title: 'Cloudron Password Reset' });
}

// This route is used for above form submission
// -> POST /api/v1/session/password/resetRequest
function passwordResetRequest(req, res, next) {
    assert.strictEqual(typeof req.body, 'object');

    if (typeof req.body.identifier !== 'string') return next(new HttpError(400, 'Missing identifier'));

    debug('passwordResetRequest: email or username %s.', req.body.identifier);

    user.resetPasswordByIdentifier(req.body.identifier, function (error) {
        if (error && error.reason !== UserError.NOT_FOUND) {
            console.error(error);
            return sendErrorPageOrRedirect(req, res, 'User not found');
        }

        res.redirect('/api/v1/session/password/sent.html');
    });
}

// -> GET /api/v1/session/password/sent.html
function passwordSentSite(req, res) {
    renderTemplate(res, 'password_reset_sent', { adminOrigin: config.adminOrigin(), title: 'Cloudron Password Reset' });
}

// -> GET /api/v1/session/password/setup.html
function passwordSetupSite(req, res, next) {
    if (!req.query.reset_token) return next(new HttpError(400, 'Missing reset_token'));

    user.getByResetToken(req.query.reset_token, function (error, user) {
        if (error) return next(new HttpError(401, 'Invalid reset_token'));

        renderTemplate(res, 'password_setup', {
            adminOrigin: config.adminOrigin(),
            user: user,
            csrf: req.csrfToken(),
            resetToken: req.query.reset_token,
            title: 'Cloudron Password Setup'
        });
    });
}

// -> GET /api/v1/session/password/reset.html
function passwordResetSite(req, res, next) {
    if (!req.query.reset_token) return next(new HttpError(400, 'Missing reset_token'));

    user.getByResetToken(req.query.reset_token, function (error, user) {
        if (error) return next(new HttpError(401, 'Invalid reset_token'));

        renderTemplate(res, 'password_reset', {
            adminOrigin: config.adminOrigin(),
            user: user,
            csrf: req.csrfToken(),
            resetToken: req.query.reset_token,
            title: 'Cloudron Password Reset'
        });
    });
}

// -> POST /api/v1/session/password/reset
function passwordReset(req, res, next) {
    assert.strictEqual(typeof req.body, 'object');

    if (typeof req.body.resetToken !== 'string') return next(new HttpError(400, 'Missing resetToken'));
    if (typeof req.body.password !== 'string') return next(new HttpError(400, 'Missing password'));

    // optionally support settin the username and displayName
    if ('username' in req.body && typeof req.body.username !== 'string') return next(new HttpError(400, 'username must be a string'));
    if ('displayName' in req.body && typeof req.body.displayName !== 'string') return next(new HttpError(400, 'displayName must be a string'));

    debug('passwordReset: with token %s.', req.body.resetToken);

    user.getByResetToken(req.body.resetToken, function (error, userObject) {
        if (error) return next(new HttpError(401, 'Invalid resetToken'));

        // setPassword clears the resetToken
        user.setPassword(userObject.id, req.body.password, function (error, result) {
            if (error && error.reason === UserError.BAD_PASSWORD) return next(new HttpError(406, 'Password does not meet the requirements'));
            if (error) return next(new HttpError(500, error));

            res.redirect(util.format('%s?accessToken=%s&expiresAt=%s', config.adminOrigin(), result.token, result.expiresAt));
        });
    });
}


// The callback page takes the redirectURI and the authCode and redirects the browser accordingly
//
// -> GET /api/v1/session/callback
var callback = [
    session.ensureLoggedIn('/api/v1/session/login'),
    function (req, res) {
        renderTemplate(res, 'callback', { adminOrigin: config.adminOrigin(), callbackServer: req.query.redirectURI });
    }
];


// The authorization endpoint is the entry point for an OAuth login.
//
// Each app would start OAuth by redirecting the user to:
//
//    /api/v1/oauth/dialog/authorize?response_type=code&client_id=<clientId>&redirect_uri=<callbackURL>&scope=<ignored>
//
//  - First, this will ensure the user is logged in.
//  - Then it will redirect the browser to the given <callbackURL> containing the authcode in the query
//
// -> GET /api/v1/oauth/dialog/authorize
var authorization = [
    function (req, res, next) {
        if (!req.query.redirect_uri) return sendErrorPageOrRedirect(req, res, 'Invalid request. redirect_uri query param is not set.');
        if (!req.query.client_id) return sendErrorPageOrRedirect(req, res, 'Invalid request. client_id query param is not set.');
        if (!req.query.response_type) return sendErrorPageOrRedirect(req, res, 'Invalid request. response_type query param is not set.');
        if (req.query.response_type !== 'code' && req.query.response_type !== 'token') return sendErrorPageOrRedirect(req, res, 'Invalid request. Only token and code response types are supported.');

        session.ensureLoggedIn('/api/v1/session/login?returnTo=' + req.query.redirect_uri)(req, res, next);
    },
    gServer.authorization({}, function (clientId, redirectURI, callback) {
        debug('authorization: client %s with callback to %s.', clientId, redirectURI);

        clientdb.get(clientId, function (error, client) {
            if (error && error.reason === DatabaseError.NOT_FOUND) return callback(null, false);
            if (error) return callback(error);

            // ignore the origin passed into form the client, but use the one from the clientdb
            var redirectPath = url.parse(redirectURI).path;
            var redirectOrigin = client.redirectURI;

            callback(null, client, '/api/v1/session/callback?redirectURI=' + encodeURIComponent(url.resolve(redirectOrigin, redirectPath)));
        });
    }),
    function (req, res, next) {
        // Handle our different types of oauth clients
        var type = req.oauth2.client.type;

        if (type === clientdb.TYPE_ADMIN) return next();
        if (type === clientdb.TYPE_EXTERNAL) return next();
        if (type === clientdb.TYPE_SIMPLE_AUTH) return sendError(req, res, 'Unknown OAuth client.');

        appdb.get(req.oauth2.client.appId, function (error, appObject) {
            if (error) return sendErrorPageOrRedirect(req, res, 'Invalid request. Unknown app for this client_id.');

            apps.hasAccessTo(appObject, req.oauth2.user, function (error, access) {
                if (error) return sendError(req, res, 'Internal error');
                if (!access) return sendErrorPageOrRedirect(req, res, 'No access to this app.');

                next();
            });
        });
    },
    gServer.decision({ loadTransaction: false })
];


//  The token endpoint allows an OAuth client to exchange an authcode with an accesstoken.
//
//  Authcodes are obtained using the authorization endpoint. The route is authenticated by
//  providing a Basic auth with clientID as username and clientSecret as password.
//  An authcode is only good for one such exchange to an accesstoken.
//
// -> POST /api/v1/oauth/token
var token = [
    passport.authenticate(['basic', 'oauth2-client-password'], { session: false }),
    gServer.token(),
    gServer.errorHandler()
];


//  The scope middleware provides an auth middleware for routes.
//
//  It is used for API routes, which are authenticated using accesstokens.
//  Those accesstokens carry OAuth scopes and the middleware takes the required
//  scope as an argument and will verify the accesstoken against it.
//
//  See server.js:
//    var profileScope = routes.oauth2.scope('profile');
//
function scope(requestedScope) {
    assert.strictEqual(typeof requestedScope, 'string');

    var requestedScopes = requestedScope.split(',');
    debug('scope: add routes with requested scopes', requestedScopes);

    return [
        passport.authenticate(['bearer'], { session: false }),
        function (req, res, next) {
            if (!req.authInfo || !req.authInfo.scope) return next(new HttpError(401, 'No scope found'));
            if (req.authInfo.scope === '*') return next();

            var scopes = req.authInfo.scope.split(',');

            for (var i = 0; i < requestedScopes.length; ++i) {
                if (scopes.indexOf(requestedScopes[i]) === -1) {
                    debug('scope: missing scope "%s".', requestedScopes[i]);
                    return next(new HttpError(401, 'Missing required scope "' + requestedScopes[i] + '"'));
                }
            }

            next();
        }
    ];
}

// Cross-site request forgery protection middleware for login form
var csrf = [
    middleware.csrf(),
    function (err, req, res, next) {
        if (err.code !== 'EBADCSRFTOKEN') return next(err);

        sendErrorPageOrRedirect(req, res, 'Form expired');
    }
];

exports = module.exports = {
    loginForm: loginForm,
    login: login,
    logout: logout,
    callback: callback,
    passwordResetRequestSite: passwordResetRequestSite,
    passwordResetRequest: passwordResetRequest,
    passwordSentSite: passwordSentSite,
    passwordResetSite: passwordResetSite,
    passwordSetupSite: passwordSetupSite,
    passwordReset: passwordReset,
    authorization: authorization,
    token: token,
    scope: scope,
    csrf: csrf
};
