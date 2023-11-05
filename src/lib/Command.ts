import Logger from '../utils/Logger';
import RemoteFile from './RemoteFile';

const L = Logger.getLogger('Command');

class Command {
  private _name: string | undefined;
  variables : Map<string, any>;
  remoteFile : RemoteFile = new RemoteFile();

  constructor(name?: string) {
    L.trace('constructor', name);
    this.variables = new Map();
    this._name = name;
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
}

export default Command;