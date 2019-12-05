const DockerWrapper = require('../lib/DockerWrapper');
const App = require('../server/models').App;
const Database = require('../server/models').Database;
const Config = require('../server/models').Config;

const slugify = require('slugify');
const uuidv1 = require('uuid/v1');
const fs = require('fs');
const rimraf = require('rimraf');

const moveApplicationFile = (req, app) => {
  return new Promise((resolve, reject) => {
    const destination = `uploads/${app.title}/${req.file.filename}.zip`;

    fs.mkdir(`uploads/${app.title}`, (err) => {
      fs.rename(req.file.path, destination, (err) => {
        if (err) { reject(err) }
        resolve(req);
      });
    });
  });
};

const destroyAppWithoutDatabase = (app) => {
  return new Promise((resolve, reject) => {
    DockerWrapper.destroyService(app)
      .then(DockerWrapper.destroyNetwork)
      .then((app) => {
        App.destroy({  where: { id: app.id } })
      })
  });
}

const destroyAppWithDatabase = (app) => {
  return new Promise((resolve, reject) => {
    DockerWrapper.destroyService(app)
      .then(DockerWrapper.destroyDatabaseService)
      .then(DockerWrapper.pruneDatabaseVolume)
      .then(DockerWrapper.destroyNetwork)
      .then((app) => {
        const appId = app.id
        App.destroy({  where: { id: appId } })
          .then(() => {
            Database.destroy({  where: { app_id: app.id } })
          });
      });
  });
}

module.exports = {
  async create(req, res) {
    const domain = await Config.findOne({
      where: { key: 'domain' },
    });

    const app = {
      title: req.body.title,
      url: `${req.body.title}.${domain.value}`
    };

    App.create(app)
      .then((app) => {
        if (req.accepts('html')) {
          res.redirect(`/apps/${app.id}`);
        } else {
          res.status(201).json({ app });
        }
      })
      .catch(error => {
        if (req.accepts('html')) {
          res.render('apps/new', { errors: error.errors });
        } else {
          res.status(400).json({ errors: error.errors });
        }
        throw error;
      })
  },

  async deploy(req, res) {
    const app = await App.findByPk(req.params.appId);

    if (!req.file || req.file.mimetype !== 'application/zip') {
      return res.render(`apps/show`, {
        app: app,
        errors: [{ message: 'Please attach a .zip file when deploying' }]
      });
    }

    await moveApplicationFile(req, app);

    const updateParams = {
      path: `uploads/${app.title}`,
      filename: req.file.filename + '.zip',
      network: `${app.title}_default`,
    };

    app.update(updateParams)
      .then(app => {
        return new Promise(async(resolve, reject) => {
          if (req.accepts('html')) {
            res.redirect(`/apps/${app.id}?events`);
          } else {
            res.status(201).json({ stream: `/events/${app.id}` });
          }
          app.emitEvent(`Deploying application '${app.title}'...`);
          resolve(app);
        });
      })
      .then(DockerWrapper.buildDockerfile(app.filename))
      .then(DockerWrapper.buildImage)
      .then((app) => {
        return new Promise(async(resolve, reject) => {
          if (app.deployed) {
            DockerWrapper.updateService()(app)
              .then((app) => resolve(app));
          } else {
            DockerWrapper.createNetwork(app)
              .then(DockerWrapper.createService)
              .then((app) => resolve(app))
              .catch((err) => reject(err));
          }
        })
      })
      .then((app) => app.update({ deployed: Date.now() }))
      .then((app) => {
        app.emitEvent('===END===');
      })
      .catch(error => { console.log(error); });
  },

  list(req, res) {
    return App.findAll()
      .then(apps => {
        if (req.accepts('html')) {
          res.render('apps/index', { apps: apps });
        } else {
          res.json({ apps });
        }
      }).catch(error => {
        if (req.accepts('html')) {
          res.status(400).send(error);
        } else {
          res.status(400).json({ error });
        }
      });
  },

  new(req, res) {
    res.render('apps/new');
  },

  show(req, res) {
    return App
      .findByPk(req.params.appId, {
        include: [{model: Database, as: 'database'}]
      })
      .then(app => {
        if (!app) {
          return res.status(404).send({
            message: 'App Not Found'
          });
        }

        res.render('apps/show', { app });
      })
      .catch(error => {
        console.log(error);
        res.status(400).send(error);
      });
  },

  showUpdatePage(req, res) {
    return App
      .findByPk(req.params.appId, {
        include: [{model: Database, as: 'database'}]
      })
      .then(app => {
        if (!app) {
          return res.status(404).send({
            message: 'App Not Found'
          });
        }

        res.render('apps/update', { app });
      })
      .catch(error => res.status(400).send(error));
  },

  delete(req, res) { // TODO: remove queries from delete view
    return App
      .findByPk(req.params.appId, {
        include: [{model: Database, as: 'database'}]
      })
      .then(app => {
        if (!app) {
          return res.status(404).send({
            message: 'App Not Found'
          });
        }

        res.render('apps/delete', { app });
      })
      .catch(error => res.status(400).send(error));
  },

  destroy(req, res) {
    App
      .findByPk(req.params.appId)
      .then(app => {
        return new Promise((resolve, reject) => {
          if (!app) {
            return res.status(400).send({
              message: 'App Not Found'
            });
          }

          rimraf(app.path, (err) => {
            if (err) { reject(err) }
            resolve(app);
          });
        });
      })
      .then((app) => {
        Database
          .findOne({ where: { "app_id": app.id } })
          .then((database) => {
            if (database) {
              destroyAppWithDatabase(app);
            } else {
              destroyAppWithoutDatabase(app)
            }
          })
        })
      .then(() => res.redirect('/apps'))
      .catch((error) => res.status(400).send(error));
  },

  createDatabase(req, res) {
    App.findByPk(req.params.appId)
      .then((app) => {
        return new Promise((resolve, reject) => {
          fs.mkdir(`uploads/${app.title}/db`, err => {
            if (err) { reject(err); }

            if (!req.file) {
              resolve(app);
            } else {
              fs.rename(req.file.path, `uploads/${app.title}/db/schema.sql`, (err) => {
                if (err) { reject(err); }
                resolve(app);
              });
            }
          });
        });
      })
      .then((app) => {
        return new Promise((resolve, reject) => {
          Database.create({
            service_name: `${app.title}_database`,
            app_id: app.id,
            network: app.network,
            volume: `${app.title}_db_data`,
          }).then((database) => {
            return app.setDatabase(database)
          }).then(() => {
            resolve(app);
          });
        });
      })
      .then((app) => {
        res.redirect(`/apps/${req.params.appId}`)
        return app;
      })
      .then(DockerWrapper.createDatabase)
      .then(DockerWrapper.setDatabaseEnvVariablesForApp)
      .catch(error => {
        console.log(error);
        res.status(400).send(error);
      });
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

  updateEnvVar(req, res) {
    // TODO: may be worth refactoring this later to be less brittle if request formatting is bad
    // just return an error to client if request body was formatted incorrectly
    const submittedEnvVars = Object.keys(req.body).map(key => req.body[key]);
    const validEnvVars = submittedEnvVars.filter(env => env.key.trim().length && env.val.trim().length);
    const formattedEnvVars = validEnvVars.map(env => `${env.key.trim()}=${env.val.trim()}`)

    App.findByPk(req.params.appId)
      .then(app => app.update({ envVariables: formattedEnvVars }))
      .then(DockerWrapper.updateService())
      .then((app) => {
        res.redirect(`/apps/${req.params.appId}`);
        return app;
      })
      .catch(error => console.log(error))
  },
};
