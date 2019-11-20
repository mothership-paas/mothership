const Docker = require('dockerode');
const Machine = require('docker-machine');
const Node = require('../server/models').Node;
const fs = require('fs');
const path = require('path');
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

module.exports = {
  buildDockerfile: (file) => {
    return (app) => {
      return new Promise((resolve, reject) => {
        console.log('Building Dockerfile...')
        fs.writeFileSync(`./${app.path}/Dockerfile`, dockerfileContent(file));
        console.log('Built Dockerfile!');
        resolve(app);
      });
    };
  },

  buildImage: (app) => {
    return new Promise(async (resolve, reject) => {
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
          const tarStream = tar.pack(app.path);

          console.log('Building image...');
          docker.buildImage(tarStream, {
            t: `${app.title}:latest`,
          }, function(error, output) {
            if (error) {
              return console.error(error);
            }
            output.pipe(process.stdout);
            output.on('end', function () {
              // send notification to client that build is ready
              console.log('Image built!');
              resolve(app);
            });
          });
        });
      });
    });
  },

  createService: (app) => {
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

          console.log('Creating service...');
          docker.createService(serviceParams, (error, result) => {
            if (error) { console.log(error); }
            console.log('Service created!');
            resolve(app);
          });
        });
      });
    });
  },

  createNetwork: (app) => {
    return new Promise(async (resolve, reject) => {
      Node.findOne({ where: { manager: true }}).then((manager) => {
        console.log('Creating network...');
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

          const networkOptions = {
            "Name": app.title + '_default',
            "Driver": "overlay"
          };

          console.log('Creating network...');
          docker.createNetwork(networkOptions, (error, result) => {
            if (error) { console.log(error); }
             console.log('Network created!');
            resolve(app);
          });
        });
      });
    });
  },
};