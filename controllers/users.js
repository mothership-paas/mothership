const bcrypt = require('bcrypt');
const User = require('../server/models').User;

module.exports = {
  async list(req, res) {
    const users = await User.findAll();
    res.render('users/index', { users });
  },

  new(req, res) {
    res.render('users/create');
  },

  async edit(req, res) {
    const user = await User.findByPk(req.params.userId);
    res.render('users/edit', { user, isAdmin: user.role === 'admin' });
  },

  async create(req, res) {
    const hashedPassword = await bcrypt.hash(req.body.password, 10);
    const userProps = {
      firstName: req.body.firstname,
      lastName: req.body.lastname,
      username: req.body.username,
      password: hashedPassword,
      role: req.body.role,
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
  },

  async delete(req, res) {
    const user = await User.findByPk(req.params.userId);
    await user.destroy();

    return res.redirect('/users');
  },

  async update(req, res) {
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
  }
};