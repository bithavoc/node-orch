"use strict";

var assert = require('assert');
var DEFAULT_COUNT = 0;

function ActionPayloadStatus(st) {
  if (st) {
    this.code = st.code || null;
    this.msg = st.msg || null;
    this.stack = st.stack || null;
    this.count = st.count || DEFAULT_COUNT;
  } else {
    this.code = null;
    this.msg = null;
    this.stack = null;
    this.count = DEFAULT_COUNT;
  }
}

ActionPayloadStatus.prototype.clone = function clone() {
  return new ActionPayloadStatus(this);
};

ActionPayloadStatus.prototype.isEmpty = function isEmpty() {
  return !(this.code || this.msg || this.stack || this.count);
};

module.exports = function ActionPayload(entry, readonly) {
  assert.ok(entry);
  this.status = new ActionPayloadStatus(entry.status || null);
  this.values = entry.input || null;
  this.vars = entry.vars || {};
};

