"use strict";

var Orch = require('orch');
var OrchAMQP = require('orch-amqp').TasksSource;
var assert = require('assert');
var util = require('util');

var worker = new Orch.Worker();
worker.source = new OrchAMQP({
  host: '127.0.0.1' // RabbitMQ at localhost
});

worker.register('generate_message', function generateMessage(context) {
  console.log("(Worker: Processing generate_message)");
  context.success({
    msg: util.format(context.input.message, context.input.name)
  }, 'SUCCESS', 'Message has been generated');
});

worker.start(function workerStartCompleted(err) {
  assert.ifError(err);
  console.log("'generate_message' Worker Started");
});
