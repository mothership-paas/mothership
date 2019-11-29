const EventEmitter = require('events').EventEmitter;
const eventLogger = new EventEmitter();

module.exports = {
  eventLogger: eventLogger,

  appEvents: (req, res) => {
    const appId = req.params.appId;
    console.log('in appEvents');

    res.set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });

    const messageWriter = message => {
      if (message.trim() === '===END===') {
        console.log('Deregistering listener...');
        eventLogger.off(`message-${appId}`, messageWriter);
        res.write(`id: -1\n`);
        res.write(`data:\n\n`);
        return res.status(200).end();
      }

      if (message.trim() === '===ERROR===') {
        console.log('Deregistering listener...');
        eventLogger.off(`message-${appId}`, messageWriter);
        res.write('id: -2\n');
        res.write('data:\n\n');
        return res.status(200).end();
      }

      const data = JSON.stringify(message);
      res.write(`event: message\n`);
      res.write(`data: ${data}\n\n`);
    };

    console.log(`Creating listener for 'message-${appId}'`);
    eventLogger.on(`message-${appId}`, messageWriter);
  },

  appExecEvents: (req, res) => {
    const appId = req.params.appId;
    console.log('in appExecEvents');

    res.set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });

    eventLogger.on(`exec-message-${appId}`, function (message) {
      if (message.trim() === '===END===') {
        console.log('Deregistering listener...');
        eventLogger.off(`exec-message-${appId}`, () => {
          res.write(`id: -1\n`);
          res.write(`data:\n\n`);
          res.end()
          // return res.status(200).end();
        });
      }

      console.log('=========');
      message = message.split('\n');
      console.log(message);
      console.log('=========');
      res.write(`event: message\n`);
      res.write(`data: ${JSON.stringify(message)}\n\n`);
    });
  }
};
