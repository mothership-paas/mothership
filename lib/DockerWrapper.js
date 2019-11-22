const Docker = require('dockerode');
const Machine = require('docker-machine');
const Node = require('../server/models').Node;
const fs = require('fs');
const path = require('path');
const uuidv1 = require('uuid/v1')
const slugify = require('slugify');
const tar = require('tar-fs');

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
  getManagerNodeInstance: async() => {
    return await getManagerNodeInstance()
  },

  buildDockerfile: (filename) => {
    return (app) => {
      return new Promise((resolve, reject) => {
        app.emitEvent('Building Dockerfile...');
        fs.writeFile(`./${app.path}/Dockerfile`, webDockerfileContent(filename), (err) => {
          if (err) { reject(err); }
          app.emitEvent('Built Dockerfile!');
          resolve(app);
        });
      });
    };
  },

  buildImage: (app) => {
    return new Promise(async (resolve, reject) => {
      const managerNode = await getManagerNodeInstance();
      const tarStream = tar.pack(app.path);

      app.emitEvent('Building image...');
      managerNode.buildImage(tarStream, {
        t: `${app.title}:latest`,
      }, function(error, output) {
        if (error) {
          return console.error(error);
        }

        output.pipe(process.stdout);
        output.on('data', data => app.emitStdout(data));
        output.on('end', function () {
          // send notification to client that build is ready
          app.emitEvent('Image built!');
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

      app.emitEvent('Creating service...');
      managerNode.createService(serviceParams, (error, result) => {
        if (error) { console.log(error); }
        app.emitEvent('Service created!');
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

      app.emitEvent('Creating network...');
      managerNode.createNetwork(networkOptions, (error, result) => {
        if (error) { console.log(error); }
        app.emitEvent('Network created!');
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

      app.emitEvent('Building db image...');
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
          app.emitEvent('DB image built!');
          app.emitEvent('Creating database service...');
          managerNode.createService(serviceParams, (error, result) => {
            if (error) { console.log(error); }
            app.emitEvent('Database service created!');
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

        app.emitEvent('Updating web service with DB env params');
        service.update(serviceParams, (error, result) => {
          if (error) { console.log(error); }
          app.emitEvent('Web service updated!');
          resolve(app);
        });
      });
    });
  }
};
