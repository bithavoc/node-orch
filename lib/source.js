var util = require('util');
var EventEmitter = require('events').EventEmitter;

//
// Base class for Task Sources.
//
function TasksSource() {

};
util.inherits(TasksSource, EventEmitter);

//
// Tells the Source to enqueue the task for future execution.
//
TasksSource.prototype.enqueue = function enqueue(task) {
  var self = this;
  if(typeof(this.onEnqueue) !== 'function') {
    throw new Error("Missing onEnqueue implementation");
  }
  function enqueueCallback(err) {
    if(err) {
      err.task = task;
      return self.emit('error', err);
    } else {
      return self.emit('enqueue', err);
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
  return this.onNext();
};

module.exports = TasksSource;
