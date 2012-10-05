//
// Description: This example shows how to use Orch to perform RPC tasks.
//
// Instructions:
//  1. run the worker: node hello_world_generate_message.js
//  2. run this client: node hello_world_rpc_client.js
//
// Authors:
//  - Johan Hernandez<johan@firebase.co>
//
"use strict";

var Orch = require('orch');
var OrchAMQP = require('orch-amqp').TasksSource;
var assert = require('assert');

var client = new Orch.Client();
client.enableRpc = true;
client.source = new OrchAMQP({
  host: '127.0.0.1' // RabbitMQ at localhost
});

client.connect(function clientConnectCompleted(err) {
  assert.ifError(err);

  // Generate a Message and then Print it.
  client.rpc('generate_message', {
    message: "Hello %s",
    name: "John Doe"
  }, function rpcCompleted(err, context) {
    assert.ifError(err);
    console.log("Result", context.result);
  });
  console.log("Task Created");
});
