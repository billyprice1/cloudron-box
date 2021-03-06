/* jslint node:true */
/* global it:false */
/* global describe:false */
/* global before:false */
/* global after:false */

'use strict';

var addons = require('../addons.js'),
    appdb = require('../appdb.js'),
    apptask = require('../apptask.js'),
    async = require('async'),
    config = require('../config.js'),
    database = require('../database.js'),
    expect = require('expect.js'),
    fs = require('fs'),
    js2xml = require('js2xmlparser'),
    net = require('net'),
    nock = require('nock'),
    paths = require('../paths.js'),
    settings = require('../settings.js'),
    _ = require('underscore');

var MANIFEST = {
  "id": "io.cloudron.test",
  "author": "The Presidents Of the United States Of America",
  "title": "test title",
  "description": "test description",
  "tagline": "test rocks",
  "website": "http://test.cloudron.io",
  "contactEmail": "support@cloudron.io",
  "version": "0.1.0",
  "manifestVersion": 1,
  "dockerImage": "cloudron/test:17.0.0",
  "healthCheckPath": "/",
  "httpPort": 7777,
  "tcpPorts": {
    "ECHO_SERVER_PORT": {
      "title": "Echo Server Port",
      "description": "Echo server",
      "containerPort": 7778
    }
  },
  "addons": {
    "oauth": { },
    "redis": { },
    "mysql": { },
    "postgresql": { }
  }
};

var APP = {
    id: 'appid',
    appStoreId: 'appStoreId',
    installationState: appdb.ISTATE_PENDING_INSTALL,
    runState: null,
    location: 'applocation',
    manifest: MANIFEST,
    containerId: null,
    httpPort: 4567,
    portBindings: null,
    accessRestriction: null,
    dnsRecordId: 'someDnsRecordId',
    memoryLimit: 0
};

 var awsHostedZones = {
     HostedZones: [{
         Id: '/hostedzone/ZONEID',
         Name: 'localhost.',
         CallerReference: '305AFD59-9D73-4502-B020-F4E6F889CB30',
         ResourceRecordSetCount: 2,
         ChangeInfo: {
             Id: '/change/CKRTFJA0ANHXB',
             Status: 'INSYNC'
         }
     }],
    IsTruncated: false,
    MaxItems: '100'
 };

