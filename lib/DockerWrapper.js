const Docker = require('dockerode');
const Machine = require('docker-machine');
const Node = require('../server/models').Node;
const Config = require('../server/models').Config;
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
  buildDockerfile: (filename) => {
    return (app) => {
      return new Promise((resolve, reject) => {
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

      console.log('Building image...');
      managerNode.buildImage(tarStream, {
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
  },

  createService: (app) => {
    return new Promise(async (resolve, reject) => {
      const managerNode = await getManagerNodeInstance();
      const proxyConfig = await Config.findOne({
        where: { key: 'proxyNetwork' }
      });

      const serviceParams = {
        "Name": `${app.title}_web`,
        "Labels": {
          "com.df.notify": "true",
          "com.df.serviceDomain": app.url,
          "com.df.port": "4567" // TODO: This shouldn't be hard-coded
        },
        "TaskTemplate": {
          "ContainerSpec": {
            "Image": `${app.title}:latest`,
          },
          "Networks": [
            { "Target": `${app.network}` },
            { "Target": proxyConfig.value } 
          ]
        },
      };

      console.log('Creating service...');

      managerNode.createService(serviceParams, (error, result) => {
        if (error) { console.log(error); }
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

      console.log('Creating network...');
      managerNode.createNetwork(networkOptions, (error, result) => {
        if (error) { console.log(error); }
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
            "Env": [
              "POSTGRES_USER=postgres",
              "POSTGRES_PASSWORD=password",
              `POSTGRES_DB=${app.title}`
            ]
          },
          "Networks": [
            { "Target": `${app.network}` }
          ]
        },
      };

      fs.writeFileSync(`./${app.path}/db/Dockerfile`, DB_DOCKERFILE_CONTENT);

      const tarStream = tar.pack(app.path + '/db');

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
          console.log('DB image built!');
          console.log('Creating database service...');
          managerNode.createService(serviceParams, (error, result) => {
            if (error) { console.log(error); }
            console.log('Database service created!');
            resolve(app);
          });
        });
      });
    });
  },

  setDatabaseEnvVariablesForApp:(app) => {
    return new Promise(async (resolve, reject) => {
      const managerNode = await getManagerNodeInstance();
      const proxyConfig = await Config.findOne({
        where: { key: 'proxyNetwork' }
      });

      const serviceParams = {
        "Name": `${app.title}_web`,
        "Labels": {
          "com.df.notify": "true",
          "com.df.serviceDomain": app.url,
          "com.df.port": "4567" 
        },
        "TaskTemplate": {
          "ContainerSpec": {
            "Image": `${app.title}:latest`,
            "Env": [
              `DATABASE_HOST=${app.title}_database`,
              "POSTGRES_USER=postgres",
              "POSTGRES_PASSWORD=password",
              `POSTGRES_DB=${app.title}`
            ]
          },
          "Networks": [
            { "Target": `${app.network}` },
            { "Target": proxyConfig.value }
          ]
        },
      };

      const service = managerNode.getService(`${app.title}_web`);

      service.inspect((error, result) => {
        const version = result.Version.Index;
        serviceParams._query = { "version": version };

        console.log('Updating web service with database env params');
        service.update(serviceParams, (error, result) => {
          if (error) { console.log(error); }
          console.log('Web service updated!');
          resolve(app);
        });
      });
    });
  }
};
