/*
* Worker Context
*/
var assert = require('assert');
var util = require('util');

function WorkerContext(worker, task, actionMeta) {
  this._worker = worker;
  this.task = task;
  this._isLastCall = this.task.stack.length < 2;
  this._currentEntry = this.task.stack[this.task.stack.length -1];
  if(!this._isLastCall) {
    this._continuationEntry = this.task.stack[this.task.stack.length -2];
  } else {
    this._continuationEntry = null;
  }
  this.actionMeta = this._worker._registry[this._currentEntry.action];
  if(this.actionMeta) { // the worker will load the context even when the action might not exist.
    if(this.actionMeta.isCallback) {
      this.input = this._currentEntry.deferredInput;
      this.result = this._currentEntry.input;
    } else {
      this.input = this._currentEntry.input || null;
    }
  }
  this.error = this._currentEntry.error;
}

WorkerContext.prototype._enqueue = function enqueue(task) {
  this._worker.source.enqueue(task);
}

WorkerContext.prototype._completeEnqueue = function _completeEnqueue() {
  this._enqueue(this.task);
  this._complete();
}

WorkerContext.prototype._complete = function _complete() {
  this._worker._nextFlowTask();
  this._worker.emit("actionCompleted", this);
}

//
// Due the given error, retry the current action.
//
//
WorkerContext.prototype.retry = function retry(err, code) {
  normalizeError(err, code);
  var retries = this._currentEntry.retries;
  if(!retries) {
    retries = this._currentEntry.retries = [];
  }
  function findRetry(code) {
    for(var i = retries.length -1; i >= 0; i--) {
      var entry = retries[i];
      if(entry.code === code) {
        return entry;
      }
    }
    return null;
  }
  var errorRetry = findRetry(err.code);
  if(!errorRetry) {
    // create one if not exists
    errorRetry = {
      code: err.code,
      count: 1
    };
    retries.push(errorRetry);
  } else {
    // increment if exists
    errorRetry.count++;
  }
  var retrySpec = this.actionMeta.lookRetry(err.code);
  if(errorRetry.count >= retrySpec.count) {
    return this.fail(err, err.code, errorRetry.count);
  } else {
    this._completeEnqueue();
  }
}

function normalizeError(err, code) {
  if(typeof(code) !== 'undefined') {
    err.code = code;
  }
  if(typeof(err.code) === 'undefined') {
    err.code = 'UNHANDLED_EXCEPTION';
  }
}

//
// Completes the Action with an error without retrying.
//
WorkerContext.prototype.fail = function fail(err, code, count) {
  normalizeError(err, code);
  var count = typeof(count) === 'number' ? count : 1;
  if(this._continuationEntry) {
    this.task.stack.pop(); // remove the current entry of the stack.
    this._continuationEntry.error = {
      msg: err.message,
      code: err.code,
      stack: err.stack,
      count: count
    };
    this._completeEnqueue();
  } else {
    // end of the task, all errors ignored.
    this._complete();
  }
  return true;
};

WorkerContext.prototype.complete = function complete(result) {
  // TODO: Validate result should be null at least.
  if(this._continuationEntry) {
    this.task.stack.pop(); // remove the current entry of the stack.
    this._continuationEntry.input = result;
    this._completeEnqueue();
  } else {
    // end of the task, all errors ignored.
    this._complete();
  }
};

WorkerContext.prototype.defer = function defer(name, input, callbackName) {
  var rootMeta = this.actionMeta.isRoot ? this.actionMeta : this.actionMeta.root;
  var callbackMeta = rootMeta.callbacks[callbackName];
  if(!callbackMeta) {
    throw new Error(util.format("Callback %s was not found", callbackName));
  }
  var continuation = callbackMeta.name;
  this.task.stack.pop(); // remove the current entry of the stack.
  this.task.stack.push({
    deferredInput: this.input,
    action: continuation
  }); // Add entry for the callback
  this.task.stack.push({
    input: input,
    action: name
  }); // Add entry for the nested call
  this._completeEnqueue();
}

module.exports = WorkerContext;
