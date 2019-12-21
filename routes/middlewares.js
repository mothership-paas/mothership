const passport = require('passport');
const multer  = require('multer');
const uuid = require('uuid/v1');

module.exports = {
  authentication(req, res, next) {
    if (req.path === '/api/login' || req.path === '/login') {
      next();
    } else if (req.path.match(/^\/api.*/)) {
      passport.authenticate('jwt', { session: false })(req, res, next);
    } else {
      if (!req.isAuthenticated()) {
        console.log('request not authenticated');
	return res.redirect('/login');
      } else {
	next();
      }
    }
  },

  authorization(req, res, next) {
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
  },

  isAdmin(req, res, next) {
    if (req.user) {
      res.locals.userIsAdmin = req.user.role === 'admin';
    }

    next();
  },

  upload(req, res, next) {
    const storage = multer.diskStorage({
      // TODO: validate that the file is a zip
      destination: (req, file, cb) => {
        const directoryName = `./tmp/`;
        cb(null, directoryName);
      },
      filename: (req, file, cb) => cb(null, uuid())
    });

    return multer({ storage });
  },

  activePage(req, res, next) {
    const path = req.path;

    if (path.startsWith('/users')) {
      res.locals.activePage = { users: true };
    } else if (path.startsWith('/apps')) {
      res.locals.activePage = { apps: true };
    } else if (path.startsWith('/cluster')) {
      res.locals.activePage = { cluster: true };
    }

    next();
  },
};
