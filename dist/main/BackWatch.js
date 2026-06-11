"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BackWatch = void 0;
const os_1 = require("os");
const electron_1 = require("electron");
const EyeLogTrackerProcess_1 = require("./EyeLogTrackerProcess");
const NativeTobiiTrackerProcess_1 = require("./NativeTobiiTrackerProcess");
const TobiiFreeTrackerProcess_1 = require("./TobiiFreeTrackerProcess");
class BackWatch {
    options;
    tobii = undefined;
    window;
    webContents;
    hid = "";
    multiplyScale = false;
    data = undefined;
    debugEnabled = false;
    boundsLogged = false;
    status = {
        state: "unsupported",
        mode: "unsupported",
        message: "Tobii недоступен на этой платформе",
        deviceFound: false,
        updatedAt: Date.now()
    };
    onEyeElements = (event, data) => {
        this.hid = data.id;
        this.data = data;
        this.processData();
    };
    onButtonTimeout = (event, value) => {
        this.tobii?.setTimeout(value);
    };
    onButtonMultiplyScale = (event, value) => {
        this.multiplyScale = value;
        this.processData();
    };
    onDebugSetEnabled = (event, value) => {
        this.debugEnabled = value;
        this.tobii?.setDebugEnabled?.(value);
    };
    onCalibrationStart = async () => {
        await this.requireCalibrationMethod("startCalibration")();
        return true;
    };
    onCalibrationAddPoint = async (event, point) => {
        if (!Number.isFinite(point?.x) || !Number.isFinite(point?.y)) {
            throw new Error("Некорректная точка калибровки");
        }
        await this.requireCalibrationMethod("addCalibrationPoint")(point.x, point.y);
        return true;
    };
    onCalibrationFinish = async () => {
        await this.requireCalibrationMethod("finishCalibration")();
        return true;
    };
    onCalibrationApplySaved = async () => {
        return await this.requireCalibrationMethod("applySavedCalibration")();
    };
    onStatus = (status) => {
        this.status = status;
        this.sendStatus();
    };
    onStatusGet = () => {
        return this.status;
    };
    onServiceRestart = async () => {
        const restartable = this.tobii;
        if (!restartable?.restartService)
            throw new Error("Перезапуск службы Tobii недоступен");
        restartable.restartService();
        return true;
    };
    onRendererReady = () => {
        this.sendStatus();
    };
    updateScreenMetrics = () => {
        if (!this.window || this.window.isDestroyed())
            return;
        const winBounds = this.window.getContentBounds();
        const m = this.multiplyScale ? electron_1.screen.getPrimaryDisplay().scaleFactor : 1;
        this.tobii?.setScaleFactor?.(m);
        this.tobii?.setScreenRect?.(winBounds.x, winBounds.y, winBounds.width, winBounds.height);
    };
    constructor(win, options = {}) {
        this.options = options;
        this.window = win;
        this.webContents = win.webContents;
        win.on("closed", () => this.destroy());
        win.on("move", this.updateScreenMetrics);
        win.on("resize", this.updateScreenMetrics);
        try {
            this.tobii = this.createTracker();
            this.tobii?.on("enter", (index) => this.onEnter(index));
            this.tobii?.on("exit", () => this.onExit());
            this.tobii?.on("click", (index, count) => this.onClick(index, count));
            this.tobii?.on("gaze", (point) => this.onGaze(point));
            this.status = this.tobii?.getStatus?.() || this.status;
            this.tobii?.on("status", this.onStatus);
            if (!electron_1.app.isPackaged) {
                this.tobii?.on("debug", (state) => {
                    if (this.debugEnabled)
                        this.window?.webContents.send("tobii:debug", state);
                });
            }
            void this.tobii?.initialize?.()
                .then(() => console.warn("[tobii] tracker initialized"))
                .catch((error) => console.warn("[tobii] tracker initialization failed", error));
            this.updateScreenMetrics();
            electron_1.ipcMain.on("eye-elements", this.onEyeElements);
            electron_1.ipcMain.on("button_timeout", this.onButtonTimeout);
            electron_1.ipcMain.on("button_multiply_scale", this.onButtonMultiplyScale);
            electron_1.ipcMain.on("tobii:debug:set-enabled", this.onDebugSetEnabled);
            electron_1.ipcMain.handle("tobii:calibration:start", this.onCalibrationStart);
            electron_1.ipcMain.handle("tobii:calibration:add-point", this.onCalibrationAddPoint);
            electron_1.ipcMain.handle("tobii:calibration:finish", this.onCalibrationFinish);
            electron_1.ipcMain.handle("tobii:calibration:apply-saved", this.onCalibrationApplySaved);
            electron_1.ipcMain.handle("tobii:status:get", this.onStatusGet);
            electron_1.ipcMain.handle("tobii:service:restart", this.onServiceRestart);
            this.webContents.on("did-finish-load", this.onRendererReady);
        }
        catch (error) {
            console.warn("[tobii] failed to start tracker", error);
            if (this.options.showStartupError !== false) {
                electron_1.dialog
                    .showErrorBox("Ошибка запуска обработчика айтрекера", "Для исправления проблемы установите Visual Studio 2012 (VC++ 11.0) с обновлением 4 или свяжитесь с Бакаидовым.");
            }
        }
    }
    createTracker() {
        if ((0, os_1.platform)() === "win32") {
            if (process.env.TOBII_NATIVE === "1") {
                try {
                    return new NativeTobiiTrackerProcess_1.NativeTobiiTrackerProcess();
                }
                catch (error) {
                    console.warn("[tobii] native Windows tracker unavailable, falling back to EyeLog", error);
                }
            }
            return new EyeLogTrackerProcess_1.EyeLogTrackerProcess(this.options.resolveExtraResource);
        }
        if ((0, os_1.platform)() === "darwin") {
            if (this.options.enableNativeMacTracker || process.env.TOBII_NATIVE === "1") {
                try {
                    return new NativeTobiiTrackerProcess_1.NativeTobiiTrackerProcess();
                }
                catch (error) {
                    console.warn("[tobii] native tracker unavailable, falling back to helper", error);
                }
            }
            return new TobiiFreeTrackerProcess_1.TobiiFreeTrackerProcess({
                resolveExtraResource: this.options.resolveExtraResource,
                socketName: this.options.socketName
            });
        }
        return undefined;
    }
    requireCalibrationMethod(method) {
        const fn = this.tobii?.[method];
        if (!fn)
            throw new Error("Калибровка Tobii доступна только в экспериментальном macOS-режиме");
        return fn.bind(this.tobii);
    }
    processData() {
        if (!this.window || this.window.isDestroyed() || !this.data)
            return;
        const winBounds = this.window.getContentBounds();
        if (!this.boundsLogged) {
            this.boundsLogged = true;
            const display = electron_1.screen.getPrimaryDisplay();
            console.warn("[tobiifree-helper] window metrics", {
                windowBounds: this.window.getBounds(),
                contentBounds: winBounds,
                displayBounds: display.bounds,
                displayWorkArea: display.workArea,
                displayScaleFactor: display.scaleFactor,
                firstDomBound: this.data.bounds[0]
            });
        }
        const m = this.multiplyScale ? (electron_1.screen.getPrimaryDisplay().scaleFactor) : 1;
        this.tobii?.setScaleFactor?.(m);
        this.tobii?.setScreenRect?.(winBounds.x, winBounds.y, winBounds.width, winBounds.height);
        const bounds = this.data.bounds.map((el) => {
            const [x, y, width, height] = [el.x + winBounds.x, el.y + winBounds.y, el.width, el.height].map(el => Math.round(el * m));
            return { x, y, width, height };
        });
        if (bounds.length > 0) {
            this.tobii?.setBounds(bounds);
        }
    }
    destroy() {
        electron_1.ipcMain.off("eye-elements", this.onEyeElements);
        electron_1.ipcMain.off("button_timeout", this.onButtonTimeout);
        electron_1.ipcMain.off("button_multiply_scale", this.onButtonMultiplyScale);
        electron_1.ipcMain.off("tobii:debug:set-enabled", this.onDebugSetEnabled);
        electron_1.ipcMain.removeHandler("tobii:calibration:start");
        electron_1.ipcMain.removeHandler("tobii:calibration:add-point");
        electron_1.ipcMain.removeHandler("tobii:calibration:finish");
        electron_1.ipcMain.removeHandler("tobii:calibration:apply-saved");
        electron_1.ipcMain.removeHandler("tobii:status:get");
        electron_1.ipcMain.removeHandler("tobii:service:restart");
        if (this.window && !this.window.isDestroyed()) {
            this.window.off("move", this.updateScreenMetrics);
            this.window.off("resize", this.updateScreenMetrics);
        }
        if (this.webContents && !this.webContents.isDestroyed()) {
            this.webContents.off("did-finish-load", this.onRendererReady);
        }
        this.tobii?.destroy();
        this.tobii = undefined;
        this.webContents = undefined;
        this.window = undefined;
    }
    onClick(index, count) {
        if (!this.window?.isFocused())
            return;
        this.window?.webContents.send("eye-click", {
            elementIndex: index,
            count,
            id: this.hid
        });
    }
    onExit() {
        this.window?.webContents.send("eye-exit", {
            id: this.hid
        });
    }
    onEnter(index) {
        this.window?.webContents.send("eye-enter", {
            elementIndex: index,
            id: this.hid
        });
    }
    onGaze(point) {
        if (!this.window || this.window.isDestroyed())
            return;
        const bounds = this.window.getContentBounds();
        this.window.webContents.send("tobii:gaze", {
            ...point,
            x: point.x - bounds.x,
            y: point.y - bounds.y
        });
    }
    sendStatus() {
        if (!this.window || this.window.isDestroyed())
            return;
        this.window.webContents.send("tobii:status", this.status);
    }
}
exports.BackWatch = BackWatch;
//# sourceMappingURL=BackWatch.js.map