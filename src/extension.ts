'use strict';
import pkg from '../package.json';
import * as vscode from 'vscode';
import Server from './lib/Server';
import Logger from './utils/Logger';
import StatusBarItem from './lib/StatusBarItem';

const L = Logger.getLogger('extension');

let workspaceConfiguration : vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration('remote');
var server : Server;
var port : number;
var host : string;
var onStartup : boolean;
var dontShowPortAlreadyInUseError : boolean;
var statusBarItem : StatusBarItem;

const startServer = () => {
  L.trace('startServer');

  if (!server) {
    server = new Server();
  }

  if (!statusBarItem) {
    statusBarItem = new StatusBarItem();
  }

  server.setPort(workspaceConfiguration.get<number>('port') ?? 52698);
  server.setHost(workspaceConfiguration.get<string>('host') ?? '127.0.0.1');
  server.setDontShowPortAlreadyInUseError(workspaceConfiguration.get<boolean>('dontShowPortAlreadyInUseError') ?? false);
  server.start(false);

  statusBarItem.setServer(server);
};

const stopServer = () => {
  L.trace('stopServer');

  if (server) {
    server.stop();
  }
};

const initialize = () => {
  L.trace('initialize');

  if (workspaceConfiguration.get<boolean>('onstartup')) {
    startServer();
  }
};

export function activate(context: vscode.ExtensionContext) {
  L.trace('pkg.name', pkg.name);
  initialize();

	context.subscriptions.push(vscode.commands.registerCommand('extension.startServer', startServer));
  context.subscriptions.push(vscode.commands.registerCommand('extension.stopServer', stopServer));
  context.subscriptions.push(vscode.commands.registerCommand('extension.closeDocument', () => {
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
      initialize();
    }
  }));
}

export function deactivate() {
  stopServer();
}
