const  WebSocket = require('ws');
const url = require('url');
const DockerWrapper = require('../lib/DockerWrapper');
const App = require('../server/models').App;
const fetch = require('node-fetch');

const wsAppHealth = new WebSocket.Server({ noServer: true });
wsAppHealth.on('connection', async function connection(ws, request) {
  const appId = Number(url.parse(request.url, true).query.appId);
  const app = await App.findByPk(appId);
  const docker = await DockerWrapper.getManagerNodeInstance();

  const healthChecker = setInterval(async() => {
    const healthy = await DockerWrapper.appIsHealthy(app, docker);
    ws.send(healthy ? 'Healthy' : 'Unhealthy');
  }, 1000);

  ws.on('close', () => clearInterval(healthChecker));
});

const wsAppLogs = new WebSocket.Server({ noServer: true});
wsAppLogs.on('connection', async function connection(ws, request) {
  const appId = Number(url.parse(request.url, true).query.appId);
  const app = await App.findByPk(appId);
  const managerNode = await DockerWrapper.getManagerNodeInstance();
  const service = managerNode.getService(`${app.title}_web`);
  const duplex = WebSocket.createWebSocketStream(ws, { encoding: 'utf8' });

  const options = {
    stdout: true,
    stderr: true,
    follow: true,
  };

  service.logs(options, function handler(err, stream) {
    // I noticed when simply piping the stream to the WS client that weird
    // artifacts would sometimes be included at the beginning of lines.
    // See: https://github.com/moby/moby/issues/32794
    //
    // It turns out that Dockerode (or really, Docker Modem, which Dockerode uses
    // internally) comes with a nice piece of functionality for handling this,
    // called `demuxStream`
    // More info here: https://github.com/apocas/dockerode/issues/259#issuecomment-242434163
    service.modem.demuxStream(stream, duplex, duplex);

    stream.on('end', function(){
      console.log('wsAppLogs | stream.on end')
      stream.destroy();
    });

    ws.on('close', () => {
      console.log('wsAppLogs | ws.on close')
      stream.destroy();
    });
  });
});

// Terminal demo
const wsTerminal = new WebSocket.Server({ noServer: true });
wsTerminal.on('connection', async function connection(ws, request) {
  const docker = await DockerWrapper.getManagerNodeInstance();
  const duplex = WebSocket.createWebSocketStream(ws, { encoding: 'utf8' });
  const query = url.parse(request.url, true).query;
  let command = query && query.command ? query.command : 'bash';
  command = "/bin/herokuish procfile exec " + command;
  const appTitle = query.appTitle;
  const app = await App.findOne({
    where: { title: appTitle }
  });
  const network = await docker.getNetwork(app.network);

  let envVariables = [
    `DATABASE_HOST=${appTitle}_database`,
    `POSTGRES_DB=${appTitle}`,
    `POSTGRES_USER=postgres`,
    'POSTGRES_PASSWORD=password'
  ];
  envVariables = [...envVariables, ...app.envVariables];

  var optsc = {
    'AttachStdin': true,
    'AttachStdout': true,
    'AttachStderr': true,
    'Tty': true,
    'OpenStdin': true,
    'StdinOnce': false,
    'Env': envVariables,
    'Cmd': command.split(' '),
    'Image': appTitle + ':latest',
  };

  async function handler(err, container) {
    if (err) { console.log(err) }

    try {
      await network.connect({ Container: container.id });
    }
    catch(error) {
      console.log(error);
    };

    var attach_opts = {stream: true, stdin: true, stdout: true, stderr: true};

    container.attach(attach_opts, function handler(err, stream) {
      if (err) { console.log(err) }

      // Anything from the container goes to client
      stream.pipe(duplex);

      // Anything from client goes to the container
      duplex.setEncoding('utf8');
      duplex.pipe(stream);

      container.start(function(err, data) {
        if (err) { console.log(err) }
        duplex.write('container ready');
        container.wait(function(err, data) {
          if (err) { console.log(err) }
          container.remove();
          exit(stream);
        });
      });
    });
  }

  // Exit container
  function exit(stream) {
    process.stdin.removeAllListeners();
    stream.end();
  }

  docker.createContainer(optsc, handler);

  // TODO: Remove container when connection closes as well
});

// To authenticate the WebSocket request, we create a new request with headers
// from the WebSocket request EXCEPT for the upgrade and connection headers.
// This way, we create a normal request and don't trigger the upgrade server
// event, and Express gets to see the request (since we listen for upgrade
// requests to handle WS, the server never triggers a request event for these
// requests, and so Express doesn't get called). So this new request will go
// through our Express authentication middleware. If it returns 200, it means
// we made it through, otherwise it will return a 302 redirecting to /login,
// which means the request was not authenticated.
const authenticateRequest = async(request) => {
  const authPath = request.url.startsWith('/api') ? '/api/wsauth' : '/wsauth';

  const headersWithoutUpgrade = Object.keys(request.headers)
    .filter(key => key !== 'upgrade' && key !== 'connection')
    .reduce((headers, key) => {
      return { ...headers, [key]: request.headers[key] };
    }, {})

  // To attach the JWT token to the WebSocket request from the CLI, we have
  // to pass it as an extra argument to the WebSocket constructor. This creates
  // a new header on the upgrade request called `sec-websocket-protocol` with
  // the JWT as the value. Since our API authentication checks for an
  // Authorization header, we need to create that header set its value to the
  // JWT before sending our auth request
  if (Object.keys(request.headers).includes('sec-websocket-protocol')) {
    headersWithoutUpgrade['Authorization'] =
      'Bearer ' + request.headers['sec-websocket-protocol'];
  }

  const response = await fetch('https://localhost' + authPath, { // TODO: set dynamically using env var
    headers: headersWithoutUpgrade,
    redirect: 'manual'
  });

  return response.status === 200;
}

function selectHandlerAndUpgrade(request, socket, head) {
  const pathname = url.parse(request.url).pathname;

  switch (pathname) {
    case '/app-health':
      wsAppHealth.handleUpgrade(request, socket, head, function done(ws) {
    	  wsAppHealth.emit('connection', ws, request);
    	});
      break;
    case '/terminal':
      wsTerminal.handleUpgrade(request, socket, head, function done(ws) {
        wsTerminal.emit('connection', ws, request);
      });
      break;
    case '/app-logs':
      wsAppLogs.handleUpgrade(request, socket, head, function done(ws) {
        wsAppLogs.emit('connection', ws, request);
      });
      break;
    case '/api/app-logs':
      wsAppLogs.handleUpgrade(request, socket, head, function done(ws) {
        wsAppLogs.emit('connection', ws, request);
      });
      break;
    default:
      socket.destroy();
  }
}

module.exports = async(request, socket, head) => {
  const isAuthenticated = await authenticateRequest(request);

  if (!isAuthenticated) {
    socket.destroy();
    return;
  }

  selectHandlerAndUpgrade(request, socket, head);
};
