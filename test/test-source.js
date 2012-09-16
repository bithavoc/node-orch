var orch = require('../index');
var util = require('util');
var TasksSource = orch.TasksSource;

//
// TASK SOURCE
//
function TestWorkerTasksSource() {
  TasksSource.apply(this, arguments);
  this._queues = {

  };
}
util.inherits(TestWorkerTasksSource, TasksSource);

TestWorkerTasksSource.prototype.onConnect = function(cb) {
  return cb(null);
};

TestWorkerTasksSource.prototype.onIssueQueue = function(action, cb) {
  var queue = this._queues[action];
  if(!queue) {
    queue = new TestQueue(action);
    this._queues[action] = queue;
  } else {
    // Queue already exists"
  }
  return cb(null, queue);
};

//
// QUEUE
//
function TestQueue() {
  TasksSource.Queue.apply(this, arguments);
  this.list = [];
  this.testListening = false;
}
util.inherits(TestQueue, TasksSource.Queue);

TestQueue.prototype.onNext = function() {
  this.testProcessing = false;
  this.__notifyTask();
};

TestQueue.prototype.onEnqueue = function(action, task, cb) {
  this.list.push(task);
  this.__notifyTask();
  return cb(null);
};

TestQueue.prototype.__notifyTask = function() {
  if(this.testListening && !this.testProcessing) {
    var self = this;
    // for testing purposes, we trigger the callback a bit later.
    process.nextTick(function() {
      var task = self.list.pop();
      if(task) {
        self.testProcessing = true;
        return self.emit('task', task);
      }
    });
  }
}

TestQueue.prototype.onListen = function(cb) {
  this.testListening = true;
  var self = this;
  process.nextTick(function onListenNextQueue() {
    // listen should start receiving messages, we call next so the tasks in the queue are procesed.
    return self.next();
  });
  return cb();
};

module.exports = TestWorkerTasksSource;
