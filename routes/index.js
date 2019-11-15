var express = require('express');
var router = express.Router();
const appsController = require('../controllers/apps');
const multer  = require('multer');
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, './uploads'),
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
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
