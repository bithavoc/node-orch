"use strict";

var common = require('./common');
var hat = require('hat');
var util = require('util');

function Client() {
  this.protocolVersion = common.ProtocolVersion;
  this.id = hat();
  this.enableRpc = false;
  Object.defineProperty(this, 'rpcAction', {
    get: function rpcActionGet() {
      return this.id + '.results';
    }
  });
  this._rpcRack = new hat.rack();
  this._rpcCalls = {};
  this.rpcTimeout = 30000;
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
  if (continuation) {
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

//
// Starts and Runs a Task triggering the action with the given input. A callback must be supplied to receive the result of
// the task. An optional timeout can be set.
//
Client.prototype.rpc = function run(action, input, callback, timeout) {
  if (!this.enableRpc) {
    throw new Error("Ensure you set enableRpc before connect");
  }
  this._validate();
  if (typeof action !== 'string') {
    throw new Error("action name argument is required");
  }
  if (typeof input === 'undefined') {
    throw new Error("action input argument is required");
  }
  if (typeof callback !== 'function') {
    throw new Error("callback argument is required");
  }
  timeout = timeout || this.rpcTimeout;
  var taskId,
    task,
    self;
  taskId = this._rpcRack();
  task = {
    version: this.protocolVersion,
    stack: []
  };
  // the rpc action must be pushed first
  task.stack.push({
    action: this.rpcAction,
    vars: {
      taskId: taskId
    }
  });
  // add the action entry
  task.stack.push({
    action: action,
    input: input
  });
  self = this;
  this._rpcCalls[taskId] = {
    callback: callback,
    id: taskId,
    timeout: timeout,
    timeoutId: setTimeout(function rpcCallTimeout() {
      var rpcTask = self._rpcCalls[taskId];
      delete self._rpcCalls[taskId];
      return rpcTask.callback(null, {
        status: {
          code: "RPC_TIMEOUT",
          msg: util.format("Task started with action '%s' took too long to complete", action)
        },
        result: null
      });
    }, timeout)
  };
  this.source.enqueue(task);
};

Client.prototype._processRpcTask = function _processRpcTask(task) {
  var actionEntry,
    taskId,
    rpcTask;
  actionEntry = task.stack[0];
  taskId = actionEntry.vars.taskId;
  rpcTask = this._rpcCalls[taskId];
  if (rpcTask) {
    delete this._rpcCalls[taskId];
    clearTimeout(rpcTask.timeoutId);
    rpcTask.callback(null, {
      status: actionEntry.status,
      result: actionEntry.input
    });
  }
  this.source.next(actionEntry.action);
};

Client.prototype.connect = function connect(cb) {
  this._validate();
  var self,
    enableRpc,
    rpcAction;
  self = this;
  enableRpc = this.enableRpc;
  rpcAction = this.rpcAction;
  return this.source.connect(function sourceConnected(err) {
    if (err) {
      return cb(err);
    }
    if (enableRpc) {
      self.source.on('task', function rpcActionTaskReceived(task) {
        return self._processRpcTask(task);
      });
      /*
       * If calls were enabled, ensure we listen for results. To that end, the
       * queue needs to be created and should be marked autoDelete as the
       * results are no longer relevant when the client goes away.
       */
      self.source.listenQueue(rpcAction, function listenQueueCompleted(err, queue) {
        if (err) {
          return cb(err);
        }
        return cb(err);
      }, true, true);
    } else {
      return cb(err);
    }
  });
};

module.exports = Client;
