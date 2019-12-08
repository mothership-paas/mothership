const express = require('express');
const router = express.Router();
const middlewares = require('./middlewares');
const appsController = require('../controllers/apps');
const usersController = require('../controllers/users');
const sessAuthController = require('../controllers/sessAuth');
const apiAuthController =  require('../controllers/apiAuth');
const passport = require('passport');
const eventLogger = require('../lib/EventLogger');

// Router middleware
router.use(middlewares.authentication);
router.use(middlewares.authorization);
router.use(middlewares.isAdmin);
router.use(middlewares.activePage);

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
router.post('/apps/:appId/deploy', middlewares.upload().single('file'), appsController.deploy);
router.post('/apps', middlewares.upload().single('file'), appsController.create);
router.post('/apps/:appId/delete', appsController.destroy);
router.post('/apps/:appId/database', middlewares.upload().single('file'), appsController.createDatabase);
router.post('/apps/:appId/env', appsController.updateEnvVar);
router.post('/apps/:appId/scale', appsController.updateReplicas);

// API
router.get('/api/apps', appsController.list);
router.post('/api/apps', appsController.create);
router.post('/api/apps/:appId/deploy', middlewares.upload().single('file'), appsController.deploy);
router.get('/api/events/:appId', eventLogger.appEvents);

module.exports = router;
