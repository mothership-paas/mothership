const DockerWrapper = require('../lib/DockerWrapper');
const Node = require('../server/models').Node;
const Database = require('../server/models').Database;
const Config = require('../server/models').Config;
const Machine = require('docker-machine');
const uuid = require('uuid/v4');
const errHandler = e => console.log(e);

module.exports = {
  list(req, res) {
    return Node.findAll()
      .then(nodes => {
        if (req.accepts('html')) {
          res.render('cluster/index', { nodes });
        } else {
          res.json({ nodes });
        }
      }).catch(error => {
        if (req.accepts('html')) {
          res.status(400).send(error);
        } else {
          res.status(400).json({ error });
        }
      });
  },
}