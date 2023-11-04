'use strict';
import pkg from '../package.json';
import * as vscode from 'vscode';
import Server from './lib/Server';
import Logger from './utils/Logger';
import StatusBarItem from './lib/StatusBarItem';

const L = Logger.getLogger('extension');

let workspaceConfiguration : vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration('remote');
let server : Server | undefined | null;
let statusBarItem : StatusBarItem = new StatusBarItem();

const startServer = () => {
  L.trace('startServer');

  if (server) {
    vscode.window.showErrorMessage('Server is already started, use `stopServer` first.');
    return;
  }

  server = new Server();
  statusBarItem.server = server;

  server.setPort(workspaceConfiguration.get<number>('port') ?? 52698);
  server.setHost(workspaceConfiguration.get<string>('host') ?? '127.0.0.1');
  server.setDontShowPortAlreadyInUseError(workspaceConfiguration.get<boolean>('dontShowPortAlreadyInUseError') ?? false);
  server.start(false);
};

const stopServer = () => {
  L.trace('stopServer');

  if (server) {
    server.stop();
    server = null;
  }
};

const restartServer = () => {
  L.trace('restartServer');

  stopServer();
  startServer();
};

export function activate(context: vscode.ExtensionContext) {
  L.trace('pkg.name', pkg.name);
  if (workspaceConfiguration.get<boolean>('onstartup')) {
    startServer();
  }

	context.subscriptions.push(vscode.commands.registerCommand('extension.startServer', startServer));
  context.subscriptions.push(vscode.commands.registerCommand('extension.stopServer', stopServer));
  context.subscriptions.push(vscode.commands.registerCommand('extension.restartServer', restartServer));
  context.subscriptions.push(vscode.commands.registerCommand('extension.closeDocument', () => {
    if (!server) {
      vscode.window.showErrorMessage('Server is not started.');
      return;
    }

    server.closeDocument();
  }));

  context.subscriptions.push(vscode.workspace.onDidChangeConfiguration((event: vscode.ConfigurationChangeEvent) => {
    L.trace('onDidChangeConfiguration');
  
    const affectsConfiguration = 
      !                                                             // if not
      Object.keys(pkg.contributes.configuration.properties).every(  // every config in package.json
        config => event.affectsConfiguration(config) === false      // is false
      );
    L.trace('affectsConfiguration', affectsConfiguration);          // our configuration is affected
  
    if (affectsConfiguration) {
      workspaceConfiguration = vscode.workspace.getConfiguration('remote');
      restartServer();
    }
  }));
}

export function deactivate() {
  stopServer();
}
