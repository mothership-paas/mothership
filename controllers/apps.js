const DockerWrapper = require('../lib/DockerWrapper');
const App = require('../server/models').App;
const Database = require('../server/models').Database;
const Config = require('../server/models').Config;

const slugify = require('slugify');
const uuidv1 = require('uuid/v1');
const fs = require('fs');

module.exports = {
  create(req, res) {
    // TODO: Make path relative to app root directory
    fs.mkdir(`uploads/${req.body.title}`, err => {
      fs.rename(
        req.file.path,
        `uploads/${req.body.title}/${req.file.filename}.zip`,
        (err) => {
          if (err) { console.log(err) }
        }
      )

      const app = {
        title: req.body.title,
        path: `uploads/${req.body.title}`,
        filename: req.file.filename + '.zip',
        network: `${req.body.title}_default`
      };

      App.create(app)
        .then((app) => {
          
          // Set app subdomain now that we have id
          return new Promise(async(resolve, reject) => {
            const domain = await Config.findOne({
              where: { key: 'domain' },
            })
            await app.update({ url: `${app.title}${app.id}.${domain.value}` });
            app.emitEvent(`Creating application '${app.title}'`)
            res.redirect(`apps/${app.id}?events`);
            resolve(app);
          });
        })
        .then(DockerWrapper.buildDockerfile(req.file.filename + '.zip'))
        .then(DockerWrapper.buildImage)
        .then(DockerWrapper.createNetwork)
        .then(DockerWrapper.createService)
        .then((app) => {
          app.emitEvent('===END===');
        })
        .catch(error => { throw error; });
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
    console.log(req.file);
    App.findByPk(req.params.appId)
      .then((app) => {
        return new Promise((resolve, reject) => {
          fs.mkdir(`uploads/${app.title}/db`, err => {
            if (err) { reject(err); }

            fs.rename(req.file.path, `uploads/${app.title}/db/schema.sql`, (err) => {
              if (err) { reject(err); }
              resolve(app);
            });
          });
        });
      })
      .then((app) => {
        return new Promise((resolve, reject) => {
          Database.create({
            service_name: `${app.title}_database`,
            app_id: app.id,
            network: app.network
          }).then(() => resolve(app));
        });
      })
      .then(DockerWrapper.createDatabase)
      .then(DockerWrapper.setDatabaseEnvVariablesForApp)
      .catch(error => {
        console.log(error);
        res.status(400).send(error);
      });

    res.redirect('/apps');
  },

  updateReplicas(req, res) {
    const scale = parseInt(req.body.scale);

    if (scale < 1 || scale > 10) {
      return res.status(400).send('Value must be between 1 and 10!');
    }

    const serviceConfig = { "Mode": { "Replicated": { "Replicas": scale }}};

    App.findByPk(req.params.appId)
      .then((app) => app.update({ replicas: scale }))
      .then((app) => {
        res.redirect(`/apps/${req.params.appId}`)
        return app;
      })
      .then(DockerWrapper.updateService(serviceConfig))
      .catch(error => console.log(error));
  },
};
