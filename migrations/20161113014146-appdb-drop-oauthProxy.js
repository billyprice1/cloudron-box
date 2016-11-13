var dbm = global.dbm || require('db-migrate');
var type = dbm.dataType;

exports.up = function(db, callback) {
    db.runSql('ALTER TABLE apps DROP COLUMN oauthProxy', function (error) {
        if (error) console.error(error);
        callback(error);
    });
};

exports.down = function(db, callback) {
    db.runSql('ALTER TABLE apps ADD COLUMN oauthProxy BOOLEAN DEFAULT 0', function (error) {
        if (error) console.error(error);
        callback(error);
    });
};
