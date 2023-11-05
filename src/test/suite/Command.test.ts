import * as assert from 'assert';
import * as vscode from 'vscode';
import Command from '../../lib/Command';

suite("Command Tests", () => {

	test("constructor", () => {
    var name = "test";
    var command = new Command(name);

		assert.equal(name, command.name);
	});

  test("setName", () => {
    var name = "test";
    var command = new Command(name);

    var name = "another test";
    command.name = name;
    assert.equal(name, command.name);
  });

  test("getName", () => {
    var name = "test";
    var command = new Command(name);

    var name = "another test";
    command.name = name;
    assert.equal(name, command.name);
  });

  test("setVariable", () => {
    var name = "test";
    var key = "variableKey";
    var value = "variableValue";
    var command = new Command(name);

    command.setVariable(key, value);
    assert.equal(value, command.getVariable(key));
  });

  test("getVariable", () => {
    var name = "test";
    var key = "variableKey";
    var value = "variableValue";
    var command = new Command(name);

    command.setVariable(key, value);
    assert.equal(value, command.getVariable(key));
  });
});