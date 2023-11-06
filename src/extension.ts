'use strict';
import pkg from '../package.json';
import * as vscode from 'vscode';
import Server from './lib/Server';
import Logger from './utils/Logger';
import StatusBarItem from './lib/StatusBarItem';
import Session from './lib/Session';

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

  server = new Server(
    workspaceConfiguration.get<string>('host') ?? '127.0.0.1',
    workspaceConfiguration.get<number>('port') ?? 52698,
    {
      showPortAlreadyInUseError: workspaceConfiguration.get<boolean>('showPortAlreadyInUseError') ?? true
    }
  );
  statusBarItem.server = server;
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
  context.subscriptions.push(vscode.commands.registerCommand('extension.closeDocument', closeDocument));
  context.subscriptions.push(vscode.commands.registerCommand('extension.closeAllDocuments', closeAllDocuments));

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

  context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(editor => {
    L.trace('onDidChangeActiveTextEditor');
    const currentEditorFilePath = editor?.document.uri.path;
    L.trace('currentEditorFilePath', currentEditorFilePath)

    if (server?.sessions && currentEditorFilePath) {
      const ourFiles = [...server?.sessions]
                        .map(session => session.remoteFiles).flat()
                        .map(remoteFile => remoteFile.localFilePath);
      L.trace('ourFiles', ourFiles);

      const currentEditorIsOurs = ourFiles.includes(currentEditorFilePath);
      if (currentEditorIsOurs) {
        vscode.commands.executeCommand('setContext', 'rmate.activeEditorIsOurs', true);
        return;
      }
    }
    vscode.commands.executeCommand('setContext', 'rmate.activeEditorIsOurs', false);
  }));
}

export function deactivate() {
  stopServer();
}

async function closeDocument() {
  L.trace('closeDocument');

  if (!server) {
    vscode.window.showErrorMessage('Server is not started.');
    return;
  }

  interface SessionQuickPick extends vscode.QuickPickItem {
    session: Session
  }

  const openFiles: Array<SessionQuickPick> = [...server.sessions].map(session => {
    const remoteHost = session.remoteFiles[0].remoteHost;
    L.trace(remoteHost, session.remoteFiles);

    return {
      session,
      label: remoteHost ?? 'Unknown',
      description: session.remoteFiles.map(remoteFile => remoteFile.remoteBaseName).join(', '),
      iconPath: new vscode.ThemeIcon('file' + (session.remoteFiles.length > 1) ? 's' : '')
    };
  });
  L.trace('closeDocument > openFiles', openFiles);

  const selected = await vscode.window.showQuickPick(openFiles, {title: 'Open RMate Sessions:'});
  L.trace('closeDocument > selected', selected);

  selected?.session.closeAll();
}

async function closeAllDocuments() {
  if (!server) {
    vscode.window.showErrorMessage('Server is not started.');
    return;
  }

  for (const session of server.sessions) {
    session.closeAll();
  }
}
