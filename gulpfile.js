'use strict';

var connectLr         = require('connect-livereload'),
    express           = require('express'),
    app               = express(),
    expressPort       = 4000,
    expressRoot       = require('path').resolve('./.tmp'),
    gulp              = require('gulp'),
    liveReloadPort    = 35729,
    lrServer          = require('tiny-lr')(),
    permitIndexReload = true,
    plugins           = require('gulp-load-plugins')(),
    publicDir         = require('path').resolve('../server/public'),
    source            = require('vinyl-source-stream'),
    watchify          = require('watchify');

function startExpress() {
  app.use(connectLr());
  app.use(express.static(expressRoot));
  app.listen(expressPort);
}

function startLiveReload() {
  lrServer.listen(liveReloadPort, function(err) {
    if (err) {
      return console.log(err);
    }
  });
}

function notifyLivereload(fileName) {
  if (fileName !== 'index.html' || permitIndexReload) {
    lrServer.changed({ body: { files: [fileName] } });

    if (fileName === 'index.html') {
      permitIndexReload = false;
      setTimeout(function() { permitIndexReload = true; }, 5000);
    }
  }
}

function clean(relativePath, cb) {
  plugins.util.log('Cleaning: ' + plugins.util.colors.blue(relativePath));

  gulp
    .src([(publicDir + relativePath), (expressRoot + relativePath)], {read: false})
    .pipe(plugins.rimraf({force: true}))
    .on('end', cb || function() {});
}

function scripts(cb) {
  var bundler = watchify('./app/scripts/index.js');

  function rebundle() {
    clean('/scripts/app*.js', function() {
      plugins.util.log('Rebuilding application JS bundle');

      return bundler.bundle({ debug: true })
        .pipe(source('app.js'))
        .pipe(gulp.dest(expressRoot + '/scripts'))
        .pipe(plugins.streamify(plugins.uglify({ mangle: false })))
        .pipe(plugins.streamify(plugins.size({ showFiles: true })))
        .pipe(gulp.dest(publicDir + '/scripts'))
        .on('end', cb || function() {})
        .on('error', plugins.util.log);
    });
  }

  bundler.on('update', rebundle);
  bundler.on('error', plugins.util.log);
  rebundle();
}

function styles(cb) {
  clean('/styles/app*.css', function() {
    plugins.util.log('Rebuilding application styles');

    gulp.src('app/styles/app.scss')
      .pipe(plugins.plumber())
      .pipe(plugins.sass({
        includePaths: ['app/bower_components'],
        sourceComments: 'map'
      }))
      .pipe(gulp.dest(expressRoot + '/styles'))
      .pipe(plugins.minifyCss())
      .pipe(plugins.streamify(plugins.rev()))
      .pipe(plugins.size({ showFiles: true }))
      .pipe(gulp.dest(publicDir + '/styles'))
      .on('end', cb || function() {})
      .on('error', plugins.util.log);
  });
}

function templates(cb) {
  clean('/scripts/templates*.js', function() {
    plugins.util.log('Rebuilding templates');

    gulp.src('app/views/**/*.html')
      .pipe(plugins.angularTemplatecache({
        root:   'views/',
        module: 'clientApp'
      }))
      .pipe(plugins.streamify(plugins.rev()))
      .pipe(gulp.dest(expressRoot + '/scripts'))
      .pipe(gulp.dest(publicDir + '/scripts'))
      .on('end', cb || function() {})
      .on('error', plugins.util.log);
  });
}

function shims(cb) {
  clean('/scripts/shims*.js', function() {
    plugins.util.log('Rebuilding shims JS bundle');

    gulp.src(require('./app/scripts/shims'))
      .pipe(plugins.concat('shims.js'))
      .pipe(plugins.streamify(plugins.uglify({ mangle: false })))
      .pipe(plugins.streamify(plugins.rev()))
      .pipe(plugins.size({ showFiles: true }))
      .pipe(gulp.dest(expressRoot + '/scripts'))
      .pipe(gulp.dest(publicDir + '/scripts'))
      .on('end', cb || function() {})
      .on('error', plugins.util.log);
  });
}

