const  WebSocket = require('ws');
const url = require('url');
const DockerWrapper = require('../lib/DockerWrapper');
const App = require('../server/models').App;

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

// Terminal demo
const wsTerminal = new WebSocket.Server({ noServer: true });
wsTerminal.on('connection', async function connection(ws) {
  const docker = await DockerWrapper.getManagerNodeInstance();
  const duplex = WebSocket.createWebSocketStream(ws, { encoding: 'utf8' });

  var optsc = {
    'AttachStdin': true,
    'AttachStdout': true,
    'AttachStderr': true,
    'Tty': true,
    'OpenStdin': true,
    'StdinOnce': false,
    'Env': null,
    'Cmd': ['bash'],
    'Image': 'ubuntu',
  };

  function handler(err, container) {
    var attach_opts = {stream: true, stdin: true, stdout: true, stderr: true};

    container.attach(attach_opts, function handler(err, stream) {
      // Anything from the container goes to client
      stream.pipe(duplex);

      // Anything from client goes to the container
      duplex.setEncoding('utf8');
      duplex.pipe(stream);

      container.start(function(err, data) {
        duplex.write('container ready');
        container.wait(function(err, data) {
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


module.exports = function upgrade(request, socket, head) {
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
    default:
	   socket.destroy();
 }
};