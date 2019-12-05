const express = require('express');
const router = express.Router();
const appsController = require('../controllers/apps');
const multer  = require('multer');
const fs = require('fs');
const uuid = require('uuid/v1');
const stream = require('stream');
const util = require('util');
const WebSocket = require('ws');
const passport = require('passport');
const bcrypt = require('bcrypt');

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
  if (req.path.match(/^\/api.*/) && !req.isAuthenticated()) {
    res.status(403).send();
    res.end()
  } else if (req.path !== '/login' && !req.isAuthenticated()) {
    res.redirect('/login');
  } else {
    console.log('passed authentication');
    next();
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
  console.log(req.user);
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
router.get('/login',(req, res) =>  {
  res.render('login')
});

router.post(
  '/login',
  passport.authenticate('local', { failureRedirect: '/login', }),
  (req, res) => res.redirect('/')
);

router.get('/logout', (req, res) => {
  req.logout();
  res.redirect('/login');
});

// Users
router.get('/users', async(req, res) => {
  console.log('made it to users controller');
  const users = await User.findAll();
  console.log('found user');
  res.render('users/index', { users });
  console.log('sent render');
});

router.get('/users/new', (req, res) => {
  res.render('users/create');
});

router.post('/users', async(req, res) => {
  const hashedPassword = await bcrypt.hash(req.body.password, 10);
  const userProps = {
    firstName: req.body.firstname,
    lastName: req.body.lastname,
    username: req.body.username,
    password: hashedPassword,
    role: reque.body.role,
  }

  try {
    // Password validation: we can't do this in the model because
    // it's hashed before the model tries to write ito the db
    if (!req.body.password || req.body.password.length < 5) {
      errObject = {
        errors: [{ message: "Password must be at least 5 characters" }],
      };
      throw errObject;
    }

    await User.create(userProps);

    res.redirect('/users');
  } catch(err) {
    delete userProps.password;
    res.render('users/create', { user: userProps, isAdmin: user.role === 'admin', errors: err.errors });
  }
});

router.get('/users/:userId/edit', async(req, res) => {
  const user = await User.findByPk(req.params.userId);
  res.render('users/edit', { user, isAdmin: user.role === 'admin' });
});

router.post('/users/:userId', async(req, res) => {
  const user = await User.findByPk(req.params.userId);
  const newProps = {
    firstName: req.body.firstname,
    lastName: req.body.lastname,
    username: req.body.username,
    role: req.body.role,
  };

  try {
    if (req.body.password && req.body.password.length < 5) {
      errObject = {
        errors: [{ message: "Password must be at least 5 characters" }],
      };
      throw errObject;
    }

    // Only set password if they supplied a new one
    if (req.body.password !== '') {
      newProps.password = await bcrypt.hash(req.body.password, 10);
    }

    await user.update(newProps);
    return res.redirect('/users');
  } catch(err) {
    res.render('users/create', { user: newProps, errors: err.errors });
  }
});

router.post('/users/:userId/delete', async(req, res) => {
  const user = await User.findByPk(req.params.userId);
  await user.destroy();

  return res.redirect('/users');
});

/* GET home page. */
router.get('/', function(req, res, next) {
  res.redirect('/apps');
});

// Event Streaming
router.get('/events/:appId', eventLogger.appEvents);
router.get('/events/:appId/exec', eventLogger.appExecEvents);

// App
router.get('/apps', appsController.list);
router.get('/apps/new', appsController.new);
router.get('/apps/:appId', appsController.show);
router.get('/apps/:appId/edit', appsController.showUpdatePage);
router.post('/apps', upload.single('file'), appsController.create);
router.post('/apps/:appId/edit', upload.single('file'), appsController.update);

// Database
router.post('/apps/:appId/database', upload.single('file'), appsController.createDatabase);

// Env Variables
router.post('/apps/:appId/env', appsController.updateEnvVar);
// Scale/Replicas
router.post('/apps/:appId/scale', appsController.updateReplicas);

router.post('/apps/:appId/exec', (req, res) => {
  App.findByPk(req.params.appId)
    .then(async(app) => {
      const docker = await DockerWrapper.getManagerNodeInstance();
      const command = req.body.command.split(' ');
      const image = `${app.title}:latest`; // TODO: Don't hard-code this

      // Create a place to stream command output to, and emit events from
      // You might think we could just subscribe to the data event on the
      // stream from Docker run, but the chunks we get from that are weird.
      // Writing to a file first and tailing the file normalizes the chunks
      // for some reason.
      const fileName = app.title + uuid();
      const outputStream = fs.createWriteStream(fileName);
      const tail = spawn("tail", ["-f", fileName]);
      tail.stdout.on('data', data => {
        fs.readFile(fileName, (err, fileContents) => {
          if (err) throw err;
          console.log('read from file');
          app.emitEvent(fileContents.toString('utf8'), 'exec')
        });
      });

      const runOptions =  {
        Env: [
          // TODO: These shouldn't be hard-coded... store in db?
          `DATABASE_HOST=${app.title}_database`,
          `POSTGRES_USER=postgres`,
          `POSTGRES_PASSWORD=password`,
          `POSTGRES_DB=${app.title}`
        ],
        "HostConfig": {
          "NetworkMode": `${app.network}`,
        },
      };

      docker.run(image, command, outputStream, runOptions, (err, data, container) => {
        // Remove one-off container once command terminates
        container.remove();
      }).on('stream', stream => {
        // Clean up after there's no more output coming into our stream
        stream.on('end', () => {
          tail.kill();
          app.emitEvent('===END===');
          outputStream.end(() => {
            fs.unlink(fileName, err => { if (err) { throw err } })
          });
        });
      });

      res.send(200, 'OK');
    })
    .catch(error => res.status(404).send(error));
});

module.exports = router;
