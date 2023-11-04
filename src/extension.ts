'use strict';
import pkg from '../package.json';
import * as vscode from 'vscode';
import Server from './lib/Server';
import Logger from './utils/Logger';
import StatusBarItem from './lib/StatusBarItem';

const L = Logger.getLogger('extension');

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

  server.setPort(port);
  server.setHost(host);
  server.setDontShowPortAlreadyInUseError(dontShowPortAlreadyInUseError);
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

  var configuration = getConfiguration();
  onStartup = configuration.onStartup;
  port = configuration.port;
  host = configuration.host;
  dontShowPortAlreadyInUseError = configuration.dontShowPortAlreadyInUseError;

  if (onStartup) {
    startServer();
  }
};

const getConfiguration = () => {
  L.trace('getConfiguration');
  var remoteConfig = vscode.workspace.getConfiguration('remote');

  var configuration = {
    onStartup: remoteConfig.get<boolean>('onstartup'),
    dontShowPortAlreadyInUseError: remoteConfig.get<boolean>('dontShowPortAlreadyInUseError'),
    port: remoteConfig.get<number>('port'),
    host: remoteConfig.get<string>('host')
  };

  L.debug("getConfiguration", configuration);

  return configuration;
};

const onConfigurationChange = (event: vscode.ConfigurationChangeEvent) => {
  L.trace('onConfigurationChange');

  const affectsConfiguration = 
    !                                                             // if not
    Object.keys(pkg.contributes.configuration.properties).every(  // every config in package.json
      config => event.affectsConfiguration(config) === false      // is false
    );
  L.trace('affectsConfiguration', affectsConfiguration);          // our configuration is affected

  if (affectsConfiguration) {
    initialize();
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

  context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(onConfigurationChange));
}

export function deactivate() {
  stopServer();
}
