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
  console.log("(Worker: Processing generate_message)");
  context.defer('format_string', {
    format: null, // we intentionally pass null to cause the error in format_string
    value: context.input.name
  }, 'formatted');
});

// Callback: generate_message#formatted
generateMessage.callback('formatted', function formatted(context) {
  if (context.status.code != 'SUCCESS') {
    // here we handle the error of 'format_string'.
    return context.complete({
      msg: "Houston, Internal Application Error!"
    });
  }
  context.complete({
    msg: context.result.str
  });
});

// Operation: format_string
worker.register('format_string', function formatString(context) {
  console.log("(Worker: Processing format_string)");
  if (!context.input.format) {
    return context.retry(new Error('The format string is not valid'), 'INVALID_FORMAT_STRING');
  }
  context.complete({
    str: util.format(context.input.format, context.input.value)
  });
}).retry('INVALID_FORMAT_STRING', 3);

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
