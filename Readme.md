## Orch.js

Orch.js: RCP Orchestration Library (or the bastard son of Delayed Jobs and RCP).

### Features

* Request/Reply RPC
* Durable tasks
* Fire & Forget operations
* Dynamic Workflow-like execution
* Nested calls and Callbacks
* Error Handling / Retry Support
* Granular Scaling
* AMQP Support (RabbitMQ)

### How it Works

* A JSON document called _task_ contains an stack of actions to be performed. The initial task only contain one or two actions. Other actions can be added dynamically by the execution of initial seed of actions.
* Every action generates a result that will be used as the input of the next action creating a simple but effective workflow-like orchestration of operations until there is no action to perform in the task.
* Queues matching the name of the next action will hold the task to be executed, a worker will listen to the queue and pick up the task as they arrive and perform one action, enqueue the task again in the same queue (recursion/loops) or post it in another queue(continuation).
* Workers can implement all or a partial set of actions, allowing granular scaling without hassle.

The decoupled nature of Orch.js will enable the implementation in other Programming Languages in the future, allowing the creation of distributed polyglot applications.

### Installation

    $ npm install orch orch-amqp

### Usage

The next examples assume you are using [orch-amqp](https://github.com/bithavoc/node-orch-amqp) and [RabbitMQ](http://www.rabbitmq.com/).

#### Client: Creating Tasks

In order to run operations, you need to use a Client. The client will create the tasks for you. 

The following example shows how to start a task with two initial actions. It will perform 'generate_message' followed by 'print':

	// Generate a Message and then Print it.
	client.run('generate_message', {
		message: "Hello %s",
		name: "John Doe"
	}, 'print'); // The result of 'generate_message' will be the input of 'print'.

See full source code at: [examples/hello\_world\_client.js](https://github.com/bithavoc/node-orch/blob/master/examples/hello_world_client.js)

*print* doesn't need an input. the result of 'generate_message' will be input in the future.

Once you run the client app, you will see how Orch.js prepared all the necessary queues and posted the task.

![generate_message queue in rabbitmq](https://raw.github.com/bithavoc/node-orch/master/examples/images/generate_message_queue_list.png)

Orch will create durable queues, even if you restart RabbitMQ you will still have your messages waiting to be processed any worker that implements the operation.

Now we need to implement the operations.

#### Workers: Implementing Operations

Operations are implemented as functions along with the action to respond. Each worker can implement one or more actions.

**Worker #0**. This worker implements the operation *generate_message*:

	worker.register('generate_message', function generateMessage(context) {
	  console.log("(Worker: Processing generate_message)");
	  context.success({
	    msg: util.format(context.input.message, context.input.name)
	  }, 'SUCCESS', 'Message has been generated');
	});

See full source code at: [examples/hello\_world\_generate\_message.js](https://github.com/bithavoc/node-orch/blob/master/examples/hello_world_generate_message.js)

Once you run this worker, you will see how another queue was created to hold the task now needing to perform the print.

![print queue in rabbitmq](https://raw.github.com/bithavoc/node-orch/master/examples/images/print_queues_list.png)

**Worker #1**: This worker implements the operation *print*:

	worker.register('print', function print(context) {
	  console.log("(Worker: Processing print)");
	  console.log("Print: %s", context.input.msg);
	  context.success(null, 'SUCCESS', 'Message has been printed');
	});

See full source code at: [examples/hello\_world\_print.js](https://github.com/bithavoc/node-orch/blob/master/examples/hello_world_print.js)

Once you run this second worker, the last action of the task is completed and the task is considered done.

![queues empty in rabbitmq](https://raw.github.com/bithavoc/node-orch/master/examples/images/print_empty.png)

The output for the second worker would be:

    (Worker: Processing print)
    Print: Hello John Doe

Of course this is just an example, nothing this simple requires such distributed execution, Orch.js is intended to be used for distribution of heavy/cpu-bound operations that should not be performed in the main web server.

#### Callbacks and Deferred Results
An operation may often run nested actions before providing a final result, this is called deferred results. Callbacks receive the result of the nested operation and then provide the final result for the main operation.

Example: Because string formatting is an operation that can be reused easily, with the help of callbacks we can refactor our Hello World to as follows:

    -> generate_message				// defer the result to format_string
       -> format_string				// nested call
	-> generate_message#formatted	// callback generates deferred result
	-> print						// receives deferred result

This is how we implement it:

	// Operation: generate_message
	var generateMessage = worker.register('generate_message', function generateMessage(context) {
	  console.log("(Worker: Processing generate_message)");
	  context.defer('format_string', {
	    format: context.input.message,
	    value: context.input.name
	  }, 'formatted');
	});

	// Callback: generate_message#formatted
	generateMessage.callback('formatted', function formatted(context) {
	  context.success({
	    msg: context.result.str
	  }, 'SUCCESS', 'Message has been generated');
	});

	// Operation: format_string
	worker.register('format_string', function formatString(context) {
	  console.log("(Worker: Processing format_string)");
	  context.success({
	    str: util.format(context.input.format, context.input.value)
	  }, 'SUCCESS', 'Message has been formatted');
	});

	// Operation: print
	worker.register('print', function print(context) {
	  console.log("(Worker: Processing print)");
	  console.log("Print: %s", context.input.msg);
	  context.success(null, 'SUCCESS', '');
	});


See full source code at: [examples/deferred\_worker.js](https://github.com/bithavoc/node-orch/blob/master/examples/deferred_worker.js)

Worker Output:

	(Worker: Processing generate_message)
	(Worker: Processing format_string)
	(Worker: Processing print)
	Print: Hello John Doe

#### Error Handling

You can use `context.fail` to immediately report errors as result.

	// Callback: generate_message#formatted
	generateMessage.callback('formatted', function formatted(context) {
	  if (context.status.code != 'SUCCESS') {
	    // here we handle the error of 'format_string'.
	    return context.success({
	      msg: "Houston, Internal Application Error!"
	    }, 'ERROR', "Some error came up");
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
	});

See full source code at: [examples/errors\_worker.js](https://github.com/bithavoc/node-orch/blob/master/examples/errors_worker.js)

Worker output:

	(Worker: Processing generate_message)
	(Worker: Processing format_string)
	(Worker: Processing print)
	Print: Houston, Internal Application Error!

The error structure contains:

* msg (String)
* stack (String)
* code (String)

**Note:** All operations can receive errors instead of a regular input, however, error handling only makes sense inside callbacks.

#### Error Retry

Some of errors are caused due unavailability of external resources and can be retried later when they are available. To specify the number of times you want to retry in case of certain error, you can use `ActionMeta.retry` at the moment you register the operation and `context.retry` in the implementation of the action:

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

When the retry limit is reached, `context.fail` will be called for you.

See full source code at: [examples/retry\_worker.js](https://github.com/bithavoc/node-orch/blob/master/examples/retry_worker.js)

Worker output:

	(Worker: Processing generate_message)
	(Worker: Processing format_string)
	(Worker: Processing format_string)
	(Worker: Processing format_string)
	(Worker: Processing print)
	Print: Houston, Internal Application Error!

#### Sharing variables between Callbacks

`contexts.vars` is the dictionary containing all the values shared between the main operation and the callbacks. Since the implementation function is bound to `context.vars`, you can also use `this` to set whatever variable you need.

	...
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
	...
	// Callback: generate_message#formatted
	generateMessage.callback('formatted', function(context) {
	  // here we use the variable req_time
	  context.success({
	    msg: context.result.str + " " + this.req_time
	  }, 'SUCCESS', 'Completed!');
	});

Just like inputs and results, the variables need to be JSON friendly since they are serialized within the task document.

#### Performing Distributed RPC Calls

You can wait for a task to complete and get the results by performing the task in RPC mode.

	...
	client.enableRpc = true;
	...
	// Generate a Message and then Print it.
	client.rpc('generate_message', {
	    message: "Hello %s",
	    name: "John Doe"
	  }, function rpcCompleted(err, context) {
	  assert.ifError(err);
	  console.log("Result", context.result);
	});


### Tests

    npm test

### What's next? (TODO)

* Logging. A separate queue fed by AMQP Fanout exchange with bindings for all actions.
* Using the same logging mechanism, create a CLI tool to see the progress of a task across the queues. Breakpoints can be implemented as a pseudo-worker that takes the message without doing any ACK. We might need modify the specification to add a *taskId* property.

## License (MIT)

Copyright (c) 2012-2014 Bithavoc.com -  http://bithavoc.io

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NON-INFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

