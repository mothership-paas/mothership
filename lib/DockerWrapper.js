const Docker = require('dockerode');
const Machine = require('docker-machine');
const Node = require('../server/models').Node;
const Config = require('../server/models').Config;
const fs = require('fs');
const path = require('path');
const uuidv1 = require('uuid/v1')
const slugify = require('slugify');
const tar = require('tar-fs');
const moment = require('moment');
const errHandler = e => console.log(e);

const webDockerfileContent = (filename) => {
  return `FROM gliderlabs/herokuish as builder
COPY ${filename} /tmp/app/
COPY .bashrc /tmp/app
ENV USER=herokuishuser
WORKDIR /tmp/app
RUN unzip ${filename}
RUN rm ${filename}
RUN /bin/herokuish buildpack build

FROM gliderlabs/herokuish
COPY --chown=herokuishuser:herokuishuser --from=builder /app /app
ENV PORT=4567
ENV USER=herokuishuser
EXPOSE 4567
CMD ["/bin/herokuish", "procfile", "start", "web"]`;
};

const DB_DOCKERFILE_CONTENT = `FROM postgres`;

const DB_DOCKERFILE_WITH_SCHEMA_CONTENT = `FROM postgres
COPY Dockerfile schema.* /docker-entrypoint-initdb.d/`;

