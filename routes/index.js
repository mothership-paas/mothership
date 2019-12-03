const express = require('express');
const router = express.Router();
const appsController = require('../controllers/apps');
const multer  = require('multer');
const fs = require('fs');
const uuid = require('uuid/v1');
const stream = require('stream');
const util = require('util');
const WebSocket = require('ws');

const eventLogger = require('../lib/EventLogger');
const spawn = require('child_process').spawn;

const DockerWrapper = require('../lib/DockerWrapper');
const App = require('../server/models').App;

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
router.post('/apps', upload.single('file'), appsController.create);
router.delete('/apps/:appId', appsController.destroy);

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
