/* jslint node:true */

'use strict';

var ejs = require('gulp-ejs'),
    gulp = require('gulp'),
    del = require('del'),
    concat = require('gulp-concat'),
    uglify = require('gulp-uglify'),
    serve = require('gulp-serve'),
    sass = require('gulp-sass'),
    sourcemaps = require('gulp-sourcemaps'),
    cssnano = require('gulp-cssnano'),
    autoprefixer = require('gulp-autoprefixer'),
    argv = require('yargs').argv;

gulp.task('3rdparty', function () {
    gulp.src([
        'webadmin/src/3rdparty/**/*.js',
        'webadmin/src/3rdparty/**/*.map',
        'webadmin/src/3rdparty/**/*.css',
        'webadmin/src/3rdparty/**/*.otf',
        'webadmin/src/3rdparty/**/*.eot',
        'webadmin/src/3rdparty/**/*.svg',
        'webadmin/src/3rdparty/**/*.gif',
        'webadmin/src/3rdparty/**/*.ttf',
        'webadmin/src/3rdparty/**/*.woff',
        'webadmin/src/3rdparty/**/*.woff2'
        ])
        .pipe(gulp.dest('webadmin/dist/3rdparty/'))
        .pipe(gulp.dest('setup/splash/website/3rdparty'));

    gulp.src('node_modules/bootstrap-sass/assets/javascripts/bootstrap.min.js')
        .pipe(gulp.dest('webadmin/dist/3rdparty/js'))
        .pipe(gulp.dest('setup/splash/website/3rdparty/js'));
});


// --------------
// JavaScript
// --------------

gulp.task('js', ['js-index', 'js-setup', 'js-update'], function () {});

var oauth = {
    clientId: argv.clientId || 'cid-webadmin',
    clientSecret: argv.clientSecret || 'unused',
    apiOrigin: argv.apiOrigin || ''
};

console.log();
console.log('Using OAuth credentials:');
console.log(' ClientId:     %s', oauth.clientId);
console.log(' ClientSecret: %s', oauth.clientSecret);
console.log(' Cloudron API: %s', oauth.apiOrigin || 'default');
console.log();

gulp.task('js-index', function () {
    gulp.src([
        'webadmin/src/js/index.js',
        'webadmin/src/js/client.js',
        'webadmin/src/js/appstore.js',
        'webadmin/src/js/main.js',
        'webadmin/src/views/*.js'
        ])
        .pipe(ejs({ oauth: oauth }, { ext: '.js' }))
        .pipe(sourcemaps.init())
        .pipe(concat('index.js', { newLine: ';' }))
        .pipe(uglify())
        .pipe(sourcemaps.write())
        .pipe(gulp.dest('webadmin/dist/js'));
});

gulp.task('js-setup', function () {
    gulp.src(['webadmin/src/js/setup.js', 'webadmin/src/js/client.js'])
        .pipe(ejs({ oauth: oauth }, { ext: '.js' }))
        .pipe(sourcemaps.init())
        .pipe(concat('setup.js', { newLine: ';' }))
        .pipe(uglify())
        .pipe(sourcemaps.write())
        .pipe(gulp.dest('webadmin/dist/js'));
});

gulp.task('js-update', function () {
    gulp.src(['webadmin/src/js/update.js'])
        .pipe(sourcemaps.init())
        .pipe(uglify())
        .pipe(sourcemaps.write())
        .pipe(gulp.dest('webadmin/dist/js'))
        .pipe(gulp.dest('setup/splash/website/js'));
});


// --------------
// HTML
// --------------

gulp.task('html', ['html-views', 'html-update', 'html-templates'], function () {
    return gulp.src('webadmin/src/*.html').pipe(gulp.dest('webadmin/dist'));
});

gulp.task('html-update', function () {
    return gulp.src(['webadmin/src/update.html']).pipe(gulp.dest('setup/splash/website'));
});

gulp.task('html-views', function () {
    return gulp.src('webadmin/src/views/**/*.html').pipe(gulp.dest('webadmin/dist/views'));
});

gulp.task('html-templates', function () {
    return gulp.src('webadmin/src/templates/**/*.html').pipe(gulp.dest('webadmin/dist/templates'));
});

// --------------
// CSS
// --------------

gulp.task('css', function () {
    return gulp.src('webadmin/src/*.scss')
        .pipe(sourcemaps.init())
        .pipe(sass({ includePaths: ['node_modules/bootstrap-sass/assets/stylesheets/'] }).on('error', sass.logError))
        .pipe(autoprefixer())
        .pipe(cssnano())
        .pipe(sourcemaps.write())
        .pipe(gulp.dest('webadmin/dist'))
        .pipe(gulp.dest('setup/splash/website'));
});

gulp.task('images', function () {
    return gulp.src('webadmin/src/img/**')
        .pipe(gulp.dest('webadmin/dist/img'));
});

// --------------
// Utilities
// --------------

gulp.task('watch', ['default'], function () {
    gulp.watch(['webadmin/src/*.scss'], ['css']);
    gulp.watch(['webadmin/src/img/*'], ['images']);
    gulp.watch(['webadmin/src/**/*.html'], ['html']);
    gulp.watch(['webadmin/src/views/*.html'], ['html-views']);
    gulp.watch(['webadmin/src/templates/*.html'], ['html-templates']);
    gulp.watch(['webadmin/src/js/update.js'], ['js-update']);
    gulp.watch(['webadmin/src/js/setup.js', 'webadmin/src/js/client.js'], ['js-setup']);
    gulp.watch(['webadmin/src/js/index.js', 'webadmin/src/js/client.js', 'webadmin/src/js/appstore.js', 'webadmin/src/js/main.js', 'webadmin/src/views/*.js'], ['js-index']);
    gulp.watch(['webadmin/src/3rdparty/**/*'], ['3rdparty']);
});

gulp.task('clean', function () {
    del.sync(['webadmin/dist', 'setup/splash/website']);
});

gulp.task('default', ['clean', 'html', 'js', '3rdparty', 'images', 'css'], function () {});

gulp.task('develop', ['watch'], serve({ root: 'webadmin/dist', port: 4000 }));
