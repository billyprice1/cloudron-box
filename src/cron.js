'use strict';

exports = module.exports = {
    initialize: initialize,
    uninitialize: uninitialize
};

var apps = require('./apps.js'),
    assert = require('assert'),
    backups = require('./backups.js'),
    certificates = require('./certificates.js'),
    cloudron = require('./cloudron.js'),
    config = require('./config.js'),
    CronJob = require('cron').CronJob,
    debug = require('debug')('box:cron'),
    eventlog = require('./eventlog.js'),
    janitor = require('./janitor.js'),
    scheduler = require('./scheduler.js'),
    settings = require('./settings.js'),
    updateChecker = require('./updatechecker.js');

var gAutoupdaterJob = null,
    gBoxUpdateCheckerJob = null,
    gAppUpdateCheckerJob = null,
    gHeartbeatJob = null,
    gAliveJob = null,
    gBackupJob = null,
    gCleanupTokensJob = null,
    gCleanupBackupsJob = null,
    gDockerVolumeCleanerJob = null,
    gSchedulerSyncJob = null,
    gCertificateRenewJob = null,
    gCheckDiskSpaceJob = null,
    gCleanupEventlogJob = null;

var NOOP_CALLBACK = function (error) { if (error) console.error(error); };
var AUDIT_SOURCE = { userId: null, username: 'cron' };

// cron format
// Seconds: 0-59
// Minutes: 0-59
// Hours: 0-23
// Day of Month: 1-31
// Months: 0-11
// Day of Week: 0-6

function initialize(callback) {
    assert.strictEqual(typeof callback, 'function');

    gHeartbeatJob = new CronJob({
        cronTime: '00 */1 * * * *', // every minute
        onTick: cloudron.sendHeartbeat,
        start: true
    });
    cloudron.sendHeartbeat(); // latest unpublished version of CronJob has runOnInit

    gAliveJob = new CronJob({
        cronTime: '00 23 * * * *', // every hour on a somewhat odd 23 minute after full probably should be randomly spread out over a day?
        onTick: cloudron.sendAliveStatus,
        start: true
    });

    if (cloudron.isConfiguredSync()) {
        recreateJobs(callback);
    } else {
        cloudron.events.on(cloudron.EVENT_ACTIVATED, recreateJobs);
        callback();
    }
}

function recreateJobs(unusedTimeZone, callback) {
    if (typeof unusedTimeZone === 'function') callback = unusedTimeZone;

    settings.getAll(function (error, allSettings) {
        debug('Creating jobs with timezone %s', allSettings[settings.TIME_ZONE_KEY]);

        if (gBackupJob) gBackupJob.stop();
        gBackupJob = new CronJob({
            cronTime: '00 00 */4 * * *', // every 4 hours. backups.ensureBackup() will only trigger a backup once per day
            onTick: backups.ensureBackup.bind(null, AUDIT_SOURCE, NOOP_CALLBACK),
            start: true,
            timeZone: allSettings[settings.TIME_ZONE_KEY]
        });

        if (gCheckDiskSpaceJob) gCheckDiskSpaceJob.stop();
        gCheckDiskSpaceJob = new CronJob({
            cronTime: '00 30 */4 * * *', // every 4 hours
            onTick: cloudron.checkDiskSpace,
            start: true,
            timeZone: allSettings[settings.TIME_ZONE_KEY]
        });

        if (gBoxUpdateCheckerJob) gBoxUpdateCheckerJob.stop();
        gBoxUpdateCheckerJob = new CronJob({
            cronTime: '00 */10 * * * *', // every 10 minutes
            onTick: updateChecker.checkBoxUpdates,
            start: true,
            timeZone: allSettings[settings.TIME_ZONE_KEY]
        });

        if (gAppUpdateCheckerJob) gAppUpdateCheckerJob.stop();
        gAppUpdateCheckerJob = new CronJob({
            cronTime: '00 */10 * * * *', // every 10 minutes
            onTick: updateChecker.checkAppUpdates,
            start: true,
            timeZone: allSettings[settings.TIME_ZONE_KEY]
        });

        if (gCleanupTokensJob) gCleanupTokensJob.stop();
        gCleanupTokensJob = new CronJob({
            cronTime: '00 */30 * * * *', // every 30 minutes
            onTick: janitor.cleanupTokens,
            start: true,
            timeZone: allSettings[settings.TIME_ZONE_KEY]
        });

        if (gCleanupBackupsJob) gCleanupBackupsJob.stop();
        gCleanupBackupsJob = new CronJob({
            cronTime: '00 */30 * * * *', // every 30 minutes
            onTick: janitor.cleanupBackups,
            start: true,
            timeZone: allSettings[settings.TIME_ZONE_KEY]
        });

        if (gCleanupEventlogJob) gCleanupEventlogJob.stop();
        gCleanupEventlogJob = new CronJob({
            cronTime: '00 */30 * * * *', // every 30 minutes
            onTick: eventlog.cleanup,
            start: true,
            timeZone: allSettings[settings.TIME_ZONE_KEY]
        });

        if (gDockerVolumeCleanerJob) gDockerVolumeCleanerJob.stop();
        gDockerVolumeCleanerJob = new CronJob({
            cronTime: '00 00 */12 * * *', // every 12 hours
            onTick: janitor.cleanupDockerVolumes,
            start: true,
            timeZone: allSettings[settings.TIME_ZONE_KEY]
        });

        if (gSchedulerSyncJob) gSchedulerSyncJob.stop();
        gSchedulerSyncJob = new CronJob({
            cronTime: config.TEST ? '*/10 * * * * *' : '00 */1 * * * *', // every minute
            onTick: scheduler.sync,
            start: true,
            timeZone: allSettings[settings.TIME_ZONE_KEY]
        });

        if (gCertificateRenewJob) gCertificateRenewJob.stop();
        gCertificateRenewJob = new CronJob({
            cronTime: '00 00 */12 * * *', // every 12 hours
            onTick: certificates.renewAll.bind(null, AUDIT_SOURCE, NOOP_CALLBACK),
            start: true,
            timeZone: allSettings[settings.TIME_ZONE_KEY]
        });

        settings.events.removeListener(settings.AUTOUPDATE_PATTERN_KEY, autoupdatePatternChanged);
        settings.events.on(settings.AUTOUPDATE_PATTERN_KEY, autoupdatePatternChanged);
        autoupdatePatternChanged(allSettings[settings.AUTOUPDATE_PATTERN_KEY]);

        settings.events.removeListener(settings.TIME_ZONE_KEY, recreateJobs);
        settings.events.on(settings.TIME_ZONE_KEY, recreateJobs);

        if (callback) callback();
    });
}

