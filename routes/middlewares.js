const passport = require('passport');

module.exports = {
  authentication(req, res, next) {
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
}