'use strict';

/*
 Contains the needed UI elements for the oauth2 dialogs
 */

var passport = require('passport'),
    login = require('connect-ensure-login');

exports.index = function(req, res) {
    // probably some redirect to the main server
    res.send('Yellowtent Auth Server');
};

exports.loginForm = function(req, res) {
    res.render('login');
};

exports.login = passport.authenticate('local', { successReturnToOrRedirect: '/', failureRedirect: '/login' });

exports.logout = function(req, res) {
    req.logout();
    res.redirect('/');
};

exports.account = [
    login.ensureLoggedIn(),
    function(req, res) {
        res.render('account', { user: req.user });
    }
];
