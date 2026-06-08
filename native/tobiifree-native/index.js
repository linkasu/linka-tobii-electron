"use strict";

try {
  module.exports = require("node-gyp-build")(__dirname);
} catch (error) {
  module.exports = require("./build/Release/tobiifree_native.node");
}
