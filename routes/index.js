const express = require('express');
const router = express.Router();
const appsController = require('../controllers/apps');
const usersController = require('../controllers/users');
const sessAuthController = require('../controllers/sessAuth');
const apiAuthController =  require('../controllers/apiAuth');
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

// Homepage
router.get('/', function(req, res, next) {
  res.redirect('/apps');
});

// Authentication
const authenticator = passport.authenticate('local', { failureRedirect: '/login' });
router.get('/login', sessAuthController.loginForm);
router.get('/logout', sessAuthController.logout);
router.post('/login', authenticator, sessAuthController.login);
router.post('/api/login', apiAuthController.login);

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