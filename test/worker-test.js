"use strict";

var orch = require('../index.js');
var assert = require('assert');
var vows = require('vows');
var TestSource = require('./test-source');
var util = require('util');

vows.describe('Orch Worker').addBatch({
  "Having a worker with no task source": {
    topic: function () {
      var worker = new orch.Worker();
      return {
        worker: worker
      };
    },
    "When I try to run a function it should raise an error about the missing source": function (result) {
      if (result.message) {
        assert.ifError(result);
      }
      assert.throws(function () {
        result.worker.start();
      }, function (err) {
        return err.message === 'source of tasks is required by the orch worker';
      });
    }
  },
  "Having a root action registered": {
    topic: function () {
      var worker,
        rootOp,
        cbOp;
      worker = new orch.Worker();
      rootOp = worker.register('rootOp', function (context) {

      });
      cbOp = rootOp.callback('cbOp', function (context) {

      });
      return {
        rootOp: rootOp,
        callback1: cbOp
      };
    },
    "The root operation should be marked as isRoot": function (result) {
      assert.isTrue(result.rootOp.isRoot);
      assert.isFalse(result.rootOp.isCallback);
      assert.isTrue(result.callback1.isCallback);
      assert.isFalse(result.callback1.isRoot);
    }
  },
  "When I start a worker with a task that generates an inmediate result followed by a receiver": {
    topic: function () {
      var callback,
        worker,
        source,
        result,
        formatString;
      callback = this.callback;
      worker = new orch.Worker();
      worker.automaticFlow = false; // don't call next after processing a task.
      source = new TestSource();
      worker.source = source;
      result = {
        source: source,
        worker: worker
      };
      formatString = worker.register('format_string', function (context) {
        var format, replacement;
        format = context.input.format;
        replacement = context.input.replacement;
        return context.success({
          msg: util.format(format, replacement)
        }, 'SUCCESS', 'The string was formatted successfully');
      });
      worker.on('actionCompleted', function sourceNextCallback() {
        return callback(null, result);
      });
      worker.start(function (err) {
        if (err) {
          return callback(err);
        }
        worker.source.enqueue({
          version: worker.protocolVersion,
          stack: [
            {
              action: 'print'
            }, {
              action: 'format_string',
              input: {
                format: "Hello %s",
                replacement: "World"
              }
            }
          ]
        });
      });
    },
    "The source should have the task re-enqueued": function (result) {
      if (result.message) {
        assert.ifError(result);
      }
      assert.equal(result.source._queues.print.list.length, 1);
    },
    "The task should have only the receiver with input as the result of the generator": function (result) {
      if (result.message) {
        assert.ifError(result);
      }
      var errorStack = result.source._queues.print.list[0].stack[0].error || null;
      assert.isNull(errorStack, "The error should be empty");
      assert.deepEqual(result.source._queues.print.list, [
        {
          version: result.worker.protocolVersion,
          stack: [{
            action: 'print',
            input: {
              msg: "Hello World"
            },
            status: {
              code: 'SUCCESS',
              msg: 'The string was formatted successfully'
            }
          }]
        }
      ]);
    }
  },
  "When I start a worker with a task that generates a deferred result followed by a receiver": {
    topic: function () {
      var callback,
        worker,
        source,
        result;
      callback = this.callback;
      worker = new orch.Worker();
      worker.automaticFlow = false; // don't call next after processing a task.
      source = new TestSource();
      worker.source = source;
      result = {
        source: source,
        worker: worker
      };
      worker.register('reverse_format_string', function (context) {
        return context.defer('reverse_string', {
          str: context.input.format
        }, "reverse_completed");
      }).callback('reverse_completed', function (context) {
        // never actually called, at least not in this test
      });
      worker.on('actionCompleted', function sourceNextCallback() {
        return callback(null, result);
      });
      worker.start(function (err) {
        if (err) {
          return callback(err);
        }
        worker.source.enqueue({
          version: worker.protocolVersion,
          stack: [
            {
              action: 'print'
            }, {
              action: 'reverse_format_string',
              input: {
                format: "s% olleH",
                replacement: "World"
              }
            }
          ]
        });
      });
    },
    "The source should have the task re-enqueued": function (result) {
      if (result.message) {
        assert.ifError(result);
      }
      assert.equal(result.source._queues.reverse_string.list.length, 1);
    },
    "The task should have the receiver, the callback entry and the deferred entry in the stack": function (result) {
      if (result.message) {
        assert.ifError(result);
      }
      var errorStack = result.source._queues.reverse_string.list[0].stack[0].error || null;
      assert.isNull(errorStack, "The error should be empty");
      assert.deepEqual(result.source._queues.reverse_string.list, [
        {
          version: result.worker.protocolVersion,
          stack: [{
            action: 'print'
          }, {
            action: 'reverse_format_string#reverse_completed',
            deferredInput: {
              format: "s% olleH",
              replacement: "World"
            }
          }, {
            action: 'reverse_string',
            input: {
              str: "s% olleH"
            }
          }]
        }
      ]);
    }
  },
  "When I start a worker with a task that generates a chained deferred result followed by a receiver": {
    topic: function () {
      var reverseFormatString,
        worker,
        source,
        result,
        callback,
        c;
      callback = this.callback;
      worker = new orch.Worker();
      source = new TestSource();
      worker.source = source;
      result = {
        source: source,
        worker: worker
      };
      reverseFormatString = worker.register('reverse_format_string', function (context) {
        return context.defer('reverse_string', {
          str: context.input.format
        }, "reverse_completed");
      });
      reverseFormatString.callback('reverse_completed', function (context) {
        return context.defer('format_string', {
          format: context.result.str, // use context.result to get the result of reverse_string.
          replacement: context.input.replacement // use context.input to get the deferred input(deferredInput internally) of the main operation(reverse_format_string in this case)
        }, 'format_completed');
      });
      reverseFormatString.callback('format_completed', function (context) {
        return context.success({
          str: context.result.msg,
          original_format: context.input.format
        }, "SUCCESS", "String reversed and formatted");
      });
      worker.register('reverse_string', function (context) {
        var str,
          res,
          len,
          i;
        str = context.input.str;
        res = [];
        len = str.length;
        for (i = len; i >= 0; i -= 1) {
          res[len - i] = str[i];
        }
        res = res.join('');

        return context.success({
          str: res
        }, 'SUCCESS', 'String has been reversed');
      });
      worker.register('format_string', function (context) {
        var format, replacement;
        format = context.input.format;
        replacement = context.input.replacement;
        return context.success({
          msg: util.format(format, replacement)
        }, 'SUCCESS', 'String has been formatted');
      });
      c = 0;
      worker.on('actionCompleted', function sourceNextCallback() {
        c += 1;
        if (c === 4) { // finish the test only when the first callback was processed
          return callback(null, result);
        }
      });
      worker.start(function (err) {
        if (err) {
          return callback(err);
        }
        worker.source.enqueue({
          version: worker.protocolVersion,
          stack: [
            {
              action: 'print'
            },
            {
              action: 'reverse_format_string',
              input: {
                format: "s% olleH",
                replacement: "World"
              }
            }
          ]
        });
      });
    },
    "The source should have the task re-enqueued": function (result) {
      if (result.message) {
        assert.ifError(result);
      }
      assert.equal(result.source._queues['reverse_format_string#format_completed'].list.length, 1);
    },
    "The task should have the receiver and the deferred entry for the second callback in the stack": function (result) {
      if (result.message) {
        assert.ifError(result);
      }
      var errorStack = result.source._queues['reverse_format_string#format_completed'].list[0].stack[0].error || null;
      assert.isNull(errorStack);
      assert.deepEqual(result.source._queues['reverse_format_string#format_completed'].list, [{
        version: result.worker.protocolVersion,
        stack: [
          {
            action: 'print'
          },
          {
            action: 'reverse_format_string#format_completed',
            input: {
              msg: 'Hello World'
            },
            status: {
              msg: "String has been formatted",
              code: "SUCCESS"
            },
            deferredInput: {
              replacement: 'World',
              format: 's% olleH'
            }
          }
        ]
      }]);
    }
  },
  "When I start a client and worker both with the same source configured with automaticFlow and I run an action": {
    topic: function () {
      var callback,
        worker,
        client,
        source,
        result,
        reverseFormatString;
      callback = this.callback;
      worker = new orch.Worker();
      client = new orch.Client();
      source = new TestSource();
      worker.source = source;
      client.source = source;
      result = {
        source: source,
        worker: worker
      };
      reverseFormatString = worker.register('reverse_format_string', function (context) {
        return context.defer('reverse_string', {
          str: context.input.format
        }, "reverse_completed");
      });
      reverseFormatString.callback('reverse_completed', function (context) {
        return context.defer('format_string', {
          format: context.result.str, // use context.result to get the result of reverse_string.
          replacement: context.input.replacement // use context.input to get the deferred input(deferredInput internally) of the main operation(reverse_format_string in this case)
        }, 'format_completed');
      });
      reverseFormatString.callback('format_completed', function (context) {
        return context.success({
          str: context.result.msg,
          original_format: context.input.format
        }, 'SUCCESS', 'String has been reversed and formatted');
      });
      worker.register('reverse_string', function (context) {
        var str,
          res,
          len,
          i;
        str = context.input.str;
        res = [];
        len = str.length;
        for (i = len; i >= 0; i -= 1) {
          res[len - i] = str[i];
        }
        res = res.join('');
        return context.success({
          str: res
        }, 'SUCCESS', 'String has been reversed');
      });
      worker.register('format_string', function (context) {
        var format,
          replacement;
        format = context.input.format;
        replacement = context.input.replacement;
        return context.success({
          msg: util.format(format, replacement)
        }, 'SUCCESS', 'String has been formatted');
      });
      worker.register('print', function (context) {
        result.print = context.input.str;
        result.original_format = context.input.original_format;
        return context.success(null, 'SUCCESS', 'Message has been printed');
      });
      worker.on('actionCompleted', function sourceNextCallback(context) {
        if (context.actionMeta.name === 'print') {
          return callback(null, result);
        }
      });
      worker.start(function (err) {
        if (err) {
          return callback(err);
        }
      });
      client.connect(function (err) {
        if (err) {
          return callback(err);
        }
        client.run('reverse_format_string', {
          format: "s% olleH",
          replacement: "World"
        }, 'print');
      });
    },
    "The source should remain with no tasks": function (result) {
      if (result.message) {
        assert.ifError(result);
      }
      assert.equal(result.source._queues.reverse_format_string.list.length, 0);
    },
    "The continuation task must be executed": function (result) {
      assert.equal(result.print, "Hello World");
      assert.equal(result.original_format, "s% olleH");
    }
  },
  "Having a worker with a registered operation that retries the same error continuously and have no retry policy": {
    topic: function () {
      var callback,
        worker,
        client,
        source,
        result,
        c;
      callback = this.callback;
      worker = new orch.Worker();
      client = new orch.Client();
      source = new TestSource();

      worker.source = source;
      client.source = source;
      result = {
        source: source,
        worker: worker
      };
      worker.register('wrong_input', function (context) {
        context.retry(new Error("Some error due wrong input"), 'WRONG_INPUT');
      });
      worker.register('print', function (context) {
        result.resultError = context.status; // the receive gets the error by using context.error
        return context.success(null, 'SUCCESS', '');
      });
      c = 0;
      worker.on('actionCompleted', function sourceNextCallback(context) {
        c += 1;
        if (c ===  2) {
          // finish the test only when 'print' is executed.
          return callback(null, result);
        }
      });
      worker.start(function (err) {
        if (err) {
          return callback(err);
        }
      });
      client.connect(function (err) {
        if (err) {
          return callback(err);
        }
        client.run('wrong_input', {
          str: "hello"
        }, 'print');
      });
    },
    "The source should remain with no tasks": function (result) {
      if (result.message) {
        assert.ifError(result);
      }
      assert.equal(result.source._queues.wrong_input.list.length, 0);
      assert.equal(result.source._queues.print.list.length, 0);
    },
    "It should fail immediately and the receive should get the error": function (result) {
      assert.ok(result.resultError);
      assert.equal(result.resultError.msg, 'Some error due wrong input');
      assert.equal(result.resultError.code, 'WRONG_INPUT');
    }
  },
  "Having a worker with a registered operation that retries the same error continuously based on retry policy": {
    topic: function () {
      var callback,
        worker,
        client,
        source,
        result,
        c;
      callback = this.callback;
      worker = new orch.Worker();
      client = new orch.Client();
      source = new TestSource();

      worker.source = source;
      client.source = source;
      result = {
        source: source,
        worker: worker
      };
      worker.register('wrong_input', function (context) {
        context.retry(new Error("Some error due wrong input"), 'WRONG_INPUT');
      }).retry('WRONG_INPUT', 3);
      worker.register('print', function (context) {
        result.resultError = context.status; // the receive gets the error by using context.error
        return context.success(null, 'SUCCESS', 'Message has been printed');
      });
      c = 0;
      worker.on('actionCompleted', function sourceNextCallback(context) {
        c += 1;
        if (c ===  4) {
          // finish the test only when 'print' is executed.
          return callback(null, result);
        }
      });
      worker.start(function (err) {
        if (err) {
          return callback(err);
        }
      });
      client.connect(function (err) {
        if (err) {
          return callback(err);
        }
        client.run('wrong_input', {
          str: "hello"
        }, 'print');
      });
    },
    "The source should remain with no tasks": function (result) {
      if (result.message) {
        assert.ifError(result);
      }
      assert.equal(result.source._queues.print.list.length, 0);
    },
    "It should fail after the retry count in the policy is reached": function (result) {
      assert.ok(result.resultError);
      assert.equal(result.resultError.msg, 'Some error due wrong input');
      assert.equal(result.resultError.code, 'WRONG_INPUT');
      assert.equal(result.resultError.count, 3);
    }
  },
  "Having a worker with an operation that passes vars to the callback": {
    topic: function () {
      var callback,
        worker,
        client,
        source,
        result,
        c;
      callback = this.callback;
      worker = new orch.Worker();
      client = new orch.Client();
      source = new TestSource();
      worker.source = source;
      client.source = source;
      result = {
        source: source,
        worker: worker
      };
      worker.register('hello_world', function (context) {
        this.message = "Hello World";
        return context.defer('message', null, 'cb');
      }).callback('cb', function cb(context) {
        context.success({
          msg: (this.console && this.setInterval) ? undefined : this.message,
          msg_vars: context.vars.message
        }, 'SUCCESS', 'Said Hello World');
      });
      worker.register('message', function (context) {
        return context.success({
          msg: 'foo'
        }, 'SUCCESS', 'Message has been printed');
      });
      worker.register('print', function (context) {
        // set result.msg to this.message, it should be the same as context.vars
        result.msg = context.input.msg;
        result.msg_vars = context.input.msg_vars;
        return context.success(null, 'SUCCESS', 'Message has been printed');
      });
      c = 0;
      worker.on('actionCompleted', function sourceNextCallback(context) {
        c += 1;
        if (c === 4) {
          // finish the test only when 'print' is executed.
          return callback(null, result);
        }
      });
      worker.start(function (err) {
        if (err) {
          return callback(err);
        }
      });
      client.connect(function (err) {
        if (err) {
          return callback(err);
        }
        client.run('hello_world', null, 'print');
      });
    },
    "The source should remain with no tasks": function (result) {
      if (result.message) {
        assert.ifError(result);
      }
      assert.equal(result.source._queues.print.list.length, 0);
    },
    "The callback should return the varariables of the main operation": function (result) {
      assert.equal(result.msg, 'Hello World');
      assert.equal(result.msg_vars, 'Hello World');
    }
  },
  "Having a worker with an operation that delays the completation for 1 second": {
    topic: function () {
      var callback,
        worker,
        client,
        source,
        result;
      callback = this.callback;
      worker = new orch.Worker();
      client = new orch.Client();
      source = new TestSource();
      worker.source = source;
      client.source = source;
      result = {
        source: source,
        worker: worker,
        time: new Date().getTime()
      };
      worker.register('delay_hello_world', function (context) {
        return context.delay(500).success(null, 'SUCCESS', 'The response was delayed');
      });
      worker.on('actionCompleted', function sourceNextCallback(context) {
        return callback(null, result);
      });
      worker.start(function (err) {
        if (err) {
          return callback(err);
        }
      });
      client.connect(function (err) {
        if (err) {
          return callback(err);
        }
        client.run('delay_hello_world', null);
      });
    },
    "The source should remain with no tasks": function (result) {
      if (result.message) {
        assert.ifError(result);
      }
      assert.equal(result.source._queues.delay_hello_world.list.length, 0);
    },
    "The completion should come 1 second later": function (result) {
      var completionTime = new Date().getTime();
      var time = completionTime - result.time;
      assert.ok(time > 450, util.format("Expected the completion time to be exactly or more than 500 ms but %sms was calculated", time));
    }
  }

}).export(module);
