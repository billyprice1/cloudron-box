'use strict';

/* jslint node:true */
/* global it:false */
/* global describe:false */
/* global before:false */
/* global after:false */

var async = require('async'),
    config = require('../../config.js'),
    database = require('../../database.js'),
    expect = require('expect.js'),
    nock = require('nock'),
    superagent = require('superagent'),
    server = require('../../server.js'),
    settings = require('../../settings.js');

var SERVER_URL = 'http://localhost:' + config.get('port');

var USERNAME = 'superadmin', PASSWORD = 'Foobar?1337', EMAIL ='silly@me.com';
var token = null; // authentication token

var server;
function setup(done) {
    server.start(done);
}

function cleanup(done) {
    database._clear(function (error) {
        expect(error).to.not.be.ok();

        server.stop(done);
    });
}

describe('Developer API', function () {
    describe('isEnabled', function () {
        before(function (done) {
            async.series([
                setup,

                function (callback) {
                    var scope1 = nock(config.apiServerOrigin()).get('/api/v1/boxes/' + config.fqdn() + '/setup/verify?setupToken=somesetuptoken').reply(200, {});
                    var scope2 = nock(config.apiServerOrigin()).post('/api/v1/boxes/' + config.fqdn() + '/setup/done?setupToken=somesetuptoken').reply(201, {});

                    superagent.post(SERVER_URL + '/api/v1/cloudron/activate')
                           .query({ setupToken: 'somesetuptoken' })
                           .send({ username: USERNAME, password: PASSWORD, email: EMAIL })
                           .end(function (error, result) {
                        expect(result).to.be.ok();
                        expect(scope1.isDone()).to.be.ok();
                        expect(scope2.isDone()).to.be.ok();

                        // stash token for further use
                        token = result.body.token;

                        callback();
                    });
                },
            ], done);
        });

        after(cleanup);

        it('fails without token', function (done) {
            settings.setDeveloperMode(true, function (error) {
                expect(error).to.be(null);

                superagent.get(SERVER_URL + '/api/v1/developer')
                       .end(function (error, result) {
                    expect(result.statusCode).to.equal(401);
                    done();
                });
            });
        });

        it('succeeds (enabled)', function (done) {
            settings.setDeveloperMode(true, function (error) {
                expect(error).to.be(null);

                superagent.get(SERVER_URL + '/api/v1/developer')
                       .query({ access_token: token })
                       .end(function (error, result) {
                    expect(result.statusCode).to.equal(200);
                    done();
                });
            });
        });

        it('succeeds (not enabled)', function (done) {
            settings.setDeveloperMode(false, function (error) {
                expect(error).to.be(null);

                superagent.get(SERVER_URL + '/api/v1/developer')
                       .query({ access_token: token })
                       .end(function (error, result) {
                    expect(result.statusCode).to.equal(412);
                    done();
                });
            });
        });
    });

    describe('setEnabled', function () {
        before(function (done) {
            async.series([
                setup,

                function (callback) {
                    var scope1 = nock(config.apiServerOrigin()).get('/api/v1/boxes/' + config.fqdn() + '/setup/verify?setupToken=somesetuptoken').reply(200, {});
                    var scope2 = nock(config.apiServerOrigin()).post('/api/v1/boxes/' + config.fqdn() + '/setup/done?setupToken=somesetuptoken').reply(201, {});

                    superagent.post(SERVER_URL + '/api/v1/cloudron/activate')
                           .query({ setupToken: 'somesetuptoken' })
                           .send({ username: USERNAME, password: PASSWORD, email: EMAIL })
                           .end(function (error, result) {
                        expect(result).to.be.ok();
                        expect(scope1.isDone()).to.be.ok();
                        expect(scope2.isDone()).to.be.ok();

                        // stash token for further use
                        token = result.body.token;

                        callback();
                    });
                },
            ], done);
        });

        after(cleanup);

        it('fails without token', function (done) {
            superagent.post(SERVER_URL + '/api/v1/developer')
                   .send({ enabled: true })
                   .end(function (error, result) {
                expect(result.statusCode).to.equal(401);
                done();
            });
        });

        it('fails due to missing password', function (done) {
            superagent.post(SERVER_URL + '/api/v1/developer')
                   .query({ access_token: token })
                   .send({ enabled: true })
                   .end(function (error, result) {
                expect(result.statusCode).to.equal(400);
                done();
            });
        });

        it('fails due to empty password', function (done) {
            superagent.post(SERVER_URL + '/api/v1/developer')
                   .query({ access_token: token })
                   .send({ password: '', enabled: true })
                   .end(function (error, result) {
                expect(result.statusCode).to.equal(403);
                done();
            });
        });

        it('fails due to wrong password', function (done) {
            superagent.post(SERVER_URL + '/api/v1/developer')
                   .query({ access_token: token })
                   .send({ password: PASSWORD.toUpperCase(), enabled: true })
                   .end(function (error, result) {
                expect(result.statusCode).to.equal(403);
                done();
            });
        });

        it('fails due to missing enabled property', function (done) {
            superagent.post(SERVER_URL + '/api/v1/developer')
                   .query({ access_token: token })
                   .send({ password: PASSWORD })
                   .end(function (error, result) {
                expect(result.statusCode).to.equal(400);
                done();
            });
        });

        it('fails due to wrong enabled property type', function (done) {
            superagent.post(SERVER_URL + '/api/v1/developer')
                   .query({ access_token: token })
                   .send({ password: PASSWORD, enabled: 'true' })
                   .end(function (error, result) {
                expect(result.statusCode).to.equal(400);
                done();
            });
        });

        it('succeeds enabling', function (done) {
            superagent.post(SERVER_URL + '/api/v1/developer')
                   .query({ access_token: token })
                   .send({ password: PASSWORD, enabled: true })
                   .end(function (error, result) {
                expect(result.statusCode).to.equal(200);

                superagent.get(SERVER_URL + '/api/v1/developer')
                       .query({ access_token: token })
                       .end(function (error, result) {
                    expect(result.statusCode).to.equal(200);
                    done();
                });
            });
        });

        it('succeeds disabling', function (done) {
            superagent.post(SERVER_URL + '/api/v1/developer')
                   .query({ access_token: token })
                   .send({ password: PASSWORD, enabled: false })
                   .end(function (error, result) {
                expect(result.statusCode).to.equal(200);

                superagent.get(SERVER_URL + '/api/v1/developer')
                       .query({ access_token: token })
                       .end(function (error, result) {
                    expect(result.statusCode).to.equal(412);
                    done();
                });
            });
        });
    });

    describe('login', function () {
        before(function (done) {
            async.series([
                setup,

                settings.setDeveloperMode.bind(null, true),

                function (callback) {
                    var scope1 = nock(config.apiServerOrigin()).get('/api/v1/boxes/' + config.fqdn() + '/setup/verify?setupToken=somesetuptoken').reply(200, {});
                    var scope2 = nock(config.apiServerOrigin()).post('/api/v1/boxes/' + config.fqdn() + '/setup/done?setupToken=somesetuptoken').reply(201, {});

                    superagent.post(SERVER_URL + '/api/v1/cloudron/activate')
                           .query({ setupToken: 'somesetuptoken' })
                           .send({ username: USERNAME, password: PASSWORD, email: EMAIL })
                           .end(function (error, result) {
                        expect(result).to.be.ok();
                        expect(scope1.isDone()).to.be.ok();
                        expect(scope2.isDone()).to.be.ok();

                        // stash token for further use
                        token = result.body.token;

                        callback();
                    });
                },
            ], done);
        });

        after(cleanup);

        it('fails without body', function (done) {
            superagent.post(SERVER_URL + '/api/v1/developer/login')
                   .end(function (error, result) {
                expect(result.statusCode).to.equal(401);
                done();
            });
        });

        it('fails without username', function (done) {
            superagent.post(SERVER_URL + '/api/v1/developer/login')
                   .send({ password: PASSWORD })
                   .end(function (error, result) {
                expect(result.statusCode).to.equal(401);
                done();
            });
        });

        it('fails without password', function (done) {
            superagent.post(SERVER_URL + '/api/v1/developer/login')
                   .send({ username: USERNAME })
                   .end(function (error, result) {
                expect(result.statusCode).to.equal(401);
                done();
            });
        });

        it('fails with empty username', function (done) {
            superagent.post(SERVER_URL + '/api/v1/developer/login')
                   .send({ username: '', password: PASSWORD })
                   .end(function (error, result) {
                expect(result.statusCode).to.equal(401);
                done();
            });
        });

        it('fails with empty password', function (done) {
            superagent.post(SERVER_URL + '/api/v1/developer/login')
                   .send({ username: USERNAME, password: '' })
                   .end(function (error, result) {
                expect(result.statusCode).to.equal(401);
                done();
            });
        });

        it('fails with unknown username', function (done) {
            superagent.post(SERVER_URL + '/api/v1/developer/login')
                   .send({ username: USERNAME + USERNAME, password: PASSWORD })
                   .end(function (error, result) {
                expect(result.statusCode).to.equal(401);
                done();
            });
        });

        it('fails with unknown email', function (done) {
            superagent.post(SERVER_URL + '/api/v1/developer/login')
                   .send({ username: USERNAME + EMAIL, password: PASSWORD })
                   .end(function (error, result) {
                expect(result.statusCode).to.equal(401);
                done();
            });
        });

        it('fails with wrong password', function (done) {
            superagent.post(SERVER_URL + '/api/v1/developer/login')
                   .send({ username: USERNAME, password: PASSWORD.toUpperCase() })
                   .end(function (error, result) {
                expect(result.statusCode).to.equal(401);
                done();
            });
        });

        it('with username succeeds', function (done) {
            superagent.post(SERVER_URL + '/api/v1/developer/login')
                   .send({ username: USERNAME, password: PASSWORD })
                   .end(function (error, result) {
                expect(result.statusCode).to.equal(200);
                expect(new Date(result.body.expiresAt).toString()).to.not.be('Invalid Date');
                expect(result.body.token).to.be.a('string');
                done();
            });
        });

        it('with uppercase username succeeds', function (done) {
            superagent.post(SERVER_URL + '/api/v1/developer/login')
                   .send({ username: USERNAME.toUpperCase(), password: PASSWORD })
                   .end(function (error, result) {
                expect(result.statusCode).to.equal(200);
                expect(new Date(result.body.expiresAt).toString()).to.not.be('Invalid Date');
                expect(result.body.token).to.be.a('string');
                done();
            });
        });

        it('with email succeeds', function (done) {
            superagent.post(SERVER_URL + '/api/v1/developer/login')
                   .send({ username: EMAIL, password: PASSWORD })
                   .end(function (error, result) {
                expect(result.statusCode).to.equal(200);
                expect(new Date(result.body.expiresAt).toString()).to.not.be('Invalid Date');
                expect(result.body.token).to.be.a('string');
                done();
            });
        });

        it('with uppercase email succeeds', function (done) {
            superagent.post(SERVER_URL + '/api/v1/developer/login')
                   .send({ username: EMAIL.toUpperCase(), password: PASSWORD })
                   .end(function (error, result) {
                expect(result.statusCode).to.equal(200);
                expect(new Date(result.body.expiresAt).toString()).to.not.be('Invalid Date');
                expect(result.body.token).to.be.a('string');
                done();
            });
        });
    });

    describe('sdk tokens are valid without password checks', function () {
        var token_normal, token_sdk;

        before(function (done) {
            async.series([
                setup,

                settings.setDeveloperMode.bind(null, true),

                function (callback) {
                    var scope1 = nock(config.apiServerOrigin()).get('/api/v1/boxes/' + config.fqdn() + '/setup/verify?setupToken=somesetuptoken').reply(200, {});
                    var scope2 = nock(config.apiServerOrigin()).post('/api/v1/boxes/' + config.fqdn() + '/setup/done?setupToken=somesetuptoken').reply(201, {});

                    superagent.post(SERVER_URL + '/api/v1/cloudron/activate')
                           .query({ setupToken: 'somesetuptoken' })
                           .send({ username: USERNAME, password: PASSWORD, email: EMAIL })
                           .end(function (error, result) {
                        expect(result).to.be.ok();
                        expect(scope1.isDone()).to.be.ok();
                        expect(scope2.isDone()).to.be.ok();

                        token_normal = result.body.token;

                        superagent.post(SERVER_URL + '/api/v1/developer/login')
                          .send({ username: USERNAME, password: PASSWORD })
                          .end(function (error, result) {
                            expect(result.statusCode).to.equal(200);
                            expect(new Date(result.body.expiresAt).toString()).to.not.be('Invalid Date');
                            expect(result.body.token).to.be.a('string');

                            token_sdk = result.body.token;

                            callback();
                        });
                    });
                },
            ], done);
        });

        after(cleanup);

        it('fails with non sdk token', function (done) {
            superagent.post(SERVER_URL + '/api/v1/profile/password').query({ access_token: token_normal }).send({ newPassword: 'Some?$123' }).end(function (error, result) {
                expect(result.statusCode).to.equal(400);
                done();
            });
        });

        it('succeeds', function (done) {
            superagent.post(SERVER_URL + '/api/v1/profile/password').query({ access_token: token_sdk }).send({ newPassword: 'Some?$123' }).end(function (error, result) {
                expect(result.statusCode).to.equal(204);
                done();
            });
        });
    });
});
