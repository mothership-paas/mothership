const express = require('express');
const router = express.Router();
const appsController = require('../controllers/apps');
const multer  = require('multer');
const fs = require('fs');
const uuid = require('uuid/v1');

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

// App
router.get('/apps', appsController.list);
router.get('/apps/new', appsController.new);
router.get('/apps/:appId', appsController.show);
router.post('/apps', upload.single('file'), appsController.create);
router.delete('/apps/:appId', appsController.destroy);

// Database
router.post('/apps/:appId/database', upload.single('file'), appsController.createDatabase);

module.exports = router;
