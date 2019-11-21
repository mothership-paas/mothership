const Docker = require('dockerode');
const Machine = require('docker-machine');
const Node = require('../server/models').Node;
const fs = require('fs');
const path = require('path');
const uuidv1 = require('uuid/v1')
const slugify = require('slugify');
const tar = require('tar-fs');
const eventLogger = require('../lib/EventLogger');

const webDockerfileContent = (filename) => {
  return `FROM ruby:2.6
COPY ${filename} /usr/src/app/
WORKDIR /usr/src/app
RUN unzip ${filename}
RUN bundle install
EXPOSE 4567

CMD ["bundle", "exec", "puma", "-t", "5:5", "-p", "4567"]`;
};

const DB_DOCKERFILE_CONTENT = `FROM postgres
COPY schema.sql /docker-entrypoint-initdb.d/`;

const getManagerNodeInstance = () => {
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
        resolve(docker);
      });
    });
  });
};

module.exports = {
  buildDockerfile: (filename) => {
    return (app) => {
      return new Promise((resolve, reject) => {

        eventLogger.emit(`message-${app.id}`, 'Building Dockerfile...');
        console.log('Building Dockerfile...')
        fs.writeFile(`./${app.path}/Dockerfile`, webDockerfileContent(filename), (err) => {
          if (err) { reject(err); }
          console.log('Built Dockerfile!');
          resolve(app);
        });
      });
    };
  },

  buildImage: (app) => {
    return new Promise(async (resolve, reject) => {
      const managerNode = await getManagerNodeInstance();
      const tarStream = tar.pack(app.path);

      eventLogger.emit(`message-${app.id}`, 'Building image...');
      console.log('Building image...');
      managerNode.buildImage(tarStream, {
        t: `${app.title}:latest`,
      }, function(error, output) {
        if (error) {
          return console.error(error);
        }

        output.pipe(process.stdout);
        output.on('data', (data) => {
          const message = JSON.parse(data);
          eventLogger.emit(`message-${app.id}`, message.stream);
        });
        output.on('end', function () {
          // send notification to client that build is ready
          eventLogger.emit(`message-${app.id}`, 'Image built!');
          console.log('Image built!');
          resolve(app);
        });
      });
    });
  },

  createService: (app) => {
    return new Promise(async (resolve, reject) => {
      const managerNode = await getManagerNodeInstance();

      const serviceParams = {
        "Name": `${app.title}_web`,
        "TaskTemplate": {
          "ContainerSpec": {
            "Image": `${app.title}:latest`,
          },
          "Networks": [
            { "Target": `${app.network}` }
          ]
        },
        "EndpointSpec": {
          "Ports": [
            {
              "Protocol": "tcp",
              "PublishedPort": Math.floor(Math.random()*10000),
              "TargetPort": 4567
            }
          ]
        },
      };

      eventLogger.emit(`message-${app.id}`, 'Creating service...');
      console.log('Creating service...');
      managerNode.createService(serviceParams, (error, result) => {
        if (error) { console.log(error); }
        eventLogger.emit(`message-${app.id}`, 'Service created!');
        console.log('Service created!');
        resolve(app);
      });
    });
  },

  createNetwork: (app) => {
    return new Promise(async (resolve, reject) => {
      const managerNode = await getManagerNodeInstance();

      const networkOptions = {
        "Name": app.network,
        "Driver": "overlay"
      };

      eventLogger.emit(`message-${app.id}`, 'Creating network...');
      console.log('Creating network...');
      managerNode.createNetwork(networkOptions, (error, result) => {
        if (error) { console.log(error); }
        eventLogger.emit(`message-${app.id}`, 'Network created!');
        console.log('Network created!');
        resolve(app);
      });
    });
  },

  createDatabase: (app) => {
    return new Promise(async (resolve, reject) => {
      const managerNode = await getManagerNodeInstance();

      const serviceParams = {
        "Name": `${app.title}_database`,
        "TaskTemplate": {
          "ContainerSpec": {
            "Image": `${app.title}_database:latest`,
            "Env": ["POSTGRES_USER=postgres",
                    "POSTGRES_PASSWORD=password",
                    `POSTGRES_DB=${app.title}`]
          },
          "Networks": [
            { "Target": `${app.network}` }
          ]
        },
      };

      fs.writeFileSync(`./${app.path}/db/Dockerfile`, DB_DOCKERFILE_CONTENT);

      const tarStream = tar.pack(app.path + '/db');

      eventLogger.emit(`message-${app.id}`, 'Building DB image...');
      console.log('Building db image...');
      managerNode.buildImage(tarStream, {
        t: `${app.title}_database:latest`,
      }, function(error, output) {
        if (error) {
          console.error(error);
          reject(error);
        }
        output.pipe(process.stdout);
        output.on('end', function () {
          // send notification to client that build is ready
          eventLogger.emit(`message-${app.id}`, 'DB image built!');
          console.log('DB image built!');
          eventLogger.emit(`message-${app.id}`, 'Creating DB service...');
          console.log('Creating database service...');
          managerNode.createService(serviceParams, (error, result) => {
            if (error) { console.log(error); }
            eventLogger.emit(`message-${app.id}`, 'DB service created!');
            console.log('Database service created!');
            resolve(app);
          });
        });
      });
    });
  },

  setDatabaseEnvVariablesForApp: (app) => {
    return new Promise(async (resolve, reject) => {
      const managerNode = await getManagerNodeInstance();

      const serviceParams = {
        "Name": `${app.title}_web`,
        "TaskTemplate": {
          "ContainerSpec": {
            "Image": `${app.title}:latest`,
            "Env": [`DATABASE_HOST=${app.title}_database`,
                    "POSTGRES_USER=postgres",
                    "POSTGRES_PASSWORD=password",
                    `POSTGRES_DB=${app.title}`]
          },
          "Networks": [
            { "Target": `${app.network}` }
          ]
        },
        "EndpointSpec": {
          "Ports": [
            {
              "Protocol": "tcp",
              "PublishedPort": Math.floor(Math.random()*10000),
              "TargetPort": 4567
            }
          ]
        },
      };

      const service = managerNode.getService(`${app.title}_web`);

      service.inspect((error, result) => {
        const version = result.Version.Index;
        serviceParams._query = { "version": version };

        eventLogger.emit(`message-${app.id}`, 'Updating web service with DB env params...');
        console.log('Updating web service with DB env params');
        service.update(serviceParams, (error, result) => {
          if (error) { console.log(error); }
          eventLogger.emit(`message-${app.id}`, 'Web service updated with DB env params!');
          console.log('Web service updated!');
          resolve(app);
        });
      });
    });
  }
};
