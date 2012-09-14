var orch = require('../index');
var util = require('util');
var TasksSource = orch.TasksSource;

function TestClientTasksSource() {
  this.list = [];
}
util.inherits(TestClientTasksSource, TasksSource);

TestClientTasksSource.prototype.onEnqueue = function(task, cb) {
  var self = this;
  self.list.push(task);

  // for testing purposes, we trigger the callback a bit later.
  process.nextTick(function() {
    return cb(null);
  });
};

module.exports.Client = TestClientTasksSource;

function TestWorkerTasksSource() {
  this.list = [];
}
util.inherits(TestWorkerTasksSource, TasksSource);

TestWorkerTasksSource.prototype.onEnqueue = function(task, cb) {
  var self = this;
  self.list.push(task);
  return cb(null);
};

TestWorkerTasksSource.prototype.onNext = function() {
  var self = this;

  // for testing purposes, we trigger the callback a bit later.
  process.nextTick(function() {
    var task = self.list.pop();
    if(task) {
      return self.emit('task', task);
    }
  });
};

module.exports.Worker = TestWorkerTasksSource;
