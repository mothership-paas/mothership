class AppShowController {
  constructor(id, title, deployed) {
    this.app = {
      id: id,
      title: title,
      deployed: deployed
    };
  };

  enableAppHealth() {
    const output = document.getElementById('app-health');
    if (!this.app.deployed) {
      output.innerHTML = 'Not yet deployed';
      return;
    }

    const healthUrl = `ws://${window.location.host}/app-health?appId=${this.app.id}`;
    const websocket = new WebSocket(healthUrl);

    websocket.onopen = () => console.log('Connected to app-health');
    websocket.onerror = (event) => console.log(event.data);
    websocket.onclose = () => console.log('Disconnected from app-health');
    websocket.onmessage = (event) => {
      if (event.data === 'Healthy') {
        output.classList.add('is-success');
      } else {
        output.classList.add('is-danger');
      }
      output.innerHTML = event.data;
    }
  };

  enableDbDestroyButtons() {
    const destroyButton = document.getElementById('dbdestroy');
    const destroyModal = document.getElementById('dbdestroy-modal');
    const cancelButton = document.getElementById('dbdestroy-cancel');

    if (destroyButton) {
      destroyButton.addEventListener('click', () => {
        destroyModal.classList.add('is-active');
      });
    }

    if (cancelButton) {
      cancelButton.addEventListener('click', (event) => {
        event.preventDefault();
        destroyModal.classList.remove('is-active');
      });
    }
  };

  enableAppConsole() {
    Terminal.applyAddon(attach);
    Terminal.applyAddon(fit);

    const terminalModal = document.getElementById('terminal-modal');
    const terminalModalBackground = document.querySelector('#terminal-modal .modal-background');
    const execOpenLink = document.querySelector('#exec-open');
    const loadingIndicator = terminalModal.querySelector('.loading-wrapper');
    let term;
    let websocket;

    terminalModalBackground.addEventListener('click', (event) => {
      terminalModal.classList.remove('is-active');
      websocket.close();
      document.getElementById('terminal').innerHTML = '';
    });

    execOpenLink.addEventListener('click', (event) => {
      event.preventDefault();
      terminalModal.classList.add('is-active');

      websocket = new WebSocket(
        `ws://localhost:3000/terminal?appTitle=${this.app.title}&command=bash`
      );

      term = new Terminal({
        cursorBlink: true,
        fontFamily: 'Fira Code',
        theme: {
          black: '#252525',
          red: '#FF443E',
          brightRed: '#FF443E',
          green: '#C3D82C',
          yellow: '#FFC135',
          blue: '#42A5F5',
          magenta: '#FF4081',
          white: '#F5F5F5',
          foreground: '#A1B0B8',
          background: '#151515',
        }
      });

      websocket.onopen = () => {
        console.log('Connected to test');
      };
      websocket.onerror = (event) => console.log(event.data);
      websocket.onclose = () => {
        // TODO: hide cursor
        console.log('Disconnected from test')
      };
      websocket.onmessage = (event) => {
        // Data is sent back as a Blob, and Safari doesn't
        // support Blob.prototype.text(), so we wrapt it in
        // a response object and extract the text from that
        const response = new Response(event.data);
        response.text()
          .then((text) => {
            if (text === 'container ready') {
              loadingIndicator.style.display = "none";
              term.open(document.getElementById('terminal'));
              term.focus();
              term.on('data', data => {
                websocket.send(data);
              });
            } else {
              term.write(text);
            }
          })
          .catch(console.log);
      }
    });
  };

  enableFilepickers() {
    // Update zip file upload field to reflect name of uploaded file
     const fileInputZip = document.querySelector('#file-js-zip input[type=file]');
     if (fileInputZip) {
       fileInputZip.onchange = () => {
         if (fileInputZip.files.length > 0) {
           const fileNameZip = document.querySelector('#file-js-zip .file-name');
           fileNameZip.textContent = fileInputZip.files[0].name;
         }
       }
     }

     // Update schema file upload field to reflect name of uploaded file
     const fileInputSQL = document.querySelector('#file-js-sql input[type=file]');
     if (fileInputSQL) {
       fileInputSQL.onchange = () => {
         if (fileInputSQL.files.length > 0) {
           const fileNameSQL = document.querySelector('#file-js-sql .file-name');
           fileNameSQL.textContent = fileInputSQL.files[0].name;
         }
       }
     }
  };

  enableBuildTerminal() {
    const terminalWrapper = document.getElementById('build-terminal');
    const url = new URL(document.location.href);
    const urlParams = new URLSearchParams(url.search);
    const showTerminal = urlParams.has('events');
    let buildTerminal;

    if (showTerminal) {
      buildTerminal = new Terminal({
        convertEol: true,
        fontFamily: 'Fira Code',
        theme: {
          black: '#252525',
          red: '#FF443E',
          brightRed: '#FF443E',
          green: '#C3D82C',
          yellow: '#FFC135',
          blue: '#42A5F5',
          magenta: '#FF4081',
          white: '#F5F5F5',
          foreground: '#A1B0B8',
          background: '#151515',
        }
      });
      const appEventEndpoint = new EventSource(`/events/${this.app.id}`);

      const minimizeTerminal = () => {
        terminalWrapper.querySelector('details').removeAttribute('open');
      };

      const messageHandler = (event) => {
        if (event.lastEventId === '-1') {
          appEventEndpoint.close();
          terminalWrapper.classList.add('build-terminal-complete');
          minimizeTerminal();
          terminalWrapper
            .querySelector('summary')
            .innerHTML = '<span class="icon has-text-success"><i class="fa fa-check-circle"></i></span> Build complete!';

          const elementsToEnable = document.querySelectorAll('.not-yet-deployed');
          for (let i = 0; i < elementsToEnable.length; i += 1) {
            elementsToEnable[i].classList.remove('not-yet-deployed');
          }
          return;
        }

        if (event.lastEventId === '-2') {
          appEventEndpoint.close();
          terminalWrapper.classList.add('build-terminal-failed');
          terminalWrapper
            .querySelector('summary')
            .innerHTML = '<span class="icon has-text-danger"><i class="fa fa-times-circle"></i></span> Build failed!';
          return;
        }

        const message = JSON.parse(event.data);
        buildTerminal.write(message);
      };

      const openHandler = () => {
        // This only unhides the terminal _if_ we get a message from the server.
        terminalWrapper.style.display = 'block';
        buildTerminal.open(document.getElementById('xterm-build-terminal'));
      };

      const errorHandler = (error) => {
        appEventEndpoint.close();
      };

      appEventEndpoint.addEventListener('open', openHandler);
      appEventEndpoint.addEventListener('message', messageHandler);
      appEventEndpoint.addEventListener('error', errorHandler);
    }
  };

  enableDropdown() {
    const dropdown = document.querySelector('.dropdown');
    const dropdownTrigger = document.querySelector('.dropdown-trigger');
    if (dropdownTrigger) {
      dropdownTrigger.addEventListener('click', () => dropdown.classList.toggle('is-active'));
    }
  };

  enableSchemaAttach() {
    const attachSchemaLink = document.querySelector('.attach-schema');

    if (attachSchemaLink) {
      attachSchemaLink.addEventListener('click', (evt) => {
        evt.preventDefault();
        const schemaField = document.querySelector('.schema-field');
        if (schemaField) {
          attachSchemaLink.style.display = 'none';
          schemaField.style.display = 'initial';
        }
      });
    }
  };

  enableAppLogs() {
    const logModal = document.getElementById('log-terminal-modal');
    const logModalBackground = document.querySelector('#log-terminal-modal .modal-background');
    const logsOpenLink = document.querySelector('#logs-open');
    const loadingIndicator = logModal.querySelector('.loading-wrapper');
    const logsModalCloseButton = logModal.querySelector('.modal-close');
    let logTerminal;
    let websocket;

    const closeHandler = (event) => {
      logModal.classList.remove('is-active');
      websocket.close();
      document.getElementById('log-terminal').innerHTML = '';
    };

    logsModalCloseButton.addEventListener('click', closeHandler);
    logModalBackground.addEventListener('click', closeHandler);

    logsOpenLink.addEventListener('click', (e) => {
      console.log('logsOpenLink')
      e.preventDefault();
      logModal.classList.add('is-active');

      websocket = new WebSocket(
        `ws://${window.location.host}/app-logs?appId=${this.app.id}`
      );

      websocket.onopen = () => {
        logTerminal = new Terminal({
          convertEol: true,
          fontFamily: 'Fira Code',
          theme: {
            black: '#252525',
            red: '#FF443E',
            brightRed: '#FF443E',
            green: '#C3D82C',
            yellow: '#FFC135',
            blue: '#42A5F5',
            magenta: '#FF4081',
            white: '#F5F5F5',
            foreground: '#A1B0B8',
            background: '#151515',
          }
        });

        loadingIndicator.style.display = "none";
        logTerminal.open(document.getElementById('log-terminal'));
      };

      websocket.onerror = (event) => console.log(event.data);
      websocket.onclose = () => console.log('Disconnected from app-logs');

      websocket.onmessage = (event) => {
        // Data is sent back as a Blob, and Safari doesn't
        // support Blob.prototype.text(), so we wrapt it in
        // a response object and extract the text from that
        const response = new Response(event.data);
        response.text()
          .then((text) => {
            logTerminal.write(text)
          })
          .catch(console.log);
      }
    });
  }

  init() {
    this.enableDropdown();
    this.enableFilepickers();
    this.enableSchemaAttach();
    this.enableDbDestroyButtons();

    this.enableAppLogs();
    this.enableAppHealth();
    this.enableAppConsole();
    this.enableBuildTerminal();
  }
};
