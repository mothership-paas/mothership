const express = require('express');
const router = express.Router();
const appsController = require('../controllers/apps');
const multer  = require('multer');
const fs = require('fs');
const uuid = require('uuid/v1');
const eventLogger = require('../lib/EventLogger');

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
  res.render('index', { title: 'Express' });
});

router.get('/events/:appId', (req, res) => {
  const appId = req.params.appId;

  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });

  const messageWriter = data => {
    res.write(`event: message\n`);
    res.write(`data: ${data}\n\n`);

    if (data === '===END===') {
      console.log('Deregistering listener...');
      eventLogger.off(`message-${appId}`, messageWriter);
      return res.status(200).end();
    }
  };

  console.log(`Creating listener for 'message`);
  eventLogger.on(`message-${appId}`, messageWriter);
});

// App
router.get('/apps', appsController.list);
router.get('/apps/new', appsController.new);
router.get('/apps/:appId', appsController.show);
router.post('/apps', upload.single('file'), appsController.create);
router.delete('/apps/:appId', appsController.destroy);

// Database
router.post('/apps/:appId/database', upload.single('file'), appsController.createDatabase);

module.exports = router;
