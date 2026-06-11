"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EyeLogTrackerProcess = void 0;
const TobiiProcess_1 = require("eyelog/dist/TobiiProcess");
const bound_1 = require("eyelog/dist/bound");
const resolvePackageExtraResource_1 = require("./resolvePackageExtraResource");
class EyeLogTrackerProcess extends TobiiProcess_1.TobiiProcess {
    constructor(resolveExtraResource = resolvePackageExtraResource_1.resolvePackageExtraResource) {
        super(resolveExtraResource("bin", "EyeLog.exe"));
    }
    setBounds(bounds) {
        super.setBounds(bounds.map(({ x, y, width, height }) => new bound_1.Bound(x, y, width, height)));
    }
    destroy() {
        // node-eyelog does not expose process cleanup; keep Windows behavior unchanged.
    }
}
exports.EyeLogTrackerProcess = EyeLogTrackerProcess;
//# sourceMappingURL=EyeLogTrackerProcess.js.map