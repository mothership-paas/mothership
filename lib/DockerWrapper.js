const Docker = require('dockerode');
const Machine = require('docker-machine');
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
  buildDroplet(app) {
    return new Promise((resolve, reject) => {
      console.log('Building droplet...');

      const options = {
        'digitalocean-access-token': process.env.ACCESS_TOKEN,
      };

      Machine.create(app.dropletName, 'digitalocean', options, (err) => {
        if (err) throw err;
        resolve(app);
      });
    });
  },

  buildDockerfile() {
    return (app) => {
      return new Promise((resolve, reject) => {
        console.log('Building Dockerfile...')
        fs.writeFileSync(`./${app.path}/Dockerfile`, dockerfileContent(file));
        resolve(app);
      });
    };
  },

  buildAndRunContainer() {
    return new Promise(async (resolve, reject) => {
      console.log('Building + running container on droplet...');
      const machine = new Machine(app.dropletName);

      machine.env({ parse: true }, (err, result) => {
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

        var tarStream = tar.pack(app.path);
        docker.buildImage(tarStream, {
          t: `${app.title}:latest`,
        }, function(error, output) {
          if (error) {
            return console.error(error);
          }
          output.pipe(process.stdout);
          output.on('end', function () {
            // send notification to client that build is ready
            var container = docker.createContainer({
              Image: app.title + ':latest',
              PortBindings: { "4567/tcp": [{ HostPort: "80" }] }
            }).then(container => {
              return container.start();
            }).then(container => {
              resolve(app);
            }).catch(error => {
              throw error;
            });
          });
        });
      });
    });
  },

  saveIpAddress() {
    return new Promise((resolve, reject) => {
      const machine = new Machine(app.dropletName);

      machine.inspect((err, result) => {
        if (err) throw err;

        const ipAddress = result.driver.ipAddress;
        app.update({ ipAddress }).then((app) => resolve(app));
      });
    });
  }
};
