import {EventEmitter} from 'events';
import * as vscode from 'vscode';
import * as net from 'net';
import Logger from '../utils/Logger';
import Command from './Command';

const L = Logger.getLogger('Session');

class Session extends EventEmitter {
  commands : Array<Command> = [];
  socket : net.Socket;
  online : boolean;
  subscriptions : Array<vscode.Disposable> = [];
  currFileIdx : number = 0;
  attempts : number = 0;
  closeTimeout : NodeJS.Timeout | undefined;

  constructor(socket : net.Socket) {
    super();
    L.trace('constructor');

    this.socket = socket;
    this.online = true;

    this.socket.on('data', this.onSocketData.bind(this));
    this.socket.on('close', this.onSocketClose.bind(this));
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

    if (this.commands[this.currFileIdx] && this.commands[this.currFileIdx]?.remoteFile?.isReady()) {
      L.error('parseChunk: currFileIdx pointer is messed up.');
      return;
    }

    if (!this.commands[this.currFileIdx]?.remoteFile?.waitingForData) {
      while (buffer.length) {
        const indexOfNextNewLine = buffer.indexOf('\n');
        const line = buffer.subarray(0, indexOfNextNewLine).toString('utf8');
        L.trace('line', line);
        buffer = buffer.subarray(indexOfNextNewLine + 1);

        if (!line) {
          // Ignore empty lines in between
          continue;
        }

        if (line === '.\n') {
          // Client is finished sending
          break;
        }

        if (!this.commands[this.currFileIdx]) {
          this.commands.push(new Command(line));
          continue;
        }

        var s = line.split(':');
        var name = s.shift().trim();
        L.trace('name', name);
        var value = s.join(":").trim();
        L.trace('value', value);

        if (name === 'data') {
          this.commands[this.currFileIdx].remoteFile.setDataSize(parseInt(value, 10));
          this.commands[this.currFileIdx].remoteFile.setToken(this.commands[this.currFileIdx].getVariable('token'));
          this.commands[this.currFileIdx].remoteFile.setDisplayName(this.commands[this.currFileIdx].getVariable('display-name'));
          this.commands[this.currFileIdx].remoteFile.initialize();

          // At this point buffer is filled with data
          break;
        } else {
          this.commands[this.currFileIdx].addVariable(name, value);
        }
      }
    }

    const appendedData = this.commands[this.currFileIdx].remoteFile.appendData(buffer);
    L.trace('appendedData', appendedData);
    L.trace('buffer.length', buffer.length);

    if (this.commands[this.currFileIdx].remoteFile.isReady()) {
      L.trace('remoteFile ready');

      this.commands[this.currFileIdx].remoteFile.closeSync();
      this.handleCommand(this.currFileIdx);
      this.currFileIdx++;

      if (buffer.length > appendedData) {
        L.trace('more commands in chunk');

        // pass remaining buffer (minus '\n' at the end)
        this.parseChunk(buffer.subarray(appendedData + 1));
      }
    }
  }

  handleCommand(remoteFileIdx : number) {
    L.trace('handleCommand');
    // L.trace('remoteFileIdx', remoteFileIdx);
    L.trace('this.commands[remoteFileIdx].name', this.commands[remoteFileIdx].name);

    switch (this.commands[remoteFileIdx].name) {
      case 'open':
        this.handleOpen(remoteFileIdx);
        break;

      case 'list':
        this.handleList(this.commands[remoteFileIdx]);
        this.emit('list');
        break;

      case 'connect':
        this.handleConnect(this.commands[remoteFileIdx]);
        this.emit('connect');
        break;
    }
  }

  openInEditor(remoteFileIdx : number) {
    L.trace('openInEditor', remoteFileIdx);
    let remoteFile = this.commands[remoteFileIdx].remoteFile;

    vscode.workspace.openTextDocument(remoteFile.getLocalFilePath()).then((textDocument : vscode.TextDocument) => {
      if (!textDocument && this.attempts < 3) {
        L.warn("Failed to open the text document, will try again");

        setTimeout(() => {
          this.attempts++;
          this.openInEditor(remoteFileIdx);
        }, 100);
        return;

      } else if (!textDocument) {
        L.error("Could NOT open the file", remoteFile.getLocalFilePath());
        vscode.window.showErrorMessage(`Failed to open file ${remoteFile.getRemoteBaseName()}`);
        return;
      }

      vscode.window.showTextDocument(textDocument, {preview: false}).then((textEditor : vscode.TextEditor) => {
        this.handleChanges(textDocument, remoteFileIdx);
        L.info(`Opening ${remoteFile.getRemoteBaseName()} from ${remoteFile.getHost()}`);
        vscode.window.setStatusBarMessage(`Opening ${remoteFile.getRemoteBaseName()} from ${remoteFile.getHost()}`, 2000);

        this.showSelectedLine(textEditor, remoteFileIdx);
      });
    });
  }

