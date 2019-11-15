const express = require('express');
const router = express.Router();
const appsController = require('../controllers/apps');
const multer  = require('multer');
const fs = require('fs');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const directoryName = `./uploads/${Date.now()}`;
    fs.access(directoryName, null, (err) => {
      if (err) {
        fs.mkdir(directoryName, (err) => {
          if (err) { throw err }
          cb(null, directoryName);
        })
      }
    })
  },
  filename: (req, file, cb) => {
    cb(null, file.originalname);
  }
});

const upload = multer({storage});

/* GET home page. */
router.get('/', function(req, res, next) {
  res.render('index', { title: 'Express' });
});

router.get('/apps', appsController.list);
router.get('/apps/new', appsController.new);
router.get('/apps/:appId', appsController.show);
router.post('/apps', upload.single('file'), appsController.create);
router.delete('/apps/:appId', appsController.destroy);

module.exports = router;
