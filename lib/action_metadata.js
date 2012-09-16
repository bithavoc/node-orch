"use strict";

var assert = require('assert');

function ActionMetadata(options) {
  assert.ok(options);
  var self = this;

  function setReadOnly(name, val) {
    Object.defineProperty(self, name, {
      configurable: false,
      enumerable: true,
      value: val,
      writable: false
    });
  }

  Object.keys(options).forEach(function optionsLoop(propName) {
    var val = options[propName];

    // create read-only properties for the given options.
    setReadOnly(propName, val);
  }, this);

  setReadOnly('callbacks', {});

  // Error Retry Spec Map
  setReadOnly('retries', {});
}

ActionMetadata.createRootMetadata = function createRootMetadata(worker, name, impl) {
  assert.ok(worker);
  assert.ok(name);
  assert.ok(impl);

  return new ActionMetadata({
    worker: worker,
    name: name,
    impl: impl,
    isRoot: true,
    isCallback: false
  });
};

ActionMetadata.createCallbackMetadata = function createCallbackMetadata(root, name, impl) {
  assert.ok(root);
  assert.ok(name);
  assert.ok(impl);
  var worker,
    meta;

  worker = root.worker;
  meta = new ActionMetadata({
    worker: worker,
    name: ActionMetadata.generateCallbackName(root.name, name),
    localName: name,
    impl: impl,
    root: root,
    isRoot: false,
    isCallback: true
  });

  // add the metadata as a callback of the root.
  Object.defineProperty(root.callbacks, name, {
    configurable: false,
    enumerable: true,
    value: meta,
    writable: false
  });

  worker._register(meta);
  return meta;
};

//
// Generates the name of the callback for an action.
//
ActionMetadata.generateCallbackName = function generateCallback(action, callbackName) {
  assert.ok(action);
  assert.ok(callbackName);
  return [action, callbackName].join('#');
};

ActionMetadata.prototype.callback = function createCallback(name, impl) {
  // TODO: Forbig nested callbacks
  return ActionMetadata.createCallbackMetadata(this, name, impl);
};

ActionMetadata.prototype.retry = function retry(code, count) {
  if (typeof code !== 'string') {
    throw new Error("The retry error code is required to be an string");
  }
  if (typeof count !== 'number') {
    throw new Error("The retry error count is required to be a number");
  }
  this.retries[code] = {
    code: code,
    count: count
  };
};

ActionMetadata.prototype.lookRetry = function lookRetry(code) {
  if (typeof code !== 'string') {
    throw new Error("The retry error code is required to be an string");
  }
  var retrySpec = this.retries[code];
  if (!retrySpec) {
    return {
      code: code,
      count: 1
    };
  }
  return retrySpec;
};

module.exports = ActionMetadata;
