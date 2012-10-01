"use strict";

var Orch = require('orch');
var OrchAMQP = require('orch-amqp').TasksSource;
var assert = require('assert');
var util = require('util');

var worker = new Orch.Worker();
worker.source = new OrchAMQP({
  host: '127.0.0.1' // RabbitMQ at localhost
});

worker.register('print', function print(context) {
  console.log("(Worker: Processing print)");
  console.log("Print: %s", context.input.msg);
  context.success(null, 'SUCCESS', 'Message has been printed');
});

worker.start(function workerStartCompleted(err) {
  assert.ifError(err);
  console.log("'print' Worker Started");
});
