var orch = require('../index');
var util = require('util');
var TasksSource = orch.TasksSource;

function TestWorkerTasksSource() {
  TasksSource.apply(this, arguments);
  this.list = [];
}
util.inherits(TestWorkerTasksSource, TasksSource);

TestWorkerTasksSource.prototype.onEnqueue = function(task, cb) {
  this.list.push(task);
  return cb(null);
};

TestWorkerTasksSource.prototype.onConnect = function(cb) {
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

module.exports = TestWorkerTasksSource;
