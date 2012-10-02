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
  }
}).export(module);
