import * as net from 'net';
import Session from './Session';
import * as vscode from 'vscode';
import Logger from '../utils/Logger';
import {EventEmitter} from 'events';

const L = Logger.getLogger('Server');

class Server extends EventEmitter {
  private options : {showPortAlreadyInUseError: boolean} = {
    showPortAlreadyInUseError: true
  };
  sessions = new Set<Session>();
  server : net.Server;

  constructor(host: string, port: number, options?: {showPortAlreadyInUseError: boolean}) {
    super();
    L.trace('constructor');

    Object.assign(this.options, options);

    vscode.window.setStatusBarMessage('Starting server', 2000);
    this.emit('starting');

    this.server = net.createServer(this.onServerConnection.bind(this));
    this.server.on('listening', this.onServerListening.bind(this));
    this.server.on('error', this.onServerError.bind(this));
    this.server.on('close', this.onServerClose.bind(this));

    this.server.listen(port, host);
  }

  onServerConnection(socket: net.Socket) {
    L.trace('onServerConnection');

    var session = new Session(socket);

    this.sessions.add(session);
    this.emit('sessionCount', this.sessions.size);

    session.on('close', () => {
      this.sessions.delete(session);
      this.emit('sessionCount', this.sessions.size);
    });
  }

  onServerListening() {
    L.trace('onServerListening');
    this.emit('ready');
  }

  onServerError(e: { code: string; port: any; }) {
    L.trace('onServerError', e);

    this.emit('error', e);

    if (e.code === 'EADDRINUSE') {
      if (this.options.showPortAlreadyInUseError) {
        return vscode.window.showErrorMessage(`Failed to start server, port ${e.port} already in use`);
      } else {
        return;
      }
    }
  }

  onServerClose() {
    L.trace('onServerClose');
  }

  stop() {
    L.trace('stop');

    vscode.window.setStatusBarMessage('Stopping server', 2000);
    this.server.close();
    this.emit('stopped');
  }
}

export default Server;
