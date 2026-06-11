"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TobiiFreeTrackerProcess = void 0;
const events_1 = require("events");
const electron_1 = require("electron");
const child_process_1 = require("child_process");
const net_1 = require("net");
const os_1 = require("os");
const promises_1 = require("fs/promises");
const path_1 = require("path");
const defaultSoftwareCalibration_1 = require("./defaultSoftwareCalibration");
const resolvePackageExtraResource_1 = require("./resolvePackageExtraResource");
const SERVICE_START_COOLDOWN_MS = 2000;
const SERVICE_RECONNECT_MAX_MS = 5000;
class TobiiFreeTrackerProcess extends events_1.EventEmitter {
    resolveExtraResource;
    process;
    socket;
    helperReady = false;
    buffer = "";
    bounds = [];
    screenRect = { x: 0, y: 0, width: 1, height: 1 };
    timeout = 1000;
    scaleFactor = 1;
    extraOffsetX = Number(process.env.TOBIIFREE_GAZE_OFFSET_X || 0);
    extraOffsetY = Number(process.env.TOBIIFREE_GAZE_OFFSET_Y || 0);
    currentIndex;
    enteredAt = 0;
    clicked = false;
    requestId = 1;
    gazeSamples = 0;
    lastDebugAt = 0;
    debugEnabled = false;
    boundsLogged = false;
    displayLogged = false;
    destroyed = false;
    reconnectAttempt = 0;
    reconnectTimer;
    lastServiceStartAt = 0;
    lastAutoApplyAt = 0;
    pending = new Map();
    readyWaiters = [];
    socketPath = "";
    calibrationPath = (0, path_1.join)(electron_1.app.getPath("userData"), "tobiifree-calibration.bin");
    softwareCalibrationPath = (0, path_1.join)(electron_1.app.getPath("userData"), "tobiifree-software-calibration.json");
    softwareCalibration;
    calibrationSamples = [];
    recentGazePoints = [];
    status = {
        state: "service_starting",
        mode: "socket-service",
        message: "Запуск службы Tobii",
        socketPath: this.socketPath,
        deviceFound: false,
        updatedAt: Date.now()
    };
    constructor(options = {}) {
        super();
        this.resolveExtraResource = options.resolveExtraResource || resolvePackageExtraResource_1.resolvePackageExtraResource;
        const socketName = options.socketName || "su.linka.tobii";
        this.socketPath = process.env.TOBIIFREE_SERVICE_SOCKET || (0, path_1.join)((0, os_1.tmpdir)(), `${socketName}.${typeof process.getuid === "function" ? process.getuid() : "user"}.sock`);
        this.status.socketPath = this.socketPath;
        this.connectToService();
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
        this.bounds = bounds;
        if (!this.boundsLogged) {
            this.boundsLogged = true;
            console.warn("[tobiifree-helper] bounds received", { count: bounds.length });
        }
    }
    setTimeout(value) {
        this.timeout = value;
    }
    setScaleFactor(value) {
        this.scaleFactor = value;
    }
    setScreenRect(x, y, width, height) {
        this.screenRect = { x, y, width, height };
        this.displayLogged = false;
    }
    setDebugEnabled(value) {
        this.debugEnabled = value;
    }
    async initialize() {
        await this.waitForHelperReady(15000);
    }
    destroy() {
        this.destroyed = true;
        this.resetTarget(true);
        if (this.reconnectTimer)
            clearTimeout(this.reconnectTimer);
        this.socket?.destroy();
        this.socket = undefined;
        for (const [, request] of this.pending) {
            clearTimeout(request.timer);
            request.reject(new Error("TobiiFree helper stopped"));
        }
        this.pending.clear();
        for (const waiter of this.readyWaiters) {
            clearTimeout(waiter.timer);
            waiter.reject(new Error("TobiiFree helper stopped"));
        }
        this.readyWaiters = [];
    }
    async startCalibration() {
        this.resetTarget(true);
        this.calibrationSamples = [];
        await this.sendCommand("calibration.start");
    }
    async addCalibrationPoint(x, y) {
        this.rememberSoftwareCalibrationPoint({ x, y });
        await this.sendCommand("calibration.addPoint", { x, y });
    }
    async finishCalibration() {
        const blobBase64 = await this.sendCommand("calibration.finish", undefined, 30000);
        if (!blobBase64)
            return;
        await (0, promises_1.mkdir)(electron_1.app.getPath("userData"), { recursive: true });
        await (0, promises_1.writeFile)(this.calibrationPath, Buffer.from(blobBase64, "base64"));
        await this.saveSoftwareCalibration();
    }
    async applySavedCalibration() {
        let hardwareCalibrationApplied = false;
        try {
            const blob = await (0, promises_1.readFile)(this.calibrationPath);
            await this.sendCommand("calibration.apply", { blobBase64: blob.toString("base64") }, 15000);
            hardwareCalibrationApplied = true;
        }
        catch (error) {
            if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) {
                console.warn("[tobiifree-helper] could not apply saved calibration", error);
            }
        }
        await this.loadSoftwareCalibration();
        return hardwareCalibrationApplied || !!this.softwareCalibration;
    }
    restartService() {
        this.socket?.destroy();
        this.helperReady = false;
        this.rejectPending(new Error("Tobii service restart requested"));
        this.startService(true);
        this.scheduleReconnect("restart requested");
    }
    connectToService() {
        if (this.destroyed)
            return;
        this.socket?.destroy();
        this.buffer = "";
        let connected = false;
        const socket = new net_1.Socket();
        this.socket = socket;
        this.updateStatus({
            state: this.reconnectAttempt > 0 ? "reconnecting" : "connecting",
            message: this.reconnectAttempt > 0 ? "Переподключение к службе Tobii" : "Подключение к службе Tobii",
            reconnectAttempt: this.reconnectAttempt,
            deviceFound: false
        });
        socket.setEncoding("utf8");
        socket.on("connect", () => {
            connected = true;
            this.helperReady = true;
            this.reconnectAttempt = 0;
            this.resolveReadyWaiters();
            this.updateStatus({ state: "connecting", message: "Служба Tobii подключена", deviceFound: false });
            this.writeSocketCommand({ command: "subscribe.gaze" });
            this.writeSocketCommand({ command: "status.get" });
        });
        socket.on("data", (chunk) => this.onSocketData(chunk.toString()));
        socket.on("error", (error) => {
            if (error.code === "ECONNREFUSED") {
                void (0, promises_1.rm)(this.socketPath, { force: true });
            }
            console.warn("[tobiifree-helper] socket error", error.message);
            if (!connected)
                this.startService();
            this.updateStatus({
                state: "service_unavailable",
                message: "Служба Tobii недоступна, пробую запустить",
                lastError: error.message,
                deviceFound: false
            });
        });
        socket.on("close", () => {
            if (this.destroyed)
                return;
            this.helperReady = false;
            this.resetTarget(true);
            this.rejectPending(new Error("Tobii service disconnected"));
            this.scheduleReconnect("socket closed");
        });
        socket.connect(this.socketPath);
    }
    startService(force = false) {
        const now = Date.now();
        if (!force && now - this.lastServiceStartAt < SERVICE_START_COOLDOWN_MS)
            return;
        this.lastServiceStartAt = now;
        const helperPath = electron_1.app.isPackaged
            ? this.resolveExtraResource("bin", "tobiifree-helper", "index.mjs")
            : this.resolveExtraResource("bin", "tobiifree-helper", "index.mjs");
        const command = process.env.TOBIIFREE_HELPER_COMMAND || process.execPath;
        const args = process.env.TOBIIFREE_HELPER_COMMAND ? [] : [helperPath, "--service", "--socket", this.socketPath];
        const env = process.env.TOBIIFREE_HELPER_COMMAND
            ? { ...process.env, TOBIIFREE_SERVICE_SOCKET: this.socketPath }
            : { ...process.env, ELECTRON_RUN_AS_NODE: "1", TOBIIFREE_SERVICE_SOCKET: this.socketPath };
        this.updateStatus({ state: "service_starting", message: "Запуск фоновой службы Tobii", deviceFound: false });
        const child = (0, child_process_1.spawn)(command, args, {
            env,
            detached: true,
            stdio: "ignore"
        });
        this.process = child;
        child.unref();
        child.on("error", (error) => {
            this.updateStatus({
                state: "service_unavailable",
                message: "Не удалось запустить службу Tobii",
                lastError: error.message,
                deviceFound: false
            });
            console.warn("[tobiifree-helper] failed to start service", error);
        });
        child.on("exit", (code, signal) => {
            if (this.destroyed)
                return;
            console.warn("[tobiifree-helper] service exited", { code, signal });
            if (!this.helperReady) {
                this.updateStatus({
                    state: "service_unavailable",
                    message: "Служба Tobii завершилась до подключения",
                    lastError: `exit ${code ?? signal ?? "unknown"}`,
                    deviceFound: false
                });
            }
        });
    }
    scheduleReconnect(reason) {
        if (this.destroyed || this.reconnectTimer)
            return;
        this.reconnectAttempt += 1;
        const delay = Math.min(SERVICE_RECONNECT_MAX_MS, 500 * this.reconnectAttempt);
        this.updateStatus({
            state: "reconnecting",
            message: "Переподключение к Tobii",
            reconnectAttempt: this.reconnectAttempt,
            lastError: reason,
            deviceFound: false
        });
        this.startService();
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = undefined;
            this.connectToService();
        }, delay);
    }
    onSocketData(data) {
        this.buffer += data;
        const lines = this.buffer.split(/\r?\n/);
        this.buffer = lines.pop() || "";
        for (const line of lines) {
            this.onLine(line.trim());
        }
    }
    onLine(line) {
        if (!line)
            return;
        if (!line.startsWith("{")) {
            if (line === "invalid")
                this.resetTarget();
            if (line.startsWith("gaze:"))
                this.onGaze(line.slice("gaze:".length));
            if (line.startsWith("error:"))
                console.warn("[tobiifree-helper]", line);
            return;
        }
        this.onJsonLine(line);
    }
    onJsonLine(line) {
        let message;
        try {
            message = JSON.parse(line);
        }
        catch {
            console.warn("[tobiifree-helper] invalid json", line);
            return;
        }
        if (message.type === "status") {
            const status = this.stripMessageType(message);
            this.updateStatus({ ...status, socketPath: this.socketPath });
            if (status.deviceFound && (status.state === "connected" || status.state === "tracking")) {
                this.maybeAutoApplySavedCalibration();
            }
            return;
        }
        if (message.type === "gaze") {
            this.updateStatus({ lastGazeAt: message.timestamp || Date.now(), deviceFound: true });
            this.onGaze(`${message.x},${message.y}`);
            return;
        }
        if (message.type === "invalid") {
            this.resetTarget();
            return;
        }
        if (message.type === "diagnostic") {
            if (message.level === "error")
                console.warn("[tobiifree-helper]", message.message, message.data);
            return;
        }
        if (message.type !== "response" || message.id === undefined)
            return;
        const pending = this.pending.get(message.id);
        if (!pending)
            return;
        this.pending.delete(message.id);
        clearTimeout(pending.timer);
        if (message.ok) {
            if (message.status)
                this.updateStatus({ ...this.stripMessageType(message.status), socketPath: this.socketPath });
            pending.resolve(message.blobBase64);
            return;
        }
        pending.reject(new Error(message.error || "TobiiFree helper command failed"));
    }
    sendCommand(command, payload = {}, timeoutMs = 10000) {
        return this.waitForHelperReady(timeoutMs).then(() => {
            if (!this.socket || this.socket.destroyed || !this.socket.writable) {
                return Promise.reject(new Error("Tobii service is not running"));
            }
            const id = this.requestId++;
            const message = JSON.stringify({ id, command, ...payload }) + "\n";
            return new Promise((resolve, reject) => {
                const timer = setTimeout(() => {
                    this.pending.delete(id);
                    reject(new Error(`Tobii service command timed out: ${command}`));
                }, timeoutMs);
                this.pending.set(id, { resolve, reject, timer });
                this.socket?.write(message, (error) => {
                    if (!error)
                        return;
                    this.pending.delete(id);
                    clearTimeout(timer);
                    reject(error);
                });
            });
        });
    }
    writeSocketCommand(payload) {
        if (!this.socket || this.socket.destroyed || !this.socket.writable)
            return;
        this.socket.write(`${JSON.stringify(payload)}\n`);
    }
    waitForHelperReady(timeoutMs) {
        if (this.helperReady)
            return Promise.resolve();
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.readyWaiters = this.readyWaiters.filter((waiter) => waiter.timer !== timer);
                reject(new Error("Tobii service is not ready. Check that Tobii service can start."));
            }, timeoutMs);
            this.readyWaiters.push({ resolve, reject, timer });
        });
    }
    resolveReadyWaiters() {
        for (const waiter of this.readyWaiters) {
            clearTimeout(waiter.timer);
            waiter.resolve();
        }
        this.readyWaiters = [];
    }
    rejectReadyWaiters(error) {
        for (const waiter of this.readyWaiters) {
            clearTimeout(waiter.timer);
            waiter.reject(error);
        }
        this.readyWaiters = [];
    }
    rejectPending(error) {
        for (const [, request] of this.pending) {
            clearTimeout(request.timer);
            request.reject(error);
        }
        this.pending.clear();
    }
    updateStatus(patch) {
        this.status = {
            ...this.status,
            ...patch,
            mode: patch.mode || "socket-service",
            socketPath: this.socketPath,
            updatedAt: Date.now()
        };
        this.emit("status", this.status);
    }
    stripMessageType(status) {
        const safeStatus = { ...status };
        delete safeStatus.type;
        return safeStatus;
    }
    maybeAutoApplySavedCalibration() {
        const now = Date.now();
        if (now - this.lastAutoApplyAt < 10000)
            return;
        this.lastAutoApplyAt = now;
        void this.applySavedCalibration().catch((error) => console.warn("[tobiifree-helper] could not auto-apply saved calibration", error));
    }
    onGaze(payload) {
        const [x, y] = payload.split(",").map(Number);
        if (!Number.isFinite(x) || !Number.isFinite(y)) {
            this.resetTarget();
            return;
        }
        const rawPoint = { x, y };
        this.rememberRecentGazePoint(rawPoint);
        const calibratedPoint = this.applySoftwareCalibration(rawPoint);
        const normalizedPoint = {
            x: this.clamp01(calibratedPoint.x),
            y: this.clamp01(calibratedPoint.y)
        };
        const point = this.toScreenPoint(normalizedPoint.x, normalizedPoint.y);
        this.emit("gaze", {
            x: point.x,
            y: point.y,
            valid: true,
            source: "tobii",
            timestamp: Date.now()
        });
        const index = this.bounds.findIndex((bound) => {
            return point.x >= bound.x && point.x <= bound.x + bound.width &&
                point.y >= bound.y && point.y <= bound.y + bound.height;
        });
        this.gazeSamples += 1;
        this.emitDebugState(rawPoint, normalizedPoint, point, index);
        if (this.gazeSamples === 1 || this.gazeSamples % 120 === 0) {
            console.warn("[tobiifree-helper] gaze sample", {
                raw: rawPoint,
                normalized: normalizedPoint,
                screen: point,
                bounds: this.bounds.length,
                index,
                softwareCalibration: this.softwareCalibration
            });
        }
        if (index < 0) {
            this.resetTarget();
            return;
        }
        this.enterTarget(index);
        this.clickIfReady(index);
    }
    toScreenPoint(x, y) {
        const display = electron_1.screen.getPrimaryDisplay();
        if (!this.displayLogged) {
            this.displayLogged = true;
            console.warn("[tobiifree-helper] display metrics", {
                bounds: display.bounds,
                workArea: display.workArea,
                scaleFactor: display.scaleFactor,
                screenRect: this.screenRect,
                extraOffset: { x: this.extraOffsetX, y: this.extraOffsetY }
            });
        }
        return {
            x: Math.round((this.screenRect.x + x * this.screenRect.width + this.extraOffsetX) * this.scaleFactor),
            y: Math.round((this.screenRect.y + y * this.screenRect.height + this.extraOffsetY) * this.scaleFactor)
        };
    }
    emitDebugState(raw, normalized, point, hitIndex) {
        const now = Date.now();
        if (!this.debugEnabled || now - this.lastDebugAt < 250)
            return;
        this.lastDebugAt = now;
        this.emit("debug", {
            raw,
            normalized,
            screen: point,
            screenRect: this.screenRect,
            boundsCount: this.bounds.length,
            hitIndex,
            softwareCalibration: !!this.softwareCalibration
        });
    }
    rememberRecentGazePoint(point) {
        this.recentGazePoints.push({ ...point, time: Date.now() });
        if (this.recentGazePoints.length > 90)
            this.recentGazePoints.shift();
    }
    rememberSoftwareCalibrationPoint(target) {
        const now = Date.now();
        const samples = this.recentGazePoints.filter((point) => now - point.time < 1200);
        if (samples.length === 0) {
            console.warn("[tobiifree-helper] no recent gaze samples for software calibration", { target });
            return;
        }
        const raw = samples.reduce((acc, point) => ({ x: acc.x + point.x, y: acc.y + point.y }), { x: 0, y: 0 });
        raw.x /= samples.length;
        raw.y /= samples.length;
        this.calibrationSamples.push({ raw, target });
        console.warn("[tobiifree-helper] software calibration point", { raw, target, samples: samples.length });
    }
    async saveSoftwareCalibration() {
        if (this.calibrationSamples.length < 2) {
            console.warn("[tobiifree-helper] not enough software calibration points", { count: this.calibrationSamples.length });
            return;
        }
        const calibration = this.fitSoftwareCalibration(this.calibrationSamples);
        this.softwareCalibration = calibration;
        await (0, promises_1.mkdir)(electron_1.app.getPath("userData"), { recursive: true });
        await (0, promises_1.writeFile)(this.softwareCalibrationPath, JSON.stringify(calibration, undefined, 2));
        console.warn("[tobiifree-helper] software calibration saved", calibration);
    }
    async loadSoftwareCalibration() {
        try {
            const calibration = JSON.parse(await (0, promises_1.readFile)(this.softwareCalibrationPath, "utf8"));
            if (calibration.version !== 2 || !calibration.x || !calibration.y || !calibration.samples) {
                console.warn("[tobiifree-helper] ignoring old software calibration", calibration);
                this.loadDefaultSoftwareCalibration();
                return;
            }
            this.softwareCalibration = calibration;
            console.warn("[tobiifree-helper] software calibration loaded", this.softwareCalibration);
        }
        catch (error) {
            if (error instanceof Error && "code" in error && error.code === "ENOENT") {
                this.loadDefaultSoftwareCalibration();
                return;
            }
            console.warn("[tobiifree-helper] could not load software calibration", error);
            this.loadDefaultSoftwareCalibration();
        }
    }
    loadDefaultSoftwareCalibration() {
        this.softwareCalibration = defaultSoftwareCalibration_1.defaultSoftwareCalibration;
        console.warn("[tobiifree-helper] default software calibration loaded", this.softwareCalibration);
    }
    fitSoftwareCalibration(samples) {
        return {
            version: 2,
            x: this.fitAxis(samples.map((sample) => ({ raw: sample.raw.x, target: sample.target.x }))),
            y: this.fitAxis(samples.map((sample) => ({ raw: sample.raw.y, target: sample.target.y }))),
            samples
        };
    }
    fitAxis(samples) {
        const rawMean = samples.reduce((sum, sample) => sum + sample.raw, 0) / samples.length;
        const targetMean = samples.reduce((sum, sample) => sum + sample.target, 0) / samples.length;
        const variance = samples.reduce((sum, sample) => sum + Math.pow(sample.raw - rawMean, 2), 0);
        if (variance === 0)
            return { a: 1, b: 0 };
        const covariance = samples.reduce((sum, sample) => sum + (sample.raw - rawMean) * (sample.target - targetMean), 0);
        const a = covariance / variance;
        return { a, b: targetMean - a * rawMean };
    }
    applySoftwareCalibration(point) {
        if (!this.softwareCalibration)
            return point;
        return {
            x: this.softwareCalibration.x.a * point.x + this.softwareCalibration.x.b,
            y: this.softwareCalibration.y.a * point.y + this.softwareCalibration.y.b
        };
    }
    clamp01(value) {
        return Math.max(0, Math.min(1, value));
    }
    enterTarget(index) {
        if (this.currentIndex === index)
            return;
        this.resetTarget();
        this.currentIndex = index;
        this.enteredAt = Date.now();
        this.clicked = false;
        console.warn("[tobiifree-helper] enter", { index });
        this.emit("enter", index);
    }
    clickIfReady(index) {
        if (this.clicked)
            return;
        if (Date.now() - this.enteredAt < this.timeout)
            return;
        this.clicked = true;
        console.warn("[tobiifree-helper] click", { index });
        this.emit("click", index, 1);
    }
    resetTarget(silent = false) {
        if (this.currentIndex === undefined)
            return;
        this.currentIndex = undefined;
        this.enteredAt = 0;
        this.clicked = false;
        if (!silent)
            this.emit("exit");
    }
}
exports.TobiiFreeTrackerProcess = TobiiFreeTrackerProcess;
//# sourceMappingURL=TobiiFreeTrackerProcess.js.map