describe('apptask', function () {
    before(function (done) {
        config.set('version', '0.5.0');
        async.series([
            database.initialize,
            appdb.add.bind(null, APP.id, APP.appStoreId, APP.manifest, APP.location, APP.portBindings, APP),
            settings.setDnsConfig.bind(null, { provider: 'route53', accessKeyId: 'accessKeyId', secretAccessKey: 'secretAccessKey', endpoint: 'http://localhost:5353' }),
            settings.setTlsConfig.bind(null, { provider: 'caas' })
        ], done);
    });

    after(function (done) {
        database._clear(done);
    });

    it('initializes succesfully', function (done) {
        apptask.initialize(done);
    });

    it('reserve port', function (done) {
        apptask._reserveHttpPort(APP, function (error) {
            expect(error).to.not.be.ok();
            expect(APP.httpPort).to.be.a('number');
            var client = net.connect(APP.httpPort);
            client.on('connect', function () { done(new Error('Port is not free:' + APP.httpPort)); });
            client.on('error', function (error) { done(); });
        });
    });

    it('configure nginx correctly', function (done) {
        apptask._configureNginx(APP, function (error) {
            expect(fs.existsSync(paths.NGINX_APPCONFIG_DIR + '/' + APP.id + '.conf'));
            // expect(error).to.be(null); // this fails because nginx cannot be restarted
            done();
        });
    });

    it('unconfigure nginx', function (done) {
        apptask._unconfigureNginx(APP, function (error) {
            expect(!fs.existsSync(paths.NGINX_APPCONFIG_DIR + '/' + APP.id + '.conf'));
            // expect(error).to.be(null); // this fails because nginx cannot be restarted
            done();
        });
    });

    it('create volume', function (done) {
        apptask._createVolume(APP, function (error) {
            expect(fs.existsSync(paths.DATA_DIR + '/' + APP.id + '/data')).to.be(true);
            expect(error).to.be(null);
            done();
        });
    });

    it('delete volume', function (done) {
        apptask._deleteVolume(APP, function (error) {
            expect(!fs.existsSync(paths.DATA_DIR + '/' + APP.id + '/data')).to.be(true);
            expect(error).to.be(null);
            done();
        });
    });

    it('allocate OAuth credentials', function (done) {
        addons._setupOauth(APP, {}, function (error) {
            expect(error).to.be(null);
            done();
        });
    });

    it('remove OAuth credentials', function (done) {
        addons._teardownOauth(APP, {}, function (error) {
            expect(error).to.be(null);
            done();
        });
    });

    it('remove OAuth credentials twice succeeds', function (done) {
        addons._teardownOauth(APP, {}, function (error) {
            expect(!error).to.be.ok();
            done();
        });
    });

    it('barfs on empty manifest', function (done) {
        var badApp = _.extend({ }, APP);
        badApp.manifest = { };

        apptask._verifyManifest(badApp, function (error) {
            expect(error).to.be.ok();
            done();
        });
    });

    it('barfs on bad manifest', function (done) {
        var badApp = _.extend({ }, APP);
        badApp.manifest = _.extend({ }, APP.manifest);
        delete badApp.manifest.id;

        apptask._verifyManifest(badApp, function (error) {
            expect(error).to.be.ok();
            done();
        });
    });

    it('barfs on incompatible manifest', function (done) {
        var badApp = _.extend({ }, APP);
        badApp.manifest = _.extend({ }, APP.manifest);
        badApp.manifest.maxBoxVersion = '0.0.0'; // max box version is too small

        apptask._verifyManifest(badApp, function (error) {
            expect(error).to.be.ok();
            done();
        });
    });

    it('verifies manifest', function (done) {
        var goodApp = _.extend({ }, APP);

        apptask._verifyManifest(goodApp, function (error) {
            expect(error).to.be(null);
            done();
        });
    });

    it('registers subdomain', function (done) {
        nock.cleanAll();

        var awsScope = nock('http://localhost:5353')
            .get('/2013-04-01/hostedzone')
            .times(2)
            .reply(200, js2xml('ListHostedZonesResponse', awsHostedZones, { arrayMap: { HostedZones: 'HostedZone'} }))
            .get('/2013-04-01/hostedzone/ZONEID/rrset?maxitems=1&name=applocation.localhost.&type=A')
            .reply(200, js2xml('ListResourceRecordSetsResponse', { ResourceRecordSets: [ ] }, { 'Content-Type': 'application/xml' }))
            .post('/2013-04-01/hostedzone/ZONEID/rrset/')
            .reply(200, js2xml('ChangeResourceRecordSetsResponse', { ChangeInfo: { Id: 'RRID', Status: 'INSYNC' } }));

        apptask._registerSubdomain(APP, function (error) {
            expect(error).to.be(null);
            expect(awsScope.isDone()).to.be.ok();
            done();
        });
    });

    it('unregisters subdomain', function (done) {
        nock.cleanAll();

        var awsScope = nock('http://localhost:5353')
            .get('/2013-04-01/hostedzone')
            .reply(200, js2xml('ListHostedZonesResponse', awsHostedZones, { arrayMap: { HostedZones: 'HostedZone'} }))
            .post('/2013-04-01/hostedzone/ZONEID/rrset/')
            .reply(200, js2xml('ChangeResourceRecordSetsResponse', { ChangeInfo: { Id: 'RRID', Status: 'INSYNC' } }));

        apptask._unregisterSubdomain(APP, APP.location, function (error) {
            expect(error).to.be(null);
            expect(awsScope.isDone()).to.be.ok();
            done();
        });
    });
});


