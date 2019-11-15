const App = require('../server/models').App;
const Docker = require('dockerode');
const Machine = require('docker-machine');
const cmd = process.argv.slice(2);
const machine = new Machine();
const { execSync } = require('child_process');
const fs = require('fs');

const CREATE_DROPLET_COMMAND = `docker-machine create \
--driver digitalocean \
--digitalocean-access-token ${process.env.ACCESS_TOKEN} \
do-sandbox`;

const BUILD_RUN_CONTAINER_COMMMAND = `eval $(docker-machine env do-sandbox);\
docker build -t sinatra-app .;\
docker run -d -p 80:4567 sinatra-app`;

const dockerfileContent = (file) => {
  return `FROM ruby:2.6
COPY ./${file.path} /usr/src/app/
WORKDIR /usr/src/app
RUN unzip ${file.filename}
RUN bundle install
EXPOSE 4567

CMD ["bundle", "exec", "puma", "-t", "5:5", "-p", "4567"]`;
};

const buildDroplet = (app) => {
  return new Promise((resolve, reject) => {
    console.log('Building droplet...')
    execSync(CREATE_DROPLET_COMMAND); // This uses the sync version of exec. TODO: Switch to async once we have bg jobs
    resolve(app);
  });
};

const buildDockerfile = (file) => {
  return (app) => {
    return new Promise((resolve, reject) => {
      console.log('Building Dockerfile...')
      fs.writeFileSync(`./${file.destination}/Dockerfile`, dockerfileContent(file));
      resolve(app);
    });
  };
};

const buildAndRunContainer = (app) => {
  return new Promise((resolve, reject) => {
    console.log('Building + running container on droplet...')
    execSync(BUILD_RUN_CONTAINER_COMMMAND);
    resolve(app);
  });
};

const saveIpAddress = (app) => {
  return new Promise((resolve, reject) => {
    console.log('Getting the IP Address of droplet...');
    const ipAddress = execSync('docker-machine ip do-sandbox', { encoding: "utf8" }).trim();
    console.log('Saving the IP Address of the droplet...');
    app.update({ ipAddress }).then((app) => resolve(app));
  });
};

module.exports = {
  create(req, res) {
    const app = {
      title: req.body.title,
      path: `./${req.file.path}`,
      filename: req.file.filename
    };

    return App.create(app)
      .then(buildDroplet)
      .then(buildDockerfile(req.file))
      .then(buildAndRunContainer)
      .then(saveIpAddress)
      .then(app => { res.redirect(`/apps/${app.id}`) })
      .catch(error => res.status(400).send(error));
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
};
