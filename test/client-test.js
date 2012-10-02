"use strict";

var orch = require('../index.js');
var assert = require('assert');
var vows = require('vows');
var TestSource = require('./test-source');

vows.describe('Orch Run Args').addBatch({
  "Having a client with no task source": {
    topic: function () {
      var client = new orch.Client();
      return {
        client: client
      };
    },
    "When I try to run a function it should raise an error about the missing source": function (result) {
      assert.throws(function () {
        result.client.run();
      }, function (err) {
        return err.message === 'source of tasks is required by the orch client';
      });
    }
  },
  "Having a client with a task source and invalid arguments for run": {
    topic: function () {
      var source,
        client;
      source = new TestSource();
      client = new orch.Client();
      client.source = source;
      return {
        source: source,
        client: client
      };
    },
    "When I try to run a task without action name": function (result) {
      assert.throws(function () {
        result.client.run();
      }, function (err) {
        return err.message === 'action name argument is required';
      });
    },
    "When I try to run a task without action input": function (result) {
      assert.throws(function () {
        result.client.run("Foo");
      }, function (err) {
        return err.message === 'action input argument is required';
      });
    }
  },
  "When I run a basic task with a continuation": {
    topic: function () {
      var callback,
        source,
        client,
        result;
      callback = this.callback;
      source = new TestSource();
      client = new orch.Client();
      client.source = source;
      result = {
        source: source,
        client: client
      };
      source.on('enqueue', function enqueue(task) {
        return callback(null, result);
      });
      client.connect(function (err) {
        if (err) {
          return callback(err);
        }
        client.run("Foo", null, "FooCompleted");
      });
    },
    "The task enqueued in the source should have the right stack, one call for the continuation and another for the action": function (result) {
      if (result.message) {
        assert.ifError(result);
      }
      assert.deepEqual(result.source._queues.Foo.list, [
        {
          version: '1.1',
          stack: [
            {
              action: "FooCompleted"
            }, {
              action: "Foo",
              input: null
            }
          ]
        }
      ]);
    }
  },
  "Having a client with RPC activated": {
    topic: function () {
      var callback,
        source,
        client,
        result;
      callback = this.callback;
      source = new TestSource();
      client = new orch.Client();
      client.id = "rpcTest";
      client.enableRpc = true;
      client.source = source;
      result = {
        source: source,
        client: client,
        issueQueues: {},
        listenQueues: {}
      };
      source.on('issueQueue', function issueQueue(action, queue) {
        result.issueQueues[action] = queue;
      });
      source.on('listenQueue', function issueQueue(action, queue) {
        result.listenQueues[action] = queue;
      });
      source.on('enqueue', function enqueue(task) {
        return callback(null, result);
      });
      client.connect(function (err) {
        if (err) {
          return callback(err);
        }
        client.rpc("Foo", null, function fooCompleted(err, response) {

        });
      });
    },
    "One of the issue queues should be the RPC action": function (result) {
      assert.ok(result.issueQueues['rpcTest.results']);
    },
    "One of the listen queues should be the RPC action": function (result) {
      assert.ok(result.listenQueues['rpcTest.results']);
    },
    "The source should have 1 task": function (result) {
      assert.equal(result.source._queues.Foo.list.length, 1);
    },
    "The task enqueued in the source should have the action for the RPC result": function (result) {
      if (result.message) {
        assert.ifError(result);
      }
      var task = result.source._queues.Foo.list[0];
      assert.equal(task.stack.length, 2);
      assert.equal(task.stack[0].action, 'rpcTest.results');
      assert.equal(task.stack[1].action, 'Foo');
      assert.isNull(task.stack[1].input);
    }
  },
  "Having a client with RPC activated and I perform a call": {
    topic: function () {
      var callback,
        source,
        client,
        result,
        worker;
      callback = this.callback;
      source = new TestSource();
      client = new orch.Client();
      client.id = "rpcTest2";
      client.enableRpc = true;
      client.source = source;
      result = {
        source: source,
        client: client,
        issueQueues: {},
        listenQueues: {}
      };
      source.on('enqueue', function enqueue(task) {
        if (task.stack.length === 2 && task.stack[1].action === 'Foo') {
          // .rpc just enqueued the call, we emulate the worker responding
          task.stack.pop();
          task.stack[0].status = {
            code: "SUCCESS",
            msg: "Foo was successful"
          };
          task.stack[0].input = {
            msg: "Foo Bar"
          };

          // enqueue the same tast just like a worker would do
          source.enqueue(task);
        }
        //return callback(null, result);
      });
      client.connect(function (err) {
        if (err) {
          return callback(err);
        }
        client.rpc("Foo", null, function fooCompleted(err, response) {
          result.response = response;
          return callback(null, result);
        });
      });
    },
    "The callback should provide the response of the task": function (result) {
      if (result.message) {
        assert.ifError(result);
      }
      assert.deepEqual(result.response, {
        status: {
          code: "SUCCESS",
          msg: "Foo was successful"
        },
        result: {
          msg: "Foo Bar"
        }
      });
    }
  },
  "Having a client with RPC activated and I perform a timeout call": {
    topic: function () {
      var callback,
        source,
        client,
        result,
        worker;
      callback = this.callback;
      source = new TestSource();
      client = new orch.Client();
      client.id = "rpcTest2";
      client.enableRpc = true;
      client.source = source;
      client.rpcTimeout = 500;
      result = {
        source: source,
        client: client,
        issueQueues: {},
        listenQueues: {}
      };
      source.on('enqueue', function enqueue(task) {
        if (task.stack.length === 2 && task.stack[1].action === 'Foo') {
          // .rpc just enqueued the call, we emulate the worker responding
          task.stack.pop();
          task.stack[0].status = {
            code: "SUCCESS",
            msg: "Foo was successful"
          };
          task.stack[0].input = {
            msg: "Foo Bar"
          };

          // enqueue the same tast just like a worker would do
          setTimeout(function () {
            source.enqueue(task);
          }, client.rpcTimeout + 500);
        } else if (task.stack.length === 1) {
          return callback(null, result);
        }
        //return callback(null, result);
      });
      client.connect(function (err) {
        if (err) {
          return callback(err);
        }
        client.rpc("Foo", null, function fooCompleted(err, response) {
          result.response = response;
        });
      });
    },
    "The callback should provide the response of the task with a RPC_TIMEOUT status": function (result) {
      if (result.message) {
        assert.ifError(result);
      }
      assert.deepEqual(result.response, {
        status: {
          code: "RPC_TIMEOUT",
          msg: "Task started with action 'Foo' took too long to complete"
        },
        result: null
      });
    }
  }
}).export(module);
