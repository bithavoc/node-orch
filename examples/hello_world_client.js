"use strict";

var Orch = require('orch');
var OrchAMQP = require('orch-amqp').TasksSource;
var assert = require('assert');

var client = new Orch.Client();
client.source = new OrchAMQP({
  host: '127.0.0.1' // RabbitMQ at localhost
});

client.connect(function clientConnectCompleted(err) {
  assert.ifError(err);

  // Generate a Message and then Print it.
  client.run('generate_message', {
    message: "Hello %s",
    name: "John Doe"
  }, 'print'); // The result of 'generate_message' will be the input of 'print'.
  console.log("Task Created");
});
