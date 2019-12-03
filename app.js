var createError = require('http-errors');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
var sassMiddleware = require('node-sass-middleware');
var expressHandlebars = require('express-handlebars');

const env = process.env.NODE_ENV || 'development';

if (env === 'development') {
  require('dotenv').config();
}

var indexRouter = require('./routes/index');

var app = express();

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'hbs');
app.engine('.hbs', expressHandlebars({
  extname: '.hbs',
  layoutsDir: './views',
  defaultLayout: 'layout',
  helpers: require('./lib/HandlebarsHelpers')
}));

// logger setup
app.use(logger('dev'));

// parsing setup
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// stylesheet setup
app.use(sassMiddleware({
  src: path.join(__dirname, 'public'),
  dest: path.join(__dirname, 'public'),
  indentedSyntax: true, // true = .sass and false = .scss
  sourceMap: true
}));
app.use(express.static(path.join(__dirname, 'public')));

app.use('/', indexRouter);

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  next(createError(404));
});

// error handler
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});

module.exports = app;