const getNodeInstance = (name) => {
  return new Promise((resolve, reject) => {
    Node.findOne({ where: { name }}).then((node) => {
      const machine = new Machine(node.name);

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

const getNodeIp = (name) => {
  return new Promise(async(resolve, reject) => {
    const node = await Node.findOne({ where: { name }});
    const machine = new Machine(node.name);

    machine.inspect((err, result) => {
      if (err) { reject(err); }
      resolve(result.driver.ipAddress);
    });
  })
};

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

const getManagerNodeIp = () => {
  return new Promise(async (resolve, reject) => {
    const manager = await Node.findOne({ where: { manager: true }});

    if (manager && manager.ip_address) {
      resolve(manager.ip_address);
    } else {
      reject('Node IP Address not found!');
    }
  });
};

const getCurrentServiceConfig = (service) => {
  return new Promise((resolve, reject) => {
    service.inspect((error, result) => {
      if (error) { reject(error); }
      resolve(result);
    });
  });
};

const generateServiceEnvVars = async (app) => {
    const hasDatabase = app.databaseId !== null;

    let envVariables = [];

    if (hasDatabase) {
      envVariables = [`DATABASE_HOST=${app.title}_database`,
                      "POSTGRES_USER=postgres",
                      "POSTGRES_PASSWORD=password",
                      `POSTGRES_DB=${app.title}`];
    }

    if (app.envVariables) {
      envVariables = [...envVariables, ...app.envVariables];
    }

    return envVariables;
};

const buildDbDockerfile = (app) => {
  return new Promise((resolve, reject) => {
    fs.access(`./${app.path}/db/schema.sql`, fs.constants.F_OK, (err) => {
      let schemaExists = err ? false : true;
      let dockerfileContent = schemaExists ? DB_DOCKERFILE_WITH_SCHEMA_CONTENT : DB_DOCKERFILE_CONTENT;

      fs.writeFileSync(`./${app.path}/db/Dockerfile`, dockerfileContent);
      resolve(app);
    });
  });
};

const createMachine = (name, accessToken) => {
  return () => {
    return new Promise((resolve, reject) => {
      const options = { 'digitalocean-access-token': accessToken };

      console.log(`Creating docker machine '${name}'...`);
      Machine.create(name, 'digitalocean', options, (err, result) => {
        if (err) { reject(err); }
        resolve();
      });
    });
  };
};

const removeMachine = (name) => {
  return () => {
    return new Promise((resolve, reject) => {
      Machine.command(['rm', name, '-y'], (err, result) => {
        if (err) { reject(err); }
        resolve(result);
      });
    });
  };
};

const getWorkerJoinToken = () => {
  return new Promise(async (resolve, reject) => {
    const dockerManagerNode = await getManagerNodeInstance();

    dockerManagerNode.swarmInspect((err, result) => {
      if (err) { reject(err); }
      resolve(result.JoinTokens.Worker);
    });
  });
};

const joinSwarm = (name) => {
  return () => {
    return new Promise(async (resolve, reject) => {
      console.log('Getting worker node...');
      const workerIp = await getNodeIp(name).catch(errHandler);
      const managerIp = await getManagerNodeIp().catch(errHandler);
      const workerNode = await getNodeInstance(name).catch(errHandler);

      console.log('Getting join token...');
      const joinToken = await getWorkerJoinToken().catch(err => console.log(err));
      const options = {
        'ListenAddr': '0.0.0.0:2377',           // This is the default in the docker API (dockerode seems to pass '' if not specified)
        'AdvertiseAddr': workerIp,              // IP address of the worker node
        'RemoteAddrs': [`${managerIp}:2377`],   // IP Address of manager node
        'JoinToken': joinToken,
      };

      console.log('Attempting to join swarm...');
      workerNode.swarmJoin(options, (err, result) => {
        if (err) { reject(err); }
        resolve(name);
      });
    });
  }
};

const workerLeaveSwarm = (name) => {
  return () => {
    return new Promise(async (resolve, reject) => {
      const worker = await getNodeInstance(name);
      worker.swarmLeave({}, (err, result) => {
        if (err) { reject(err); }
        resolve(result);
      });
    });
  };
};

module.exports = {
  getNodeInstance: async (name) => {
    return await getNodeInstance(name)
  },

  getManagerNodeInstance: async () => {
    return await getManagerNodeInstance()
  },

  getManagerNodeIp: () => {
    return getManagerNodeIp();
  },

  getNodeIp: (name) => {
    return getNodeIp(name);
  },

  createMachine: (name, accessToken) => {
    return createMachine(name, accessToken);
  },

  removeMachine: (name) => {
    return removeMachine(name);
  },

  joinSwarm: (name) => {
    return joinSwarm(name);
  },

  workerLeaveSwarm: (name) => {
    return workerLeaveSwarm(name);
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
      fs.copyFileSync(__dirname + '/bashrc', app.path + '/.bashrc');
      const tarStream = tar.pack(app.path);

      app.emitEvent('Building image...');
      managerNode.buildImage(tarStream, {
        t: `${app.title}:latest`,
      }, function(error, output) {
        if (error) {
          reject(app);
          return console.error(error);
        }

        output.on('data', data => {
          let dataString = data.toString();
          let dataObject;

          if(dataString) {
            try {
              dataObject = JSON.parse(dataString);
            } catch(e) {
              console.log(e); // error in the above string (in this case, yes)!
            }
          }

          if (dataObject) {
            console.log(dataObject);
          }

          if (dataObject && dataObject.errorDetail) {
            app.emitEvent(dataObject.errorDetail.message);
            app.emitEvent('===ERROR===');
            reject(new Error(dataObject.errorDetail.message));
          } else if (dataObject && dataObject.stream && dataObject.stream.match(/Successfully tagged/i)) {
            app.emitStdout(dataString);
            resolve(app);
          } else {
            app.emitStdout(dataString);
          }
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
        "Driver": "overlay",
        "Attachable": true,
        "Options": {
          "com.docker.network.overlay.encrypted": "true",
        }
      };

      app.emitEvent('Creating network...');
      managerNode.createNetwork(networkOptions, (error, result) => {
        if (error) { console.log(error); }
        app.emitEvent('Network created!');
        resolve(app);
      });
    });
  },

  createDatabase: async (app) => {
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
            ],
            "Mounts": [
              {
                "Source": `${app.title}_db_data`,
                "Target": "/var/lib/postgresql/data",
                "Type": "volume",
              }
            ]
          },
          "Networks": [
            { "Target": `${app.network}` }
          ]
        },
      };

      await buildDbDockerfile(app);

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

        app.emitEvent('Updating web service with DB env params');
        service.update(serviceParams, (error, result) => {
          if (error) { console.log(error); }
          app.emitEvent('Web service updated!');
          resolve(app);
        });
      });
    });
  },


  updateService: (updateConfig = {}) => {
    return (app) => {
      return new Promise(async (resolve, reject) => {
        app.emitEvent('Updating service...');
        const managerNode = await getManagerNodeInstance();
        const service = managerNode.getService(`${app.title}_web`);
        const currentServiceConfig = await getCurrentServiceConfig(service);

        const currentServiceSpec = currentServiceConfig.Spec;
        const versionSpec = { _query: { "version": currentServiceConfig.Version.Index }};
        const newConfig = Object.assign({}, currentServiceSpec, updateConfig, versionSpec);

        newConfig.TaskTemplate.ContainerSpec.Env = await generateServiceEnvVars(app);
        newConfig.TaskTemplate.ForceUpdate += 1;

        service.update(newConfig, (error, result) => {
          if (error) {
            console.log(error);
            reject(error);
          }

          app.emitEvent('Web service updated!');
          console.log('Web service updated!');
          resolve(app);
        });
      });
    };
  },

  destroyService: (app) => {
    return new Promise(async (resolve, reject) => {
      console.log('Deleting web service...');
      const managerNode = await getManagerNodeInstance();

      const service = managerNode.getService(`${app.title}_web`);

      service.remove((error, result) => {
        if (error) {
          console.log(error);
          reject(error);
        }

        console.log('Web service deleted!')
        resolve(app);
      });
    });
  },

  destroyNetwork: (app) => {
    return new Promise(async (resolve, reject) => {
      console.log('Deleting network...');
        const managerNode = await getManagerNodeInstance();

        const network = managerNode.getNetwork(`${app.title}_default`);

        network.remove((error, result) => {
          if (error) {
            console.log(error);
            reject(error);
          }

          console.log('Network deleted!')
          resolve(app);
        });
    });
  },

  destroyDatabaseService: (app) => {
    return new Promise(async (resolve, reject) => {
      console.log('Deleting database service...');
      const managerNode = await getManagerNodeInstance();

      const service = managerNode.getService(`${app.title}_database`);

      service.remove((error, result) => {
        if (error) {
          console.log(error);
          reject(error);
        }

        app.emitEvent('Database service deleted!')
        resolve(app);
      });
    });
  },

  pruneDatabaseVolume: (app) => {
    return new Promise(async (resolve, reject) => {
      console.log('Pruning database volume...');
      const managerNode = await getManagerNodeInstance();

      managerNode.pruneVolumes((error, result) => {
        if (error) {
          console.log(error);
          reject(error);
        }

        app.emitEvent('Database volume pruned!')
        resolve(app);
      });
    });
  },

  // This function takes an optional docker manager argument.
  // We do this so that our websockets can obtain a manager instance
  // on their own when they first connect to a client, that way
  // we hit the database for the manager (and app) only once instead
  // of every second when we call this method.
  appIsHealthy: async(app, docker) => {
    if (docker === undefined) {
      docker = await getManagerNodeInstance();
    }

    const services = await docker.listServices();
    const service = services.find(service => {
      return service.Spec.Name === app.title + '_web';
    });

    const allTasks = await docker.listTasks();
    const serviceTasks = allTasks.filter(task => task.ServiceID === service.ID);
    const failedTasks = serviceTasks.filter(task => {
      return task.Status.State === 'failed';
    });

    const recentlyFailed = failedTasks.filter(task => {
      const now = moment();
      const failTime = new moment(task.Status.Timestamp);
      return now.diff(failTime, 'minutes') < 1;
    });

    return recentlyFailed.length < 3;
  },
};
