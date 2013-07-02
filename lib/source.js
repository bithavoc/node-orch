"use strict";

var util = require('util');
var EventEmitter = require('events').EventEmitter;
var assert = require('assert');

//
// Base class for Task Sources.
//
function TasksSource() {
  var self = this;
  this.isConnected = false;
  this.isConnecting = false;
  this.on('connected', function onConnected() {
    self.isConnected = true;
    self.isConnecting = false;
  });
}

util.inherits(TasksSource, EventEmitter);

//
// Issues a Queue to work with the given action.
// Params:
//  -> action: the name of the action to relate to.
//  -> cb(err, queue): A callback to know when the operation finished.
//  -> autoDelete: true to automatically remove the queue on disconnect.
//
TasksSource.prototype.issueQueue = function issueQueue(action, cb, requiresDeclaration, autoDelete) {
  if (typeof this.onIssueQueue !== 'function') {
    throw new Error("Missing onIssueQueue implementation");
  }
  var self = this;
  return this.onIssueQueue(action, function onIssueQueueComplete(err, queue) {
    if (!err) {
      assert.ok(queue, "onIssueQueue callback with no error should provide the instance of the queue");
    }
    self.emit('issueQueue', action, queue);
    return cb(err, queue);
  }, requiresDeclaration, autoDelete);
};

//
// Issues a Queue and Listen for Tasks.
// Params:
//  -> action: the name of the action to filter.
//  -> cb(err, queue): A callback to know when the operation finished.
//  -> autoDelete: true to automatically remove the queue on disconnect.
//
TasksSource.prototype.listenQueue = function listenQueue(action, cb, requiresDeclaration, autoDelete) {
  var self = this;
  autoDelete = Boolean(autoDelete);
  return this.issueQueue(action, function issueQueueCompleted(err, queue) {
    if (err) {
      return cb(err, queue);
    }
    queue.on('task', function queueOnTask(task) {
      return self.emit('task', task);
    });
    queue.listen(function queueListen(err) {
      // Subscribe to 'task' and rely it to this source.
      self.emit('listenQueue', action, queue);
      return cb(null, queue);
    });
  }, requiresDeclaration, autoDelete);
};

//
// Tells the source to connect to the underling implementation(optionally overriding onConnect).
// When ready, the implementation will emit 'connected' or 'error'.
//
TasksSource.prototype.connect = function connect(callback) {
  var self = this;
  if (typeof callback !== 'function') {
    throw new Error("callback required");
  }
  if (this.isConnected || this.isConnecting) {
    return callback(null);
  }
  if (typeof this.onConnect !== 'function') {
    throw new Error("Missing onConnect implementation");
  }
  this.isConnected = false;
  this.isConnecting = true;
  function connectCallback(err) {
    if (err) {
      return callback(err);
    }
    self.emit('connected');
    return callback(null);
  }
  return this.onConnect(connectCallback);
};

TasksSource.prototype._checkConnected = function _checkConnected() {
  if (!this.isConnected) {
    throw new Error("Source not connected");
  }
};

//
// Tells the Source to enqueue the task for future execution.
//
TasksSource.prototype.enqueue = function enqueue(task) {
  this._checkConnected();
  var self = this,
    nextAction = task.stack[task.stack.length - 1].action;
  function enqueueCallback(err) {
    if (err) {
      err.task = task;
      return self.emit('error', err);
    }
    return self.emit('enqueue', task);
  }
  this.issueQueue(nextAction, function issueQueueCompleted(err, queue) {
    if (err) {
      return self.emit('error', err);
    }
    return queue.enqueue(nextAction, task, enqueueCallback);
  });
};

//
// Tells the Source to send more tasks via 'task' event.
// Params
//  -> action: Name of the action which last message in queue we want to acknoledge.
//
TasksSource.prototype.next = function next(action) {
  this._checkConnected();
  if (typeof action !== 'string') {
    throw new Error("action name is required");
  }
  var self = this;
  this.issueQueue(action, function issueQueueCompleted(err, queue) {
    if (err) {
      return self.emit('error', err);
    }
    return queue.next();
  });
};

TasksSource.Queue = function Queue() {

};

util.inherits(TasksSource.Queue, EventEmitter);

TasksSource.Queue.prototype.enqueue = function enqueue(action, task, cb) {
  if (typeof this.onEnqueue !== 'function') {
    throw new Error("Missing onEnqueue implementation");
  }
  return this.onEnqueue(action, task, cb);
};

TasksSource.Queue.prototype.next = function next() {
  if (typeof this.onNext !== 'function') {
    throw new Error("Missing onNext implementation");
  }
  return this.onNext();
};

TasksSource.Queue.prototype.listen = function next(callback) {
  if (typeof this.onListen !== 'function') {
    throw new Error("Missing onListen implementation");
  }
  if (typeof callback !== 'function') {
    throw new Error("callback required");
  }
  return this.onListen(callback);
};

module.exports = TasksSource;
