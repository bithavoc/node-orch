"use strict";

var assert = require('assert');

function ActionPayloadStatus(st) {
  if (st) {
    this.code = st.code || null;
    this.msg = st.msg || null;
    this.stack = st.stack || null;
    this.count = st.count || null;
  } else {
    this.reset();
  }
}

ActionPayloadStatus.prototype.reset = function reset() {
  this.code = null;
  this.msg = null;
  this.stack = null;
  this.count = null;
};

ActionPayloadStatus.prototype.clone = function clone() {
  return new ActionPayloadStatus(this);
};

ActionPayloadStatus.prototype.isEmpty = function isEmpty() {
  return !(this.code || this.msg || this.stack || this.count);
};

ActionPayloadStatus.prototype.toJSON = function toJSON() {
  var obj = {};
  if (typeof this.code !== 'undefined' && this.code !== null) {
    obj.code = this.code;
  }
  if (typeof this.msg !== 'undefined' && this.msg !== null) {
    obj.msg = this.msg;
  }
  if (typeof this.stack !== 'undefined' && this.stack !== null) {
    obj.stack = this.stack;
  }
  if (typeof this.count !== 'undefined' && this.count !== null) {
    obj.count = this.count;
  }
  return obj;
};

module.exports = function ActionPayload(entry, readonly) {
  assert.ok(entry);
  this.status = new ActionPayloadStatus(entry.status || null);
  this.values = entry.input || null;
  this.vars = entry.vars || {};
};

