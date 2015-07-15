'use strict';

exports = module.exports = {
    initialize: initialize,
    uninitialize: uninitialize
};


var assert = require('assert'),
    backups = require('./backups.js'),
    cloudron = require('./cloudron.js'),
    CronJob = require('cron').CronJob,
    debug = require('debug')('box:cron'),
    settings = require('./settings.js'),
    updater = require('./updater.js');

var gAutoupdaterJob = null,
    gUpdateCheckerJob = null,
    gHeartbeatJob = null,
    gBackupJob = null;

var gInitialized = false;

// cron format
// Seconds: 0-59
// Minutes: 0-59
// Hours: 0-23
// Day of Month: 1-31
// Months: 0-11
// Day of Week: 0-6

function initialize(callback) {
    assert.strictEqual(typeof callback, 'function');

    if (gInitialized) return callback();

    settings.events.on(settings.TIME_ZONE_KEY, recreateJobs);
    settings.events.on(settings.AUTOUPDATE_PATTERN_KEY, autoupdatePatternChanged);

    gInitialized = true;

    recreateJobs(callback);
}

function recreateJobs(unusedTimeZone, callback) {
    if (typeof unusedTimeZone === 'function') callback = unusedTimeZone;

    settings.getAll(function (error, allSettings) {
        if (gHeartbeatJob) gHeartbeatJob.stop();
        gHeartbeatJob = new CronJob({
            cronTime: '00 */1 * * * *', // every minute
            onTick: cloudron.sendHeartbeat,
            start: true,
            timeZone: allSettings[settings.TIME_ZONE_KEY]
        });

        if (gBackupJob) gBackupJob.stop();
        gBackupJob = new CronJob({
            cronTime: '00 00 */4 * * *', // every 4 hours
            onTick: cloudron.ensureBackup,
            start: true,
            timeZone: allSettings[settings.TIME_ZONE_KEY]
        });

        if (gUpdateCheckerJob) gUpdateCheckerJob.stop();
        gUpdateCheckerJob = new CronJob({
            cronTime: '00 */10 * * * *', // every 10 minutes
            onTick: updater.checkUpdates,
            start: true,
            timeZone: allSettings[settings.TIME_ZONE_KEY]
        });

        autoupdatePatternChanged(allSettings[settings.AUTOUPDATE_PATTERN_KEY]);

        if (callback) callback();
    });
}

function autoupdatePatternChanged(pattern) {
    assert.strictEqual(typeof pattern, 'string');

    debug('Auto update pattern changed to %s', pattern);

    if (gAutoupdaterJob) gAutoupdaterJob.stop();

    if (pattern === 'never') return;

    gAutoupdaterJob = new CronJob({
        cronTime: pattern,
        onTick: function() {
            debug('Starting autoupdate');
            updater.autoupdate();
        },
        start: true,
        timeZone: gUpdateCheckerJob.cronTime.timeZone // hack
    });
}

function uninitialize(callback) {
    assert.strictEqual(typeof callback, 'function');

    if (!gInitialized) return callback();

    if (gAutoupdaterJob) gAutoupdaterJob.stop();
    gAutoupdaterJob = null;

    gUpdateCheckerJob.stop();
    gUpdateCheckerJob = null;

    gHeartbeatJob.stop();
    gHeartbeatJob = null;

    gBackupJob.stop();
    gBackupJob = null;

    gInitialized = false;

    callback();
}

