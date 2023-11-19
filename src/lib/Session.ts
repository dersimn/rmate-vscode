import {EventEmitter} from 'events';
import * as vscode from 'vscode';
import * as net from 'net';
import Logger from '../utils/Logger';
import RemoteFile from './RemoteFile';

const L = Logger.getLogger('Session');

class Session extends EventEmitter {
  remoteFiles : RemoteFile[] = [];
  currentId : number = 0;
  socket : net.Socket;
  online : boolean;
  attempts : number = 0;
  closeTimeout : NodeJS.Timeout | undefined;

  constructor(socket : net.Socket) {
    super();
    L.trace('constructor');

    this.socket = socket;
    this.online = true;

    this.socket.on('data', this.onSocketData.bind(this));
    this.socket.on('close', this.onSocketClose.bind(this));

    this.socket.write('VSCode 1\n');
  }

  onSocketData(chunk : Buffer) {
    L.trace('onSocketData');

    if (chunk) {
      this.parseChunk(chunk);
    }
  }

  onSocketClose() {
    L.trace('onSocketClose');
    this.online = false;
  }

  parseChunk(buffer : Buffer) {
    L.trace('parseChunk', buffer.length);
    L.trace('buffer', buffer);
    L.trace('buffer.toString()', buffer.toString());

    if (!this.remoteFiles[this.currentId]?.waitingForData) {
      while (buffer.length) {
        const indexOfNextNewLine = buffer.indexOf('\n');
        const line = buffer.subarray(0, indexOfNextNewLine).toString('utf8');
        L.trace('line', line);
        buffer = buffer.subarray(indexOfNextNewLine + 1);

        if (!line) {
          // Ignore empty lines in between
          continue;
        }

        if (line === '.') {
          // Client is finished sending
          return;
        }

        if (!this.remoteFiles[this.currentId]) {
          this.remoteFiles[this.currentId] = new RemoteFile();
        }

        if (!this.remoteFiles[this.currentId].name) {
          this.remoteFiles[this.currentId].name = line;
          continue;
        }

        // Lines contain data like: "key: value\n"
        const [key, value] = line.split(': ', 2);
        L.trace('key', key);
        L.trace('value', value);

        if (key === 'data') {
          this.remoteFiles[this.currentId].dataSize = parseInt(value, 10);
          this.remoteFiles[this.currentId].initialize();

          // At this point buffer is filled with data
          break;
        } else if (key === 'token') {
          this.remoteFiles[this.currentId].token = value;
        } else if (key === 'display-name') {
          this.remoteFiles[this.currentId].displayName = value;
        } else {
          this.remoteFiles[this.currentId].setVariable(key, value);
        }
      }
    }

    let appendedData = 0;
    if (this.remoteFiles[this.currentId]?.waitingForData) {
      appendedData = this.remoteFiles[this.currentId].appendData(buffer);
      L.trace('appendedData', appendedData);
    }

    if (this.remoteFiles[this.currentId]?.finished) {
      L.trace('remoteFile ready');

      this.remoteFiles[this.currentId].closeSync();
      this.openInEditor(this.currentId);
      this.currentId++;

      L.trace('buffer.length', buffer.length);
      if (buffer.length > appendedData) {
        L.trace('more commands in chunk');

        // pass remaining buffer (minus '\n' at the end)
        this.parseChunk(buffer.subarray(appendedData + 1));
      }
    }
  }

  openInEditor(remoteFileIdx : number) {
    L.trace('openInEditor', remoteFileIdx);
    let remoteFile = this.remoteFiles[remoteFileIdx];

    vscode.workspace.openTextDocument(remoteFile.localFilePath).then((textDocument : vscode.TextDocument) => {
      if (!textDocument && this.attempts < 3) {
        L.warn('Failed to open the text document, will try again');

        setTimeout(() => {
          this.attempts++;
          this.openInEditor(remoteFileIdx);
        }, 100);
        return;

      } else if (!textDocument) {
        L.error('Could NOT open the file', remoteFile.localFilePath);
        vscode.window.showErrorMessage(`Failed to open file ${remoteFile.remoteBaseName}`);
        return;
      }

      vscode.window.showTextDocument(textDocument, {preview: false}).then((textEditor : vscode.TextEditor) => {
        this.handleChanges(textDocument, remoteFileIdx);
        L.info(`Opening ${remoteFile.remoteBaseName} from ${remoteFile.remoteHost}`);
        vscode.window.setStatusBarMessage(`Opening ${remoteFile.remoteBaseName} from ${remoteFile.remoteHost}`, 2000);

        this.showSelectedLine(textEditor, remoteFileIdx);
      });
    });
  }

