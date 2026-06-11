"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolvePackageExtraResource = resolvePackageExtraResource;
const electron_1 = require("electron");
const path_1 = require("path");
function resolvePackageExtraResource(...segments) {
    if (!electron_1.app.isPackaged) {
        const packageRoot = (0, path_1.join)((0, path_1.dirname)(__dirname), "..");
        const [first, second, ...rest] = segments;
        if (first === "bin" && second === "tobiifree-helper") {
            return (0, path_1.join)(packageRoot, "tools", "tobiifree-helper", ...rest);
        }
        if (first === "bin" && second === "tobiifree-sdk") {
            return (0, path_1.join)(packageRoot, "tools", "tobiifree-sdk", ...rest);
        }
        if (first === "bin" && second === "node_modules") {
            return (0, path_1.join)(packageRoot, "node_modules", ...rest);
        }
        return (0, path_1.join)(packageRoot, "extraResources", ...segments);
    }
    const basePath = (0, path_1.join)(process.resourcesPath, "extraResources");
    return (0, path_1.join)(basePath, ...segments);
}
//# sourceMappingURL=resolvePackageExtraResource.js.map