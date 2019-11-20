const DockerWrapper = require('../lib/DockerWrapper');
const App = require('../server/models').App;

const slugify = require('slugify');
const uuidv1 = require('uuid/v1');
const fs = require('fs');

module.exports = {
  create(req, res) {
    // TODO: Make path relative to app root directory
    fs.mkdir(`uploads/${req.body.title}`, err => {
      fs.rename(
        req.file.path,
        `uploads/${req.body.title}/${req.file.filename}`,
        (err) => {
          if (err) { console.log(err) }
        }
      )

      const app = {
        title: req.body.title,
        path: `uploads/${req.body.title}`,
        filename: req.file.filename,
        network: `${req.body.title}_default`
      };

      App.create(app)
        .then(DockerWrapper.buildDockerfile(req.file))
        .then(DockerWrapper.buildImage)
        .then(DockerWrapper.createNetwork)
        .then(DockerWrapper.createService)
        .catch(error => {
          console.log(error);
          res.status(400).send(error)
        });      

      return res.redirect(`/apps`)
    });
  },

  list(req, res) {
    return App.findAll()
      .then(apps => {
        res.render('apps/index', { apps: apps });
      })
      .catch(error => res.status(400).send(error));
  },

  new(req, res) {
    res.render('apps/new');
  },

  show(req, res) {
    return App
      .findByPk(req.params.appId)
      .then(app => {
        if (!app) {
          return res.status(404).send({
            message: 'App Not Found'
          });
        }
        res.render('apps/show', { app });
      })
      .catch(error => res.status(400).send(error));
  },

  destroy(req, res) {
    return App
      .findByPk(req.params.appId)
      .then(app => {
        if (!app) {
          return res.status(400).send({
            message: 'App Not Found',
          });
        }
        return app
          .destroy()
          .then(() => res.redirect('/apps'))
          .catch((error) => res.status(400).send(error))
      })
      .catch(error => res.status(400).send(error));
  },

  createDatabase(req, res) {
    App.findByPk(req.params.appId)
      .then(DockerWrapper.createDatabase)
      .then(DockerWrapper.setDatabaseEnvVariablesForApp)

    res.redirect('/apps');
  },
};