function vendor(cb) {
  clean('/scripts/vendor*.js', function() {
    plugins.util.log('Rebuilding vendor JS bundle');

    gulp.src(require('./app/scripts/vendor'))
      .pipe(plugins.concat('vendor.js'))
      .pipe(plugins.streamify(plugins.uglify({ mangle: false })))
      .pipe(plugins.streamify(plugins.rev()))
      .pipe(plugins.size({ showFiles: true }))
      .pipe(gulp.dest(expressRoot + '/scripts'))
      .pipe(gulp.dest(publicDir + '/scripts'))
      .on('end', cb || function() {})
      .on('error', plugins.util.log);
  });
}

function images(cb) {
  clean('/images', function() {
    plugins.util.log('Minifying images');

    gulp.src('app/images/**/*.*')
      .pipe(plugins.imagemin())
      .pipe(plugins.size({ showFiles: true }))
      .pipe(gulp.dest(expressRoot + '/images'))
      .pipe(gulp.dest(publicDir + '/images'))
      .on('end', cb || function() {})
      .on('error', plugins.util.log);
  });
}

function fonts(cb) {
  clean('/styles/fonts/icons', function() {
    plugins.util.log('Copying fonts');

    gulp.src('app/styles/fonts/icons/*.*')
      .pipe(gulp.dest(publicDir + '/styles/fonts/icons'))
      .pipe(gulp.dest(expressRoot + '/styles/fonts/icons'))
      .on('end', cb || function() {})
      .on('error', plugins.util.log);
  });
}

function indexHtml(cb) {
  plugins.util.log('Rebuilding index.html');

  function inject(glob, path, tag) {
    return plugins.inject(
      gulp.src(glob, {
        cwd: path
      }), {
        starttag: '<!-- inject:' + tag + ':{{ext}} -->'
      }
    );
  }

  function buildIndex(path, cb) {
    gulp.src('app/index.html')
      .pipe(inject('./styles/app*.css', path, 'app-style'))
      .pipe(inject('./scripts/shim*.js', path, 'shim'))
      .pipe(inject('./scripts/vendor*.js', path, 'vendor'))
      .pipe(inject('./scripts/app*.js', path, 'app'))
      .pipe(inject('./scripts/templates*.js', path, 'templates'))
      .pipe(gulp.dest(path))
      .on('end', cb || function() {})
      .on('error', plugins.util.log);
  }

  buildIndex(expressRoot, cb || function(){});
  buildIndex(publicDir, function(){});
}

gulp.task('vendor', function () {
  vendor(indexHtml);
});

gulp.task('default', function () {
  startExpress();
  startLiveReload();
  fonts();
  images();
  styles(indexHtml);
  templates(indexHtml);
  shims(indexHtml);
  scripts(function() {
    indexHtml(function() {
      notifyLivereload('index.html');
    });
  });

  gulp.watch('app/scripts/shims.js', function() {
    shims(function() {
      indexHtml(function() {
        notifyLivereload('index.html');
      });
    });
  });

  gulp.watch(['app/styles/**/*', '!app/styles/fonts/**/*'], function() {
    styles(function() {
      indexHtml(function() {
        notifyLivereload('styles/app.css');
      });
    });
  });

  gulp.watch('app/styles/fonts/**/*', function() {
    fonts(function() {
      styles(function() {
        indexHtml(function() {
          notifyLivereload('styles/app.css');
        });
      });
    });
  });

  gulp.watch('app/images/**/*', function() {
    images(function() {
      indexHtml(function() {
        notifyLivereload('index.html');
      });
    });
  });

  gulp.watch('app/views/**/*', function() {
    templates(function() {
      indexHtml(function() {
        notifyLivereload('index.html');
      });
    });
  });

  gulp.watch('app/index.html', function() {
    indexHtml(function() {
      notifyLivereload('index.html');
    });
  });
});