"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTobiiExtraResources = getTobiiExtraResources;
exports.getTobiiAsarUnpackPatterns = getTobiiAsarUnpackPatterns;
const path_1 = require("path");
const module_1 = require("module");
const requireFromPackage = (0, module_1.createRequire)(__filename);
function packageRoot() {
    return (0, path_1.join)((0, path_1.dirname)(__dirname), "..");
}
function dependencyRoot(name) {
    return (0, path_1.dirname)(requireFromPackage.resolve(`${name}/package.json`, {
        paths: [packageRoot(), process.cwd()]
    }));
}
function getTobiiExtraResources() {
    const root = packageRoot();
    return [
        {
            from: (0, path_1.join)(root, "tools", "tobiifree-helper"),
            to: "extraResources/bin/tobiifree-helper",
            filter: ["**/*"]
        },
        {
            from: (0, path_1.join)(root, "tools", "tobiifree-sdk"),
            to: "extraResources/bin/tobiifree-sdk",
            filter: ["**/*"]
        },
        {
            from: dependencyRoot("usb"),
            to: "extraResources/bin/node_modules/usb",
            filter: ["**/*"]
        },
        {
            from: dependencyRoot("node-gyp-build"),
            to: "extraResources/bin/node_modules/node-gyp-build",
            filter: ["**/*"]
        },
        {
            from: (0, path_1.join)(root, "extraResources", "bin"),
            to: "extraResources/bin",
            filter: ["EyeLog.exe", "*.dll", "*.config"]
        }
    ];
}
function getTobiiAsarUnpackPatterns() {
    return [
        "node_modules/@linkasu/tobii-electron/native/tobiifree-native/**/*.node",
        "node_modules/@linkasu/tobii-electron/node_modules/@linka/tobiifree-native/**/*.node",
        "node_modules/@linka/tobiifree-native/**/*.node"
    ];
}
//# sourceMappingURL=index.js.map