const express = require('express');
const router = express.Router();
const appsController = require('../controllers/apps');
const usersController = require('../controllers/users');
const multer  = require('multer');
const fs = require('fs');
const uuid = require('uuid/v1');
const stream = require('stream');
const util = require('util');
const WebSocket = require('ws');
const passport = require('passport');
const bcrypt = require('bcrypt');
const jwt = require('json-web-token');

const eventLogger = require('../lib/EventLogger');
const spawn = require('child_process').spawn;

const DockerWrapper = require('../lib/DockerWrapper');
const App = require('../server/models').App;
const User = require('../server/models').User;

const storage = multer.diskStorage({
  // TODO: validate that the file is a zip
  destination: (req, file, cb) => {
    const directoryName = `./tmp/`;
    cb(null, directoryName);
  },
  filename: (req, file, cb) => {
    cb(null, uuid());
  }
});

const upload = multer({storage});

// Authentication middleware
router.use(function(req, res, next) {
  if (req.path === '/api/login' || req.path === '/login') {
    next();
  } else if (req.path.match(/^\/api.*/)) {
    passport.authenticate('jwt', { session: false })(req, res, next);
  } else {
    if (!req.isAuthenticated()) {
      return res.redirect('/login');
    } else {
      next();
    }
  }
});

// Get user middleware
router.use(async(req, res, next) => {
  if (req.user) {
    res.locals.userIsAdmin = req.user.role === 'admin';
  }

  next();
});

// Authorization middlware
router.use(async(req, res, next) => {
  // users routes require admin priveleges
  if (req.path.match(/^\/users.*/)) {
    try {
      if (req.user && req.user.role === 'admin') {
        next(); 
      } else {
        res.redirect('/apps');
      }
    } catch(err) {
      res.redirect('/apps');
      res.end();
    }
  } else {
    next();
  }
});

// Login
router.get('/login', (req, res) =>  {
  res.render('login')
});

router.post(
  '/login',
  passport.authenticate('local', { failureRedirect: '/login', }),
  (req, res) => res.redirect('/')
);

router.post('/api/login', (req, res) => {
  User.findAll({ where: { username: req.body.username }, })
    .then(user => {
      user = user[0];
      if (!user) {
        res.set('WWW-Authenticate', 'Bearer');
        return res.status(401).send(); 
      }

      if (!bcrypt.compareSync(req.body.password, user.password)) {
        res.set('WWW-Authenticate', 'Bearer');
        return res.status(401).send();
      }

      if (user.tokens.length > 0) {
        res.status(200).send(user.tokens[0]);
      } else {
        jwt.encode('secret', { userId: user.id }, (err, token) => {
          user.update({ tokens: user.tokens.concat(token) })
            .then(() => res.status(200).send(token));
        });
      }
    })
    .catch(err => {
      console.log(err);
      return res.status(500).send(
        JSON.stringify({ message: 'Something went wrong, try again' })
      );
    });
});

router.get('/api/test',
  function (req, res) {
    res.status(200).send('authenticated');
  }
);

router.get('/logout', (req, res) => {
  req.logout();
  res.redirect('/login');
});

// Homepage
router.get('/', function(req, res, next) {
  res.redirect('/apps');
});

// Event Streaming
router.get('/events/:appId', eventLogger.appEvents);

// User
router.get('/users', usersController.list);
router.get('/users/new', usersController.new);
router.get('/users/:userId/edit', usersController.edit);
router.post('/users', usersController.create);
router.post('/users/:userId/delete', usersController.delete);
router.post('/users/:userId', usersController.update);

// App
router.get('/apps', appsController.list);
router.get('/apps/new', appsController.new);
router.get('/apps/:appId', appsController.show);
router.get('/apps/:appId/delete', appsController.delete);
router.post('/apps', appsController.create);
router.post('/apps/:appId/deploy', upload.single('file'), appsController.deploy);
router.post('/apps', upload.single('file'), appsController.create);
router.post('/apps/:appId/delete', appsController.destroy);
router.post('/apps/:appId/database', upload.single('file'), appsController.createDatabase);
router.post('/apps/:appId/env', appsController.updateEnvVar);
router.post('/apps/:appId/scale', appsController.updateReplicas);

module.exports = router;