  handleChanges(textDocument : vscode.TextDocument, remoteFileIdx : number) {
    L.trace('handleChanges', textDocument.fileName);

    this.subscriptions.push(vscode.workspace.onDidSaveTextDocument((savedTextDocument : vscode.TextDocument) => {
      // eslint-disable-next-line eqeqeq
      if (savedTextDocument == textDocument) {
        this.save(remoteFileIdx);
      }
    }));

    this.subscriptions.push(vscode.workspace.onDidCloseTextDocument((closedTextDocument : vscode.TextDocument) => {
      L.trace('onDidCloseTextDocument', closedTextDocument);
      
      // eslint-disable-next-line eqeqeq
      if (closedTextDocument == textDocument) {
        this.closeTimeout  && clearTimeout(this.closeTimeout);
        // If you change the textDocument language, it will close and re-open the same textDocument, so we add
        // a timeout to make sure it is really being closed before close the socket.
        this.closeTimeout = setTimeout(() => {
          this.close();
        }, 2);
      }
    }));

    this.subscriptions.push(vscode.workspace.onDidOpenTextDocument((openedTextDocument : vscode.TextDocument) => {
      // eslint-disable-next-line eqeqeq
      if (openedTextDocument == textDocument) {
        this.closeTimeout  && clearTimeout(this.closeTimeout);
      }
    }));
  }

  showSelectedLine(textEditor : vscode.TextEditor, remoteFileIdx : number) {
    var selection = +(this.commands[remoteFileIdx].getVariable('selection'));
    if (selection) {
      var line = ((selection-1) > 0) ? (selection-1) : 0;
      textEditor.revealRange(new vscode.Range(line, 0, line, 0), vscode.TextEditorRevealType.InCenter);
      textEditor.selection = new vscode.Selection(new vscode.Position(line,0), new vscode.Position(line,0));
    }
  }

  handleOpen(remoteFileIdx : number) {
    L.trace('handleOpen', remoteFileIdx);
    this.openInEditor(remoteFileIdx);
  }

  handleConnect(command : Command) {
    L.trace('handleConnect', command.name);
  }

  handleList(command : Command) {
    L.trace('handleList', command.name);
  }

  send(cmd : string) {
    L.trace('send', cmd);

    if (this.isOnline()) {
      this.socket.write(cmd + "\n");
    }
  }

  open(filePath : string) {
    L.trace('filePath', filePath);

    this.send("open");
    this.send(`path: ${filePath}`);
    this.send("");
  }

  list(dirPath : string) {
    L.trace('list', dirPath);

    this.send("list");
    this.send(`path: ${dirPath}`);
    this.send("");
  }

  save(remoteFileIdx : number) {
    L.trace('save');
    let remoteFile = this.commands[remoteFileIdx].remoteFile;

    if (!this.isOnline()) {
      L.error("NOT online");
      vscode.window.showErrorMessage(`Error saving ${remoteFile.getRemoteBaseName()} to ${remoteFile.getHost()}`);
      return;
    }

    vscode.window.setStatusBarMessage(`Saving ${remoteFile.getRemoteBaseName()} to ${remoteFile.getHost()}`, 2000);

    var buffer = remoteFile.readFileSync();

    this.send("save");
    this.send(`token: ${remoteFile.getToken()}`);
    this.send("data: " + buffer.length);
    this.socket.write(buffer);
    this.send("");
  }

  close() {
    L.trace('close');

    if (this.isOnline()) {
      this.online = false;

      this.send("close");
      this.send("");
      
      this.emit('close');

      this.socket.end();
    }

    this.subscriptions.forEach((disposable : vscode.Disposable) => disposable.dispose());
  }

  isOnline() {
    L.trace('isOnline');

    L.debug('isOnline?', this.online);
    return this.online;
  }
}

export default Session;
