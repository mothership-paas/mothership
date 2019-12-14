const DockerWrapper = require('../lib/DockerWrapper');
const Node = require('../server/models').Node;
const Database = require('../server/models').Database;
const Config = require('../server/models').Config;
const Machine = require('docker-machine');
const uuid = require('uuid/v4');
const errHandler = e => console.log(e);

module.exports = {
	show(req, res) {
    res.render('cluster');
  },
}