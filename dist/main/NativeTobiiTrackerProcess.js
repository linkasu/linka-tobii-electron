"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NativeTobiiTrackerProcess = void 0;
const events_1 = require("events");
const electron_1 = require("electron");
const promises_1 = require("fs/promises");
const module_1 = require("module");
const path_1 = require("path");
const requireNative = (0, module_1.createRequire)(__filename);
class NativeTobiiTrackerProcess extends events_1.EventEmitter {
    tracker;
    calibrationPath = (0, path_1.join)(electron_1.app.getPath("userData"), "tobiifree-native-calibration.bin");
    status = {
        state: "connecting",
        mode: "native",
        message: "Подключение к Tobii",
        deviceFound: false,
        updatedAt: Date.now()
    };
    constructor(nativeModule = loadNativeTobiiModule()) {
        super();
        if (nativeModule.isRuntimeSupported && !nativeModule.isRuntimeSupported()) {
            throw new Error(nativeModule.getRuntimeSupportReason?.() || "Native Tobii tracker is not supported on this platform");
        }
        this.tracker = new nativeModule.NativeTobiiTracker((event) => this.onNativeEvent(event));
    }
    on(event, listener) {
        return super.on(event, listener);
    }
    emit(event, ...args) {
        return super.emit(event, ...args);
    }
    async initialize() {
        await this.tracker.start();
        this.updateStatus({ state: "connected", message: "Tobii подключён", deviceFound: true });
        await this.applySavedCalibration();
    }
    getStatus() {
        return this.status;
    }
    setBounds(bounds) {
        this.tracker.setBounds(bounds);
    }
    setTimeout(value) {
        this.tracker.setTimeout(value);
    }
    setScaleFactor(value) {
        this.tracker.setScaleFactor(value);
    }
    setScreenRect(x, y, width, height) {
        this.tracker.setScreenRect(x, y, width, height);
    }
    setDebugEnabled(value) {
        this.tracker.setDebugEnabled(value);
    }
    async startCalibration() {
        await this.tracker.startCalibration();
    }
    async addCalibrationPoint(x, y) {
        await this.tracker.addCalibrationPoint(x, y);
    }
    async finishCalibration() {
        const blob = await this.tracker.finishCalibration();
        await (0, promises_1.mkdir)(electron_1.app.getPath("userData"), { recursive: true });
        await (0, promises_1.writeFile)(this.calibrationPath, blob);
    }
    async applySavedCalibration() {
        try {
            const blob = await (0, promises_1.readFile)(this.calibrationPath);
            await this.tracker.applyCalibration(blob);
            return true;
        }
        catch (error) {
            if (error instanceof Error && "code" in error && error.code === "ENOENT")
                return false;
            console.warn("[tobiifree-native] could not apply saved calibration", error);
            return false;
        }
    }
    destroy() {
        this.tracker.destroy();
    }
    onNativeEvent(event) {
        if (event.type === "ready")
            return;
        if (event.type === "enter") {
            this.emit("enter", event.index);
            return;
        }
        if (event.type === "exit") {
            this.emit("exit");
            return;
        }
        if (event.type === "click") {
            this.emit("click", event.index, event.count);
            return;
        }
        if (event.type === "debug") {
            this.emit("debug", event.state);
            this.emit("gaze", {
                x: event.state.screen.x,
                y: event.state.screen.y,
                valid: event.state.hitIndex >= 0,
                source: "tobii",
                timestamp: Date.now()
            });
            return;
        }
        this.updateStatus({ state: "error", message: event.message, lastError: event.message, deviceFound: false });
        console.warn("[tobiifree-native]", event);
    }
    updateStatus(patch) {
        this.status = {
            ...this.status,
            ...patch,
            updatedAt: Date.now()
        };
        this.emit("status", this.status);
    }
}
exports.NativeTobiiTrackerProcess = NativeTobiiTrackerProcess;
function loadNativeTobiiModule() {
    // createRequire keeps Windows/Linux builds from resolving the macOS-only optional dependency at bundle time.
    return requireNative("@linka/tobiifree-native");
}
//# sourceMappingURL=NativeTobiiTrackerProcess.js.map