var util = require('util');
var EventEmitter = require('events').EventEmitter;

//
// Base class for Task Sources.
//
function TasksSource() {
  var self = this;
  this.isConnected = false;
  this.isConnecting = false;
  this.subscribe = false; // indicates whether the task source should subscribe and receive tasks
  this.queue = [];
  this.on('connected', function onConnected() {
    self.isConnected = true;
    self.isConnecting = false;
    function popCache() {
      var cachedTask = self.queue.pop();
      if(cachedTask) {
        process.nextTick(function() {
          self.enqueue(cachedTask);
          return popCache();
        });
      } else {
        // cache pop finished
      }
    }
    popCache();
    self.next();
  });
};
util.inherits(TasksSource, EventEmitter);

//
// Tells the source to connect to the underling implementation(optionally overriding onConnect).
// When ready, the implementation will emit 'connected' or 'error'.
//
TasksSource.prototype.connect = function connect() {
  var self = this;
  if(this.isConnected || this.isConnecting) {
    return false;
  }
  if(typeof(this.onConnect) !== 'function') {
    throw new Error("Missing onConnect implementation");
  }
  this.isConnected = false;
  this.isConnecting = true;
  function connectCallback(err) {
    if(err) {
      return self.emit('error', err);
    } else {
      return self.emit('connected');
    }
  }
  return this.onConnect(connectCallback);
};

//
// Tells the Source to enqueue the task for future execution.
//
TasksSource.prototype.enqueue = function enqueue(task) {
  var self = this;
  if(typeof(this.onEnqueue) !== 'function') {
    throw new Error("Missing onEnqueue implementation");
  }
  if(!this.isConnected) { // not ready? let's cache that tasks
    this.queue.push(task);
  }
  if(!this.isConnected && !this.isConnecting) {
    this.connect();
    return;
  }
  function enqueueCallback(err) {
    if(err) {
      err.task = task;
      return self.emit('error', err);
    } else {
      return self.emit('enqueue');
    }
  }
  return self.onEnqueue(task, enqueueCallback);
};

//
// Tells the Source to send more tasks via 'task' event.
//
TasksSource.prototype.next = function next() {
  if(typeof(this.onNext) !== 'function') {
    throw new Error("Missing onNext implementation");
  }
  if(!this.isConnected && !this.isConnecting) {
    this.connect();
    return; // can not proceed without connection
  }
  return this.onNext();
};

module.exports = TasksSource;
