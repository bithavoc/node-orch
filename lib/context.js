"use strict";

/*
* Worker Context
*/
var assert = require('assert');
var util = require('util');
var ActionPayload = require('./action_payload');

function WorkerContext(worker, task, actionMeta) {
  this._worker = worker;
  this.task = task;
  this._isLastCall = this.task.stack.length < 2;
  this._currentEntry = this.task.stack[this.task.stack.length - 1];
  if (!this._isLastCall) {
    this._continuationEntry = this.task.stack[this.task.stack.length - 2];
  } else {
    this._continuationEntry = null;
  }
  this.actionMeta = this._worker._registry[this._currentEntry.action];
  if (this.actionMeta) { // the worker will load the context even when the action might not exist.
    if (this.actionMeta.isCallback) {
      this.input = this._currentEntry.deferredInput;
      this.result = this._currentEntry.input;
    } else {
      this.input = this._currentEntry.input || null;
    }
  }
  this.incoming = new ActionPayload(this._currentEntry);
  this.outgoing = new ActionPayload(this._continuationEntry || {
    action: null
  });
  this.status = this.incoming.status;
  this.vars = this.incoming.vars;
  this._delay = 0;
}

WorkerContext.prototype.delay = function delay(ms) {
  if (typeof ms !== 'number') {
    throw new Error("delay needs to be a number");
  }
  this._delay += ms;
  return this;
};

WorkerContext.prototype._enqueue = function enqueue(task) {
  var worker = this._worker;
  function internalEnqueue() {
    worker.source.enqueue(task);
  }
  if (this._delay > 0) {
    var delay = this._delay = 0;
    this._delay = 0; // reset the delay, avoid _complete mistaken delays.
    setTimeout(internalEnqueue, delay);
  } else {
    return internalEnqueue();
  }
};

WorkerContext.prototype._completeEnqueue = function _completeEnqueue() {
  if (!this.outgoing.status.isEmpty()) {
    this._continuationEntry.status = this.outgoing.status.toJSON();
  }
  this._enqueue(this.task);
  this._complete();
};

WorkerContext.prototype._complete = function _complete() {
  var self = this;
  function internalComplete() {
    self._worker.emit("actionCompleted", self);
    self._nextFlowTask();
  }
  if (this._delay > 0) {
    setTimeout(internalComplete, this._delay);
  } else {
    return internalComplete();
  }
};

//
// When automaticFlow is activated, will call 'next' on the source queue so we receive more tasks.
//
WorkerContext.prototype._nextFlowTask = function _nextFlowTask() {
  if (this._worker.automaticFlow) {
    this._worker.source.next(this.actionMeta.name);
  }
};

function normalizeError(err, code) {
  if (typeof code !== 'undefined') {
    err.code = code;
  }
  if (typeof err.code === 'undefined') {
    err.code = 'UNHANDLED_EXCEPTION';
  }
}

//
// Due the given error, retry the current action.
//
//
WorkerContext.prototype.retry = function retry(err, code) {
  normalizeError(err, code);
  var retries = this._currentEntry.retries,
    errorRetry,
    retrySpec;
  if (!retries) {
    retries = this._currentEntry.retries = [];
  }
  function findRetry(code) {
    var i, entry;
    for (i = retries.length - 1; i >= 0; i -= 1) {
      entry = retries[i];
      if (entry.code === code) {
        return entry;
      }
    }
    return null;
  }
  errorRetry = findRetry(err.code);
  if (!errorRetry) {
    // create one if not exists
    errorRetry = {
      code: err.code,
      count: 1
    };
    retries.push(errorRetry);
  } else {
    // increment if exists
    errorRetry.count += 1;
  }
  retrySpec = this.actionMeta.lookRetry(err.code);
  if (errorRetry.count >= retrySpec.count) {
    return this.fail(err, err.code, errorRetry.count);
  }
  return this._completeEnqueue();
};

//
// Completes the Action with an error without retrying.
//
WorkerContext.prototype.fail = function fail(err, code, count) {
  normalizeError(err, code);
  count = typeof count === 'number' ? count : 1;

  this.outgoing.status.msg = err.message || err.msg;
  this.outgoing.status.code = err.code;
  this.outgoing.status.stack = err.stack;
  this.outgoing.status.count = count;

  if (this._continuationEntry) {
    this.task.stack.pop(); // remove the current entry of the stack.
    this._completeEnqueue();
  } else {
    // end of the task, all errors ignored.
    this._complete();
  }
  return true;
};

WorkerContext.prototype.success = function success(result, code, message) {
  if (typeof result === 'undefined') {
    throw new Error("result must be null at least");
  }
  if (typeof code === 'undefined') {
    throw new Error("code must be provided");
  }
  if (typeof message === 'undefined') {
    throw new Error("message must be provided");
  }
  this.outgoing.status.reset();
  this.outgoing.status.msg = message;
  this.outgoing.status.code = code;

  // TODO: Validate result should be null at least.
  if (this._continuationEntry) {
    this.task.stack.pop(); // remove the current entry of the stack.
    this._continuationEntry.input = result;
    this._completeEnqueue();
  } else {
    // end of the task, all errors ignored.
    this._complete();
  }
};

WorkerContext.prototype.defer = function defer(name, input, callbackName) {
  var rootMeta,
    callbackMeta,
    continuation,
    callbackEntry,
    varsCount;
  rootMeta = this.actionMeta.isRoot ? this.actionMeta : this.actionMeta.root;
  callbackMeta = rootMeta.callbacks[callbackName];
  if (!callbackMeta) {
    throw new Error(util.format("Callback %s was not found", callbackName));
  }
  continuation = callbackMeta.name;
  this.task.stack.pop(); // remove the current entry of the stack.

  callbackEntry = {
    deferredInput: this.input,
    action: continuation
  };
  // we only pass deferred vars if there it at least one
  varsCount = Object.keys(this.vars).length;
  if (varsCount > 0) {
    callbackEntry.vars = this.vars;
  }
  this.task.stack.push(callbackEntry); // Add entry for the callback
  this.task.stack.push({
    input: input,
    action: name
  }); // Add entry for the nested call
  this._completeEnqueue();
};

module.exports = WorkerContext;
