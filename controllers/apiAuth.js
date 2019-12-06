const bcrypt = require('bcrypt');
const jwt = require('json-web-token');
const User = require('../server/models').User;

module.exports = {
  login(req, res) {
    User.findAll({ where: { username: req.body.username }, })
      .then(user => {
        user = user[0];
        if (!user) {
          res.set('WWW-Authenticate', 'Bearer');
          return res.status(401).send(); 
        }

        if (!bcrypt.compareSync(req.body.password, user.password)) {
          res.set('WWW-Authenticate', 'Bearer');
          return res.status(401).send();
        }

        if (user.tokens.length > 0) {
          res.status(200).send(user.tokens[0]);
        } else {
          jwt.encode('secret', { userId: user.id }, (err, token) => {
            user.update({ tokens: user.tokens.concat(token) })
              .then(() => res.status(200).send(token));
          });
        }
      })
      .catch(err => {
        console.log(err);
        return res.status(500).send(
          JSON.stringify({ message: 'Something went wrong, try again' })
        );
      });
  },
}
