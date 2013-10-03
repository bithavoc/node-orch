"use strict";

var orch = require('../index.js');
var assert = require('assert');
var vows = require('vows');
var TestSource = require('./test-source');
var util = require('util');

vows.describe('Orch Source').addBatch({
  "Source#connect() waits for actual connection": {
    topic: new TestSource(),

    "When I call connect(), the source is actively connecting": function(err, source) {
      source.connect(function(err){});
      assert.isTrue(source.isConnecting);
      assert.isFalse(source.isConnected);
    },
    "If I call connect() a second time, the callback waits until it is connected.": {
      topic: function(source) {
        var cb = this.callback;
        source.connect(function(err) { cb(err, source); });
      },
      "the callback waits until it is connected.": function(err, source) {
        assert.isTrue(source.isConnected);
        assert.isFalse(source.isConnecting);
      }
    }
  }
}).export(module);
