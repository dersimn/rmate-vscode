import * as fs from 'fs';
import * as fse from 'fs-extra';
import * as os from 'os';
import * as path from 'path';
import randomString  from '../utils/randomString';
import Logger from '../utils/Logger';

const L = Logger.getLogger('RemoteFile');

class RemoteFile {
  private _dataSize : number | null = null;
  writtenDataSize : number = 0;

  token : string;
  localFilePath : string;

  remoteHost : string;
  remoteBaseName : string;

  fd : number;

  private _waitingForData : boolean = false;

  private _name: string | undefined;
  variables : Map<string, any> = new Map();

  constructor() {
    L.trace('constructor');
  }

  get name() : string | undefined {
    return this._name;
  }
  set name(name : string) {
    if (!this._name) {
      this._name = name;
    }
  }

  setVariable(key : string, value : any) {
    L.trace('addVariable', key, value);
    this.variables.set(key, value);
  }

  getVariable(key : string) : any {
    L.trace('getVariable', key);
    return this.variables.get(key);
  }

  setToken(token : string) {
    this.token = token;
  }

  getToken() {
    L.trace('getRemoteBaseName');
    return this.token;
  }

  setDisplayName(displayName : string) {
    var displayNameSplit = displayName.split(':');

    if (displayNameSplit.length === 1) {
      this.remoteHost = "";

    } else {
      this.remoteHost = displayNameSplit.shift();
    }

    this.remoteBaseName = displayNameSplit.join(":");
  }

  getHost() {
    L.trace('getHost', this.remoteHost);
    return this.remoteHost;
  }

  getRemoteBaseName() {
    L.trace('getRemoteBaseName');
    return this.remoteBaseName;
  }

  createLocalFilePath() {
    L.trace('createLocalFilePath');
    this.localFilePath = path.join(os.tmpdir(), randomString(10), this.getRemoteBaseName());
  }

  getLocalDirectoryName() {
    L.trace('getLocalDirectoryName', path.dirname(this.localFilePath || ""));
    if (!this.localFilePath) {
      return;
    }
    return path.dirname(this.localFilePath);
  }

  createLocalDir() {
    L.trace('createLocalDir');
    fse.mkdirsSync(this.getLocalDirectoryName());
  }

  getLocalFilePath() {
    L.trace('getLocalFilePath', this.localFilePath);
    return this.localFilePath;
  }

  openSync() {
    L.trace('openSync');
    this.fd = fs.openSync(this.getLocalFilePath(), 'w');
  }

  closeSync() {
    L.trace('closeSync');
    fs.closeSync(this.fd);
    this.fd = null;
  }

  initialize() {
    L.trace('initialize');
    this.createLocalFilePath();
    this.createLocalDir();
    this.openSync();
    this._waitingForData = true;
  }

  writeSync(buffer : any, offset : number, length : number) {
    L.trace('writeSync');
    if (this.fd) {
      L.debug('writing data');
      fs.writeSync(this.fd, buffer, offset, length, undefined);
    }
  }

  readFileSync() : Buffer {
    L.trace('readFileSync');
    return fs.readFileSync(this.localFilePath);
  }

  appendData(buffer : Buffer) : number {
    L.trace('appendData', buffer.length);

    var length = buffer.length;
    if (this.writtenDataSize + length > this._dataSize) {
      length = this._dataSize - this.writtenDataSize;
    }

    this.writtenDataSize += length;
    L.debug("writtenDataSize", this.writtenDataSize);

    this.writeSync(buffer, 0, length);

    if (this.writtenDataSize === this._dataSize) {
      this._waitingForData = false;
    }

    return length;
  }

  set dataSize(dataSize : number) {
    L.trace('set dataSize', dataSize);
    if (this._dataSize === null) {
      L.error('set dataSize - already set');
      this._dataSize = dataSize;
    }
  }

  get dataSize() : number | null {
    L.trace('get dataSize', this._dataSize);
    return this._dataSize;
  }

  get waitingForData() : boolean {
    return this._waitingForData;
  }
  get finished() : boolean {
    return this.writtenDataSize === this.dataSize;
  }
}

export default RemoteFile;