"use strict";

var common = require('./common');

function Client() {
  this.protocolVersion = common.ProtocolVersion;
}

//
// Will validate internal state of the client before performing any critical operation..
//
Client.prototype._validate = function _validate() {
  if (!this.source) {
    throw new Error("source of tasks is required by the orch client");
  }
};

//
// Starts and Runs a Task triggering the action, input and continuation.
//
Client.prototype.run = function run(action, input, continuation) {
  this._validate();
  if (typeof action !== 'string') {
    throw new Error("action name argument is required");
  }
  if (typeof input === 'undefined') {
    throw new Error("action input argument is required");
  }
  var task = {
    version: this.protocolVersion,
    stack: []
  };
  if(continuation) {
    // if the continuation action was provided, push it first
    task.stack.push({
      action: continuation
    });
  }
  // add the action entry
  task.stack.push({
    action: action,
    input: input
  });
  this.source.enqueue(task);
};

Client.prototype.connect = function connect(cb) {
  this._validate();
  return this.source.connect(cb);
};

module.exports = Client;
