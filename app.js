var createError = require('http-errors');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
var sassMiddleware = require('node-sass-middleware');
var expressHandlebars = require('express-handlebars');
const passport = require('passport');
const session = require('express-session');
const redis = require('redis');
const RedisStore = require('connect-redis')(session);
const bcrypt = require('bcrypt');
const Strategy = require('passport-local').Strategy;
const User = require('./server/models').User;
const jwt = require('json-web-token');

const env = process.env.NODE_ENV || 'development';

if (env === 'development') {
  require('dotenv').config();
}

var indexRouter = require('./routes/index');


var app = express();

// passport setup
const JwtStrategy = require('passport-jwt').Strategy;
const ExtractJwt = require('passport-jwt').ExtractJwt;

const jwtOpts = {
  jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
  secretOrKey: 'secret',
  passReqToCallback: true,
}

passport.use(new JwtStrategy(jwtOpts, function(req, jwt_payload, done) {
  const authHeader = req.header('Authorization');
  const rawToken = authHeader ? authHeader.split(' ')[1] : '';

  User.findByPk(jwt_payload.userId)
    .then(user => {
      if (user && user.tokens.includes(rawToken)) {
        return done(null, user);
      } else {
        done(null, false);
      }
    })
    .catch(err => {
      console.log(err);
      done(err, false)
    });
}));

passport.use(
  new Strategy(function(username, password, cb) {
    User.findAll({ where: { username: username }, })
      .then(user => {
        user = user[0];
        if (!user) { return cb(null, false); }

        if (!bcrypt.compareSync(password, user.password)) {
          return cb(null, false);
        }

        return cb(null, user);
      })
      .catch(err => {
        return cb(err);
      })
  })
);

passport.serializeUser(function(user, cb) {
  cb(null, user.id);
});

passport.deserializeUser(function(id, cb) {
  User.findByPk(id)
    .then(user  => cb(null, user))
    .catch(err => cb(err));
});

const redisClient = redis.createClient(6379, process.env.REDIS_HOST);

app.use(session({
  store: new RedisStore({ client: redisClient }),
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
}));
app.use(passport.initialize());
app.use(passport.session());

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'hbs');
app.engine('.hbs', expressHandlebars({
  extname: '.hbs',
  layoutsDir: './views',
  defaultLayout: 'layout-internal',
  partialsDir: './views/partials/',
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
