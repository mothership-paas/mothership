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


module.exports = function upgrade(request, socket, head) {
  const pathname = url.parse(request.url).pathname;

  switch (pathname) {
    case '/app-health':
    	wsAppHealth.handleUpgrade(request, socket, head, function done(ws) {
    	  wsAppHealth.emit('connection', ws, request);
    	});
      break
    default:
	   socket.destroy();
 }
};