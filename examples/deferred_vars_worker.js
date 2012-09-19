"use strict";

var Orch = require('orch');
var OrchAMQP = require('orch-amqp').TasksSource;
var assert = require('assert');
var util = require('util');

var worker = new Orch.Worker();
worker.source = new OrchAMQP({
  host: '127.0.0.1' // RabbitMQ at localhost
});

// Operation: generate_message
var generateMessage = worker.register('generate_message', function generateMessage(context) {
  // set variable req_time, we will use it in the callbacks.
  this.req_time = new Date().toString();
  console.log("(Worker: Processing generate_message)");
  context.defer('format_string', {
    format: context.input.message,
    value: context.input.name
  }, 'formatted');
})

// Callback: generate_message#formatted
generateMessage.callback('formatted', function(context) {
  // here we use the variable req_time
  context.complete({
    msg: context.result.str + " " + this.req_time
  });
});

// Operation: format_string
worker.register('format_string', function formatString(context) {
  console.log("(Worker: Processing format_string)");
  context.complete({
    str: util.format(context.input.format, context.input.value)
  });
});

// Operation: print
worker.register('print', function print(context) {
  console.log("(Worker: Processing print)");
  console.log("Print: %s", context.input.msg);
  context.complete(null);
});

worker.start(function workerStartCompleted(err) {
  assert.ifError(err);
  console.log("Worker Started");
});
