var common = require('./common');

function Client() {
  this.protocolVersion = common.ProtocolVersion;
}

//
// Will validate internal state of the client before performing any critical operation..
//
Client.prototype._validate = function() {
  if(!this.source) {
    throw new Error("source of tasks is required by the orch client");
  }
};

//
// Starts and Runs a Task triggering the action, input and continuation.
//
Client.prototype.run = function(action, input, continuation) {
  this._validate();
  if(typeof(action) !== 'string') {
    throw new Error("action name argument is required");
  }
  if(typeof(input) === 'undefined') {
    throw new Error("action input argument is required");
  }
  if(typeof(continuation) !== 'string') {
    throw new Error("action continuation argument is required");
  }
  this.source.enqueue({
      version: this.protocolVersion
    , stack: [
      {
        action: continuation
      }
      ,{
          action: action
        , input: input
      }
    ]
  });
}

Client.prototype.connect = function connect(cb) {
  this._validate();
  return this.source.connect(cb);
}

module.exports = Client;
