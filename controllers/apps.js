const DockerWrapper = require('../lib/DockerWrapper');
const App = require('../server/models').App;
const Database = require('../server/models').Database;
const Config = require('../server/models').Config;
const { execSync } = require('child_process');

const slugify = require('slugify');
const uuidv1 = require('uuid/v1');
const fs = require('fs');

const moveApplicationFile = (req) => {
  return new Promise((resolve, reject) => {
    const destination = `uploads/${req.body.title}/${req.file.filename}.zip`;

    fs.mkdir(`uploads/${req.body.title}`, (err) => {
      fs.rename(req.file.path, destination, (err) => {
        if (err) { reject(err) }
        resolve(req);
      });
    });
  });
};

const inflateZipFile = (path, filename) => {
  return (app) => {
  	return new Promise((resolve, reject) => {
  	  console.log('Inflating zip file...');
  	  // make a subdirectory
  	  // what if it's already been deployed
  	  execSync(`unzip -o ./${path}/${filename}`);
	  execSync(`rm -rf ./${path}/${filename}/{.git|.env|node_modules}`)
  	  resolve(app);
  	})
  }
}

const compressFiles = (directory) => {
  return (app) => {
  	return new Promise((resolve, reject) => {
  	  console.log('Compressing files into zip');
  	  execSync(`zip -r app.zip * .*`);
  	  resolve(app);
  	})
  }
}

module.exports = {
  async create(req, res) {
    if (!req.file || req.file.mimetype !== 'application/zip') {
      return res.render('apps/new', { errors: [{ message: 'Please attach a .zip file of your application.' }] })
    }

    // TODO: Make path relative to app root directory
    const app = {
      title: req.body.title,
      path: `uploads/${req.body.title}`,
      filename: req.file.filename + '.zip',
      network: `${req.body.title}_default`
    };

    await moveApplicationFile(req);

    App.create(app)
      .then((app) => {
        // Set app subdomain now that we have id
        return new Promise(async(resolve, reject) => {
          const domain = await Config.findOne({
            where: { key: 'domain' },
          })
          await app.update({ url: `${app.title}.${domain.value}` });
          app.emitEvent(`Creating application '${app.title}'`)
          res.redirect(`apps/${app.id}?events`);
          resolve(app);
        });
      })
      .catch(error => {
        res.render('apps/new', { errors: error.errors });
        throw error;
      })
      .then(inflateZipFile(app.path, req.file.filename + '.zip'))
      .then(DockerWrapper.buildDockerfile(req.file.filename + '.zip'))  //  .then(DockerWrapper.buildDockerignoreFile())
      .then(compressFiles(app.path))
      .then(DockerWrapper.buildImage)
      .then(DockerWrapper.createNetwork)
      .then(DockerWrapper.createService)
      .then((app) => {
        app.emitEvent('===END===');
      })
      .catch(error => { console.log(error); });
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