  handleChanges(textDocument : vscode.TextDocument, remoteFileIdx : number) {
    L.trace('handleChanges', textDocument.fileName);

    this.remoteFiles[remoteFileIdx].subscriptions.push(vscode.workspace.onDidSaveTextDocument((savedTextDocument : vscode.TextDocument) => {
      // eslint-disable-next-line eqeqeq
      if (savedTextDocument == textDocument) {
        this.save(remoteFileIdx);
      }
    }));

    this.remoteFiles[remoteFileIdx].subscriptions.push(vscode.workspace.onDidCloseTextDocument((closedTextDocument : vscode.TextDocument) => {
      L.trace('onDidCloseTextDocument', closedTextDocument);
      
      // eslint-disable-next-line eqeqeq
      if (closedTextDocument == textDocument) {
        this.closeTimeout  && clearTimeout(this.closeTimeout);
        // If you change the textDocument language, it will close and re-open the same textDocument, so we add
        // a timeout to make sure it is really being closed before close the socket.
        this.closeTimeout = setTimeout(() => {
          L.trace('onDidCloseTextDocument close Timeout triggered');
          this.close(this.remoteFiles[remoteFileIdx]);
        }, 2);
      }
    }));

    this.remoteFiles[remoteFileIdx].subscriptions.push(vscode.workspace.onDidOpenTextDocument((openedTextDocument : vscode.TextDocument) => {
      L.trace('onDidOpenTextDocument', openedTextDocument);

      // eslint-disable-next-line eqeqeq
      if (openedTextDocument == textDocument) {
        this.closeTimeout  && clearTimeout(this.closeTimeout);
      }
    }));
  }

  showSelectedLine(textEditor : vscode.TextEditor, remoteFileIdx : number) {
    var selection = +(this.remoteFiles[remoteFileIdx].getVariable('selection'));
    if (selection) {
      var line = ((selection-1) > 0) ? (selection-1) : 0;
      textEditor.revealRange(new vscode.Range(line, 0, line, 0), vscode.TextEditorRevealType.InCenter);
      textEditor.selection = new vscode.Selection(new vscode.Position(line,0), new vscode.Position(line,0));
    }
  }

  save(remoteFileIdx : number) {
    L.trace('save');
    let remoteFile = this.remoteFiles[remoteFileIdx];

    if (!this.online) {
      L.error('NOT online');
      vscode.window.showErrorMessage(`Error saving ${remoteFile.remoteBaseName} to ${remoteFile.remoteHost}`);
      return;
    }

    const statusBarMessage = vscode.window.setStatusBarMessage(`Saving ${remoteFile.remoteBaseName} to ${remoteFile.remoteHost}`, 2000);

    var buffer = remoteFile.readFileSync();

    this.socket.write('save\n');
    this.socket.write(`token: ${remoteFile.token}\n`);
    this.socket.write('data: ' + buffer.length + '\n');
    this.socket.write(buffer);
    this.socket.write('\n');

    statusBarMessage.dispose();
  }

  close(remoteFile : RemoteFile) {
    L.trace('close');

    if (!this.online) {
      L.error('NOT online');
      vscode.window.showErrorMessage(`Error sending close message for ${remoteFile.remoteBaseName} to ${remoteFile.remoteHost}`);
      return;
    }

    this.socket.write('close\n');
    this.socket.write(`token: ${remoteFile.token}\n\n`);

    // Clean up VS Code ressources
    remoteFile.subscriptions.forEach((disposable : vscode.Disposable) => disposable.dispose());

    // Close Tabs in VS Code
    const tabs: vscode.Tab[] = vscode.window.tabGroups.all.map(tg => tg.tabs).flat();
    L.trace('openTabs', tabs.length);
    
    const openFilesInTabs = tabs.filter(tab => tab.input instanceof vscode.TabInputText).map(tab => (tab.input as vscode.TabInputText).uri.path);
    L.trace('openFiles', openFilesInTabs);
    
    const openTabsWithOurFiles: vscode.Tab[] = tabs.filter(tab => {
      if (!(tab.input instanceof vscode.TabInputText)) {
        return false;
      }

      return tab.input.uri.path === remoteFile.localFilePath;
    });
    for (const ourTab of openTabsWithOurFiles) {
      L.trace('closing tab for', (ourTab.input as vscode.TabInputText).uri.path);
      vscode.window.tabGroups.close(ourTab);
    }

    // Remove RemoteFile from Array of active Elements
    this.remoteFiles.splice(this.remoteFiles.indexOf(remoteFile), 1);

    if (this.remoteFiles.length === 0) {
      this.socket.end();
      this.emit('close');
    }
  }

  closeAll() {
    L.trace('closeAll', this.remoteFiles.length);

    const count = this.remoteFiles.length;
    for (let i = 0; i < count; i++) {
      this.close(this.remoteFiles[0]);  // close function modifies the array (with .splice), always remove 0 here
    }
  }
}

export default Session;
