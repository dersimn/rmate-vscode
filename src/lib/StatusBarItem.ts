import * as vscode from 'vscode';
import Server from './Server';
import Logger from '../utils/Logger';

const L = Logger.getLogger('StatusBarItem');

class StatusBarItem {
  private _server: Server | undefined | null;
  public item: vscode.StatusBarItem;

  constructor() {
    L.trace('constructor');

    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right);
    this.item.text = '$(vm-outline)';
  }

  public get server() {
    return this._server;
  }

  public set server(server: Server | undefined | null) {
    L.trace('setServer');

    if (this._server) {
      L.debug('setServer', 'remove all listeners');
      this._server.removeAllListeners();
    }

    this._server = server;

    if (server) {
      this.handleEvents(server);
    }
  }

  handleEvents(server: Server) {
    L.trace('handleEvents');

    server.on('restarting', this.onRestarting.bind(this));
    server.on('starting', this.onStarting.bind(this));
    server.on('ready', this.onReady.bind(this));
    server.on('error', this.onError.bind(this));
    server.on('stopped', this.onStopped.bind(this));
    server.on('sessionCount', this.onSessionCount.bind(this));
  }

  onRestarting() {
    L.trace('onRestarting');

    this.item.tooltip = 'rmate: Restarting server...';
    this.item.text = '$(vm-connect)';
    this.item.show();
  }

  onStarting() {
    L.trace('onStarting');

    this.item.tooltip = 'rmate: Starting server...';
    this.item.text = '$(vm-connect)';
    this.item.show();
  }

  onReady() {
    L.trace('onReady');

    this.item.tooltip = 'rmate: Server ready.';
    this.item.text = '$(vm-active)';
    this.item.show();
  }

  onError(e: { code: string; }) {
    L.trace('onError');

    if (e.code === 'EADDRINUSE') {
      L.debug('onError', 'EADDRINUSE');
      this.item.tooltip = 'rmate error: Port already in use.';

    } else {
      this.item.tooltip = 'rmate error: Failed to start server.';
    }

    this.item.text = '$(vm-outline)';
    this.item.show();
  }

  onStopped() {
    L.trace('onStopped');

    this.item.tooltip = 'rmate: Server stopped.';
    this.item.hide();
  }

  onSessionCount(count : number) {
    if (count) {
      this.item.tooltip = `rmate: ${count} open Session${count > 1 ? 's' : ''}.`;
      this.item.text = '$(vm-running)';
    } else {
      this.item.tooltip = 'rmate: Server ready.';
      this.item.text = '$(vm-active)';
    }
  }
}

export default StatusBarItem;
