const App = require('../server/models').App;
const Node = require('../server/models').Node;
const Docker = require('dockerode');
const Machine = require('docker-machine');
const cmd = process.argv.slice(2);
const machine = new Machine();
const docker = new Docker();
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const appDir = path.dirname(require.main.filename);
const uuidv1 = require('uuid/v1')
const slugify = require('slugify');
const tar = require('tar-fs');

const dockerfileContent = ({ filename }) => {
  return `FROM ruby:2.6
COPY ${filename} /usr/src/app/
WORKDIR /usr/src/app
RUN unzip ${filename}
RUN bundle install
EXPOSE 4567

CMD ["bundle", "exec", "puma", "-t", "5:5", "-p", "4567"]`;
};

const buildDockerfile = (file) => {
  return (app) => {
    return new Promise((resolve, reject) => {
      console.log('Building Dockerfile...')
      fs.writeFileSync(`./${app.path}/Dockerfile`, dockerfileContent(file));
      resolve(app);
    });
  };
};

const createService = app => {
  return new Promise((resolve, reject) => {
    Node.findOne({ where: { manager: true }}).then((manager) => {
      const machine = new Machine(manager.name);

      machine.env({ parse: true }, (err, result) => {
        if (err) { console.log(err); }

        const certPath = result.DOCKER_CERT_PATH;
        const hostWithPort = result.DOCKER_HOST.split('//')[1];
        const host = hostWithPort.split(':')[0];
        const port = hostWithPort.split(':')[1];

        const options = {
          socketPath: undefined,
          host: host,
          port: Number(port),
          ca: fs.readFileSync(certPath + '/ca.pem'),
          cert: fs.readFileSync(certPath + '/cert.pem'),
          key: fs.readFileSync(certPath + '/key.pem'),
        };

        const docker = new Docker(options);

        const serviceParams = {
          "Name": "web",
          "TaskTemplate": {
            "ContainerSpec": {
              "Image": `${app.title}:latest`,
            },
            "Networks": [
              { "Target": `${app.title}_default` }
            ]
          },
          "EndpointSpec": {
            "Ports": [
              {
                "Protocol": "tcp",
                "PublishedPort": 8080,
                "TargetPort": 4567
              }
            ]
          },
        };

        docker.createService(serviceParams, (error, result) => {
          resolve(app);
        });
      });
    });
  });
};

const buildImage = (app) => {
  return new Promise(async (resolve, reject) => {
    Node.findOne({ where: { manager: true }}).then((manager) => {
      console.log('Building + running container on droplet...');
      const machine = new Machine(manager.name);

      machine.env({ parse: true }, (err, result) => {
        if (err) { console.log(err); }
        const certPath = result.DOCKER_CERT_PATH;
        const hostWithPort = result.DOCKER_HOST.split('//')[1];
        const host = hostWithPort.split(':')[0];
        const port = hostWithPort.split(':')[1];

        const options = {
          socketPath: undefined,
          host: host,
          port: Number(port),
          ca: fs.readFileSync(certPath + '/ca.pem'),
          cert: fs.readFileSync(certPath + '/cert.pem'),
          key: fs.readFileSync(certPath + '/key.pem'),
        };

        const docker = new Docker(options);
        const tarStream = tar.pack(app.path);

        docker.buildImage(tarStream, {
          t: `${app.title}:latest`,
        }, function(error, output) {
          if (error) {
            return console.error(error);
          }
          output.pipe(process.stdout);
          output.on('end', function () {
            // send notification to client that build is ready
            resolve(app);
          });
        });
      });
    });
  });
};

const createNetwork = (app) => {
  return new Promise(async (resolve, reject) => {
    Node.findOne({ where: { manager: true }}).then((manager) => {
      console.log('Creating network...');
      const machine = new Machine(manager.name);

      machine.env({ parse: true }, (err, result) => {
        console.log(err);
        const certPath = result.DOCKER_CERT_PATH;
        const hostWithPort = result.DOCKER_HOST.split('//')[1];
        const host = hostWithPort.split(':')[0];
        const port = hostWithPort.split(':')[1];

        const options = {
          socketPath: undefined,
          host: host,
          port: Number(port),
          ca: fs.readFileSync(certPath + '/ca.pem'),
          cert: fs.readFileSync(certPath + '/cert.pem'),
          key: fs.readFileSync(certPath + '/key.pem'),
        };

        const docker = new Docker(options);

        const networkOptions = {
          "Name": app.title + '_default',
          "Driver": "overlay"
        };

        docker.createNetwork(networkOptions, (error, result) => {
          console.log(error);
          console.log(result);
          resolve(app);
        });
      });
    });
  });
};

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
        dropletName: `${slugify(req.body.title)}-${uuidv1()}`,
      };

      console.log(req.file);

      App.create(app)
        .then(buildDockerfile(req.file))
        .then(buildImage)
        .then(createNetwork)
        .then(createService)
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
};