function autoupdatePatternChanged(pattern) {
    assert.strictEqual(typeof pattern, 'string');
    assert(gBoxUpdateCheckerJob);

    debug('Auto update pattern changed to %s', pattern);

    if (gAutoupdaterJob) gAutoupdaterJob.stop();

    if (pattern === 'never') return;

    gAutoupdaterJob = new CronJob({
        cronTime: pattern,
        onTick: function() {
            var updateInfo = updateChecker.getUpdateInfo();
            if (updateInfo.box) {
                debug('Starting autoupdate to %j', updateInfo.box);
                cloudron.updateToLatest(AUDIT_SOURCE, NOOP_CALLBACK);
            } else if (updateInfo.apps) {
                debug('Starting app update to %j', updateInfo.apps);
                apps.updateApps(updateInfo.apps, AUDIT_SOURCE, NOOP_CALLBACK);
            } else {
                debug('No auto updates available');
            }
        },
        start: true,
        timeZone: gBoxUpdateCheckerJob.cronTime.zone // hack
    });
}

function uninitialize(callback) {
    assert.strictEqual(typeof callback, 'function');

    cloudron.events.removeListener(cloudron.EVENT_ACTIVATED, recreateJobs);

    settings.events.removeListener(settings.TIME_ZONE_KEY, recreateJobs);
    settings.events.removeListener(settings.AUTOUPDATE_PATTERN_KEY, autoupdatePatternChanged);

    if (gAutoupdaterJob) gAutoupdaterJob.stop();
    gAutoupdaterJob = null;

    if (gBoxUpdateCheckerJob) gBoxUpdateCheckerJob.stop();
    gBoxUpdateCheckerJob = null;

    if (gAppUpdateCheckerJob) gAppUpdateCheckerJob.stop();
    gAppUpdateCheckerJob = null;

    if (gHeartbeatJob) gHeartbeatJob.stop();
    gHeartbeatJob = null;

    if (gAliveJob) gAliveJob.stop();
    gAliveJob = null;

    if (gBackupJob) gBackupJob.stop();
    gBackupJob = null;

    if (gCleanupTokensJob) gCleanupTokensJob.stop();
    gCleanupTokensJob = null;

    if (gCleanupBackupsJob) gCleanupBackupsJob.stop();
    gCleanupBackupsJob = null;

    if (gCleanupEventlogJob) gCleanupEventlogJob.stop();
    gCleanupEventlogJob = null;

    if (gDockerVolumeCleanerJob) gDockerVolumeCleanerJob.stop();
    gDockerVolumeCleanerJob = null;

    if (gSchedulerSyncJob) gSchedulerSyncJob.stop();
    gSchedulerSyncJob = null;

    if (gCertificateRenewJob) gCertificateRenewJob.stop();
    gCertificateRenewJob = null;

    callback();
}
