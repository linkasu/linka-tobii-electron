"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EyeLogTrackerProcess = void 0;
const events_1 = require("events");
const TobiiProcess_1 = require("eyelog/dist/TobiiProcess");
const bound_1 = require("eyelog/dist/bound");
const resolvePackageExtraResource_1 = require("./resolvePackageExtraResource");
class EyeLogTrackerProcess extends events_1.EventEmitter {
    tracker;
    screenRect = { x: 0, y: 0, width: 1, height: 1 };
    scaleFactor = 1;
    status = {
        state: "connecting",
        mode: "direct",
        message: "Запуск EyeLog",
        deviceFound: false,
        updatedAt: Date.now()
    };
    constructor(resolveExtraResource = resolvePackageExtraResource_1.resolvePackageExtraResource) {
        super();
        this.tracker = new TobiiProcess_1.TobiiProcess(resolveExtraResource("bin", "EyeLog.exe"));
        this.tracker.on("enter", (index) => this.emit("enter", index));
        this.tracker.on("exit", () => this.emit("exit"));
        this.tracker.on("click", (index, count) => this.emit("click", index, count));
        this.tracker.on("gaze", (x, y) => this.onRawGaze(x, y));
        this.tracker.on("stderr", (data) => {
            const message = data.trim();
            if (message)
                console.warn("[eyelog]", message);
        });
        this.tracker.on("error", (error) => {
            this.updateStatus({ state: "error", message: "Ошибка EyeLog", lastError: error.message, deviceFound: false });
            console.warn("[eyelog] process error", error);
        });
        this.tracker.on("processExit", (code, signal) => {
            this.updateStatus({
                state: "service_unavailable",
                message: "EyeLog завершился",
                lastError: `exit ${code ?? signal ?? "unknown"}`,
                deviceFound: false
            });
        });
        this.updateStatus({ state: "connected", message: "EyeLog запущен" });
    }
    on(event, listener) {
        return super.on(event, listener);
    }
    emit(event, ...args) {
        return super.emit(event, ...args);
    }
    getStatus() {
        return this.status;
    }
    setBounds(bounds) {
        this.tracker.setBounds(bounds.map(({ x, y, width, height }) => new bound_1.Bound(x, y, width, height)));
    }
    setTimeout(value) {
        this.tracker.setTimeout(value);
    }
    setScaleFactor(value) {
        this.scaleFactor = Number.isFinite(value) && value > 0 ? value : 1;
    }
    setScreenRect(x, y, width, height) {
        this.screenRect = { x, y, width, height };
    }
    destroy() {
        this.tracker.destroy?.();
    }
    onRawGaze(x, y) {
        if (!Number.isFinite(x) || !Number.isFinite(y))
            return;
        const now = Date.now();
        const screenPoint = {
            x: x / this.scaleFactor,
            y: y / this.scaleFactor
        };
        const point = {
            ...screenPoint,
            valid: this.isInsideScreenRect(screenPoint.x, screenPoint.y),
            source: "tobii",
            timestamp: now
        };
        this.updateStatus({ state: "tracking", message: "EyeLog получает взгляд", deviceFound: true, lastGazeAt: now });
        this.emit("debug", {
            raw: { x, y },
            normalized: screenPoint,
            screen: screenPoint,
            screenRect: this.screenRect,
            boundsCount: 0,
            hitIndex: -1,
            softwareCalibration: false,
            scaleFactor: this.scaleFactor,
            at: now
        });
        this.emit("gaze", point);
    }
    isInsideScreenRect(x, y) {
        return x >= this.screenRect.x && x <= this.screenRect.x + this.screenRect.width &&
            y >= this.screenRect.y && y <= this.screenRect.y + this.screenRect.height;
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
exports.EyeLogTrackerProcess = EyeLogTrackerProcess;
//# sourceMappingURL=EyeLogTrackerProcess.js.map