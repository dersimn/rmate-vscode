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

  private _token : string | null;
  localFilePath : string;

  private fileDescriptor : number | null = null;

  private _waitingForData : boolean = false;

  private _name: string | null = null;
  variables : Map<string, any> = new Map();

  private _displayName : string | null = null;

  constructor() {
    L.trace('constructor');
  }

  get name() : string | null {
    return this._name;
  }
  set name(name : string) {
    if (!this._name) {
      this._name = name;
    }
  }

  get token() : string | null {
    return this._token;
  }
  set token(token : string) {
    if (!this._token) {
      this._token = token;
    }
  }

  get displayName() : string | null {
    return this._displayName;
  }
  set displayName(displayName : string) {
    if (!this._displayName) {
      this._displayName = displayName;
    }
  }

  get remoteHost() : string | null {
    if (this.displayName === null) {
      return null;
    }

    // Lines contain data like: "hostname: filename"
    return this.displayName.split(':').shift() ?? null;
  }
  get remoteBaseName() : string | null {
    if (this.displayName === null) {
      return null;
    }

    // Lines contain data like: "hostname: filename"
    return this.displayName.split(':').shift().join(':') ?? null;
  }

  setVariable(key : string, value : any) {
    L.trace('addVariable', key, value);
    this.variables.set(key, value);
  }

  getVariable(key : string) : any {
    L.trace('getVariable', key);
    return this.variables.get(key);
  }

  createLocalFilePath() {
    L.trace('createLocalFilePath');
    this.localFilePath = path.join(os.tmpdir(), randomString(10), this.remoteBaseName || randomString(10));
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
    this.fileDescriptor = fs.openSync(this.getLocalFilePath(), 'w');
  }

  closeSync() {
    L.trace('closeSync');
    if (this.fileDescriptor === null) {
      throw new Error('trying to close a non-existing fileDescriptor');
    }
    fs.closeSync(this.fileDescriptor);
    this.fileDescriptor = null;
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
    if (this.fileDescriptor) {
      L.debug('writing data');
      fs.writeSync(this.fileDescriptor, buffer, offset, length, undefined);
    }
  }

  readFileSync() : Buffer {
    L.trace('readFileSync');
    return fs.readFileSync(this.localFilePath);
  }

  appendData(buffer : Buffer) : number {
    L.trace('appendData', buffer.length);

    if (this.dataSize === null) {
      throw new Error('dataSize has to be set before calling appendData');
    }

    var length = buffer.length;
    if (this.writtenDataSize + length > this.dataSize) {
      length = this.dataSize - this.writtenDataSize;
    }

    this.writtenDataSize += length;
    L.debug("writtenDataSize", this.writtenDataSize);

    this.writeSync(buffer, 0, length);

    if (this.writtenDataSize === this.dataSize) {
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