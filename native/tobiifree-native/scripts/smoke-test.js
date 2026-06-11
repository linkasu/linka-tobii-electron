"use strict";

const assert = require("node:assert/strict");
const native = require("../");

assert.equal(typeof native.NativeTobiiTracker, "function");
assert.equal(typeof native.isRuntimeSupported, "function");
assert.equal(typeof native.getRuntimeSupportReason, "function");

const events = [];
const tracker = new native.NativeTobiiTracker((event) => events.push(event));

tracker.setScreenRect(0, 0, 1000, 1000);
tracker.setScaleFactor(1);
tracker.setBounds([{ x: 100, y: 100, width: 200, height: 200 }]);
tracker.setTimeout(0);
tracker.setDebugEnabled(true);
tracker._emitTestGaze(0.2, 0.2);
tracker._emitTestGaze(0.9, 0.9);
tracker.destroy();

assert.ok(events.some((event) => event.type === "debug" && event.state.hitIndex === 0));
assert.ok(events.some((event) => event.type === "enter" && event.index === 0));
assert.ok(events.some((event) => event.type === "click" && event.index === 0 && event.count === 1));
assert.ok(events.some((event) => event.type === "exit"));

if (native.isRuntimeSupported()) {
  assert.equal(native.getRuntimeSupportReason(), undefined);
} else {
  assert.equal(typeof native.getRuntimeSupportReason(), "string");
}

console.log(`tobiifree-native smoke ok (${process.platform})`);
