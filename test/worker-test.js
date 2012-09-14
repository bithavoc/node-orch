
var orch = require('../index.js');
var assert = require('assert');
var vows = require('vows');
var testSource = require('./test-source').Worker;
var util = require('util');

vows.describe('Orch Worker').addBatch({
  "Having a worker with no task source": {
    topic: function() {
      var worker = new orch.Worker();
      return {
        worker: worker
      };
    }
    , "When I try to run a function it should raise an error about the missing source": function(result) {
      if(result.message) {
        assert.ifError(result);
      }
      assert.throws(function (){
        result.worker.start();
      }, function(err) {
        return err.message === 'source of tasks is required by the orch worker';
      });
    }
  }
  , "When I start a worker with a task non existing operation and a receiver": {
    topic: function() {
      var callback = this.callback;
      var worker = new orch.Worker();
      worker.automaticFlow = false; // don't call next after processing a task.
      var source = new testSource();
      worker.source = source;
      var result = {
        source: source,
        worker: worker
      };
      source.list.push({
        version: worker.protocolVersion,
        stack: [
          {
            action: 'receive'
          }
          , {
            action: 'generate',
            input: null
          }
        ]
      });
      worker.on('actionCompleted', function sourceNextCallback() {
        return callback(null, result);
      });
      worker.start();
    }
    , "The source should have the task re-enqueued": function(result) {
      if(result.message) {
        assert.ifError(result);
      }
      assert.equal(result.source.list.length, 1);
    }, "The task should have only the receiver with error ACTION_NOT_FOUND": function(result) {
      if(result.message) {
        assert.ifError(result);
      }
      var errorStack = result.source.list[0].stack[0].error.stack;
      assert.ok(errorStack, "The error stack should not be empty");
      assert.isString(errorStack, "The error stack should be an string");
      assert.notEqual(errorStack.indexOf("The action 'generate' was not found"), -1, "The stack should contain the error message");
      delete result.source.list[0].stack[0].error.stack;
      assert.deepEqual(result.source.list, [
        {
          version: result.worker.protocolVersion,
          stack: [{
            action: 'receive',
            error: {
              code: "ACTION_NOT_FOUND",
              msg: "The action 'generate' was not found",
              count: 1
            }
          }]
        }
      ]);
    }
  }
  , "Having a root action registered": {
    topic: function() {
      var worker = new orch.Worker();
      var rootOp = worker.register('rootOp', function(context) {

      });
      var cbOp = rootOp.callback('cbOp', function(context) {

      });
      return {
        rootOp: rootOp,
        callback1: cbOp
      }
    }
    , "The root operation should be marked as isRoot": function(result) {
      assert.isTrue(result.rootOp.isRoot);
      assert.isFalse(result.rootOp.isCallback);
      assert.isTrue(result.callback1.isCallback);
      assert.isFalse(result.callback1.isRoot);
    }
  }
  , "When I start a worker with a task that generates an inmediate result followed by a receiver": {
    topic: function() {
      var callback = this.callback;
      var worker = new orch.Worker();
      worker.automaticFlow = false; // don't call next after processing a task.
      var source = new testSource();
      worker.source = source;
      var result = {
        source: source,
        worker: worker
      };
      source.list.push({
        version: worker.protocolVersion,
        stack: [
          {
            action: 'print'
          }
          , {
            action: 'format_string',
            input: {
              format: "Hello %s",
              replacement: "World"
            }
          }
        ]
      });
      var formatString = worker.register('format_string', function(context) {
        var format = context.input.format;
        var replacement = context.input.replacement;
        return context.complete({
          msg: util.format(format, replacement)
        });
      });
      worker.on('actionCompleted', function sourceNextCallback() {
        return callback(null, result);
      });
      worker.start();
    }
    , "The source should have the task re-enqueued": function(result) {
      if(result.message) {
        assert.ifError(result);
      }
      assert.equal(result.source.list.length, 1);
    }
    , "The task should have only the receiver with input as the result of the generator": function(result) {
      if(result.message) {
        assert.ifError(result);
      }
      var errorStack = result.source.list[0].stack[0].error || null;
      assert.isNull(errorStack, "The error should be empty");
      assert.deepEqual(result.source.list, [
        {
          version: result.worker.protocolVersion,
          stack: [{
            action: 'print',
            input: {
              msg: "Hello World"
            }
          }]
        }
      ]);
    }
  }
  , "When I start a worker with a task that generates a deferred result followed by a receiver": {
    topic: function() {
      var callback = this.callback;
      var worker = new orch.Worker();
      worker.automaticFlow = false; // don't call next after processing a task.
      var source = new testSource();
      worker.source = source;
      var result = {
        source: source,
        worker: worker
      };
      source.list.push({
        version: worker.protocolVersion,
        stack: [
          {
            action: 'print'
          }
          , {
            action: 'reverse_format_string',
            input: {
              format: "s% olleH",
              replacement: "World"
            }
          }
        ]
      });
      worker.register('reverse_format_string', function(context) {
        return context.defer('reverse_string', {
          str: context.input.format
        }, "reverse_completed");
      }).callback('reverse_completed', function(context) {
        // never actually called, at least not in this test
      });
      worker.on('actionCompleted', function sourceNextCallback() {
        return callback(null, result);
      });
      worker.start();
    }
    , "The source should have the task re-enqueued": function(result) {
      if(result.message) {
        assert.ifError(result);
      }
      assert.equal(result.source.list.length, 1);
    }
    , "The task should have the receiver, the callback entry and the deferred entry in the stack": function(result) {
      if(result.message) {
        assert.ifError(result);
      }
      var errorStack = result.source.list[0].stack[0].error || null;
      assert.isNull(errorStack, "The error should be empty");
      assert.deepEqual(result.source.list, [
        {
          version: result.worker.protocolVersion,
          stack: [{
            action: 'print'
          }
          , {
            action: 'reverse_format_string#reverse_completed',
            deferredInput: {
              format: "s% olleH",
              replacement: "World"
            }
          }
          , {
            action: 'reverse_string',
            input: {
              str: "s% olleH"
            }
          }
          ]
        }
      ]);
    }
  }
  , "When I start a worker with a task that generates a chained deferred result followed by a receiver": {
    topic: function() {
      var callback = this.callback;
      var worker = new orch.Worker();
      worker.automaticFlow = false; // don't call next after processing a task.
      var source = new testSource();
      worker.source = source;
      var result = {
        source: source,
        worker: worker
      };
      source.list.push({
        version: worker.protocolVersion,
        stack: [
          {
            action: 'print'
          }
          , {
            action: 'reverse_format_string',
            input: {
              format: "s% olleH",
              replacement: "World"
            }
          }
        ]
      });
      var reverseFormatString = worker.register('reverse_format_string', function(context) {
        return context.defer('reverse_string', {
          str: context.input.format
        }, "reverse_completed");
      });
      reverseFormatString.callback('reverse_completed', function(context) {
        return context.defer('format_string', {
          format: context.result.str, // use context.result to get the result of reverse_string.
          replacement: context.input.replacement // use context.input to get the deferred input(deferredInput internally) of the main operation(reverse_format_string in this case)
        }, 'format_completed');
      });
      reverseFormatString.callback('format_completed', function(context) {
        return context.complete({
          str: context.result.msg,
          original_format: context.input.format
        });
      });
      worker.register('reverse_string', function(context) {
        var str = context.input.str;
        var res = [];
        var len = str.length;
        for(var i = len; i >= 0; i--) {
          var ni = len - i;
          res[ni] = str[i];
        }
        res = res.join('');

        return context.complete({
          str: res
        });
      });
      worker.register('format_string', function(context) {
        var format = context.input.format;
        var replacement = context.input.replacement;
        return context.complete({
          msg: util.format(format, replacement)
        });
      });
      var c = 0;
      worker.on('actionCompleted', function sourceNextCallback() {
        c++;
        if(c < 4) {
          source.next(); // manually trigger the execution of the first callback
        }
        else if(c == 4) { // finish the test only when the first callback was processed
          return callback(null, result);
        }
      });
      worker.start();
    }
    , "The source should have the task re-enqueued": function(result) {
      if(result.message) {
        assert.ifError(result);
      }
      assert.equal(result.source.list.length, 1);
    }
    , "The task should have the receiver and the deferred entry for the second callback in the stack": function(result) {
      if(result.message) {
        assert.ifError(result);
      }
      var errorStack = result.source.list[0].stack[0].error || null;
      assert.isNull(errorStack);
      assert.deepEqual(result.source.list, [
        {
          version: result.worker.protocolVersion,
          stack: [{
            action: 'print'
          },
          { 
            action: 'reverse_format_string#format_completed', 
            input: { msg: 'Hello World' }, 
            deferredInput: { replacement: 'World', format: 's% olleH' } 
          } 
          ]
        }
      ]);
    }
  }
  , "When I start a client and worker both with the same source configured with automaticFlow and I run an action": {
    topic: function() {
      var callback = this.callback;
      var worker = new orch.Worker();
      var client = new orch.Client();
      var source = new testSource();
      worker.source = source;
      client.source = source;
      var result = {
        source: source,
        worker: worker
      };
      var reverseFormatString = worker.register('reverse_format_string', function(context) {
        return context.defer('reverse_string', {
          str: context.input.format
        }, "reverse_completed");
      });
      reverseFormatString.callback('reverse_completed', function(context) {
        return context.defer('format_string', {
          format: context.result.str, // use context.result to get the result of reverse_string.
          replacement: context.input.replacement // use context.input to get the deferred input(deferredInput internally) of the main operation(reverse_format_string in this case)
        }, 'format_completed');
      });
      reverseFormatString.callback('format_completed', function(context) {
        return context.complete({
          str: context.result.msg,
          original_format: context.input.format
        });
      });
      worker.register('reverse_string', function(context) {
        var str = context.input.str;
        var res = [];
        var len = str.length;
        for(var i = len; i >= 0; i--) {
          var ni = len - i;
          res[ni] = str[i];
        }
        res = res.join('');
        return context.complete({
          str: res
        });
      });
      worker.register('format_string', function(context) {
        var format = context.input.format;
        var replacement = context.input.replacement;
        return context.complete({
          msg: util.format(format, replacement)
        });
      });
      worker.register('print', function(context) {
        result.print = context.input.str;
        result.original_format = context.input.original_format;
        return context.complete(null);
      });
      worker.on('actionCompleted', function sourceNextCallback(context) {
        if(context.actionMeta.name == 'print') {
          return callback(null, result);
        }
      });
      client.run('reverse_format_string', {
          format: "s% olleH",
          replacement: "World"
        }, 'print');
      worker.start();
    }
    , "The source should remain with no tasks": function(result) {
      if(result.message) {
        assert.ifError(result);
      }
      assert.equal(result.source.list.length, 0);
    }
    , "The continuation task must be executed": function(result) {
      assert.equal(result.print, "Hello World");
      assert.equal(result.original_format, "s% olleH");
    }
  }
  , "Having a worker with a registered operation that retries the same error continuously and have no retry policy": {
    topic: function() {
      var callback = this.callback;
      var worker = new orch.Worker();
      var client = new orch.Client();
      var source = new testSource();

      worker.source = source;
      client.source = source;
      var result = {
        source: source,
        worker: worker
      };
      worker.register('wrong_input', function(context) {
        context.retry(new Error("Some error due wrong input"), 'WRONG_INPUT');
      });
      worker.register('print', function(context) {
        result.resultError = context.error; // the receive gets the error by using context.error
        return context.complete(null);
      });
      var c = 0;
      worker.on('actionCompleted', function sourceNextCallback(context) {
        c++;
        if(c == 2) {
          // finish the test only when 'print' is executed.
          return callback(null, result);
        }
      });
      client.run('wrong_input', {
        str: "hello"
      }, 'print');
      worker.start();
    }
    , "The source should remain with no tasks": function(result) {
      if(result.message) {
        assert.ifError(result);
      }
      assert.equal(result.source.list.length, 0);
    }
    , "It should fail immediately and the receive should get the error": function(result) {
      assert.ok(result.resultError);
      assert.equal(result.resultError.msg, 'Some error due wrong input');
      assert.equal(result.resultError.code, 'WRONG_INPUT');
    }
  }
  , "Having a worker with a registered operation that retries the same error continuously based on retry policy": {
    topic: function() {
      var callback = this.callback;
      var worker = new orch.Worker();
      var client = new orch.Client();
      var source = new testSource();

      worker.source = source;
      client.source = source;
      var result = {
        source: source,
        worker: worker
      };
      worker.register('wrong_input', function(context) {
        context.retry(new Error("Some error due wrong input"), 'WRONG_INPUT');
      }).retry('WRONG_INPUT', 3);
      worker.register('print', function(context) {
        result.resultError = context.error; // the receive gets the error by using context.error
        return context.complete(null);
      });
      var c = 0;
      worker.on('actionCompleted', function sourceNextCallback(context) {
        c++;
        if(c == 4) {
          // finish the test only when 'print' is executed.
          return callback(null, result);
        }
      });
      client.run('wrong_input', {
        str: "hello"
      }, 'print');
      worker.start();
    }
    , "The source should remain with no tasks": function(result) {
      if(result.message) {
        assert.ifError(result);
      }
      assert.equal(result.source.list.length, 0);
    }
    , "It should fail after the retry count in the policy is reached": function(result) {
      assert.ok(result.resultError);
      assert.equal(result.resultError.msg, 'Some error due wrong input');
      assert.equal(result.resultError.code, 'WRONG_INPUT');
      assert.equal(result.resultError.count, 3);
    }
  }

}).run();
