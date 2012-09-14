var common = require('./common');
var util = require('util');
var EventEmitter = require('events').EventEmitter;
var WorkerContext = require('./context');
var ActionMetadata = require('./action_metadata');
var assert = require('assert');

function Worker() {
  this.protocolVersion = common.ProtocolVersion;
  this.automaticFlow = true; // Will always call 'next' on the source to ack(AMQP) and receive more tasks.
  this._registry = { // registry of operations

  };
}

util.inherits(Worker, EventEmitter);

//
// Will validate internal state of the worker before performing any critical operation..
//
Worker.prototype._validate = function() {
  if(!this.source) {
    throw new Error("source of tasks is required by the orch worker");
  }
};

Worker.prototype.__defineGetter__("source", function(){
  return this._source;
});
    
Worker.prototype.__defineSetter__("source", function(val){
  //TODO: Handle change of source
  var self = this;
  this._source = val;
  this._source.subscribe = true; // receive tasks
  this._source.on('task', function(task) {
    return self._processTask(task);
  });
});

//
// Process a Task delivered by the tasks source.
//
Worker.prototype._processTask = function _processTask(task) {
  assert.ok(task, "whoa... why would the tasks source delive a null task?");
  var context = new WorkerContext(this, task);
  var actionName = context._currentEntry.action;
  var actionMeta = this._registry[actionName];
  if(!actionMeta) {
    return context.fail(new Error(util.format("The action '%s' was not found", actionName)), "ACTION_NOT_FOUND");
  }
  var impl = actionMeta.impl; // function to call
  return impl(context);
}

//
// When automaticFlow is activated, will call 'next' on the source so we receive more tasks.
//
Worker.prototype._nextFlowTask = function _nextFlowTask() {
  if(this.automaticFlow) {
    this.source.next();
  }
}

//
// Starts the Worker. It will start receiving tasks from the Source.
//
Worker.prototype.start = function start() {
  this._validate();
  this.source.connect(); // connect and receive our first task
};

//
// Register an action in the worker with the given implementation as a function.
//
Worker.prototype.register = function register(name, impl) {
  /*assert.ok(name);
  if(typeof(impl) !== 'function') {
    throw
  }*/
  var actionMeta = ActionMetadata.createRootMetadata(this, name, impl);
  return this._register(actionMeta);
};

Worker.prototype._register = function(meta) {
  this._registry[meta.name] = meta;
  return meta;
}

module.exports = Worker;
