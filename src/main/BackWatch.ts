import { platform } from "os";
import { app, BrowserWindow, dialog, ipcMain, IpcMainEvent, IpcMainInvokeEvent, screen, WebContents } from "electron";
import type { PageElementsState } from "../types";
import type { EyeTrackerBound, EyeTrackerDebugState, EyeTrackerGazePoint, EyeTrackerProcess, TobiiCoordinateScaleMode, TobiiDiagnosticsSnapshot, TobiiStatus } from "./EyeTrackerProcess";
import { EyeLogTrackerProcess } from "./EyeLogTrackerProcess";
import { NativeTobiiTrackerProcess } from "./NativeTobiiTrackerProcess";
import { TobiiFreeTrackerProcess } from "./TobiiFreeTrackerProcess";

export type BackWatchOptions = {
  resolveExtraResource?: (...segments: string[]) => string;
  socketName?: string;
  enableNativeMacTracker?: boolean;
  showStartupError?: boolean;
};

export class BackWatch {
  private readonly options: BackWatchOptions;
  tobii?: EyeTrackerProcess = undefined;
  window?: BrowserWindow;
  private webContents?: WebContents;
  hid = "";
  multiplyScale = false;
  data?: PageElementsState = undefined;
  private debugEnabled = false;
  private boundsLogged = false;
  private coordinateScaleMode: TobiiCoordinateScaleMode = "auto";
  private appliedScaleFactor = 1;
  private recentTrackerDebug: EyeTrackerDebugState[] = [];
  private recentGaze: TobiiDiagnosticsSnapshot["recentGaze"] = [];
  private status: TobiiStatus = {
    state: "unsupported",
    mode: "unsupported",
    message: "Tobii недоступен на этой платформе",
    deviceFound: false,
    updatedAt: Date.now()
  };
  private readonly onEyeElements = (event: IpcMainEvent, data: PageElementsState) => {
    this.hid = data.id;
    this.data = data;
    this.processData();
  };

  private readonly onButtonTimeout = (event: IpcMainEvent, value: number) => {
    this.tobii?.setTimeout(value);
  };

  private readonly onButtonMultiplyScale = (event: IpcMainEvent, value: boolean) => {
    this.multiplyScale = value;
    this.processData();
  };

  private readonly onDebugSetEnabled = (event: IpcMainEvent, value: boolean) => {
    this.debugEnabled = value;
    this.tobii?.setDebugEnabled?.(value);
  };

  private readonly onDiagnosticsGet = () => {
    return this.getDiagnostics();
  };

  private readonly onDiagnosticsSetScaleMode = (event: IpcMainInvokeEvent, mode: TobiiCoordinateScaleMode) => {
    if (!["auto", "one", "display", "inverse-display"].includes(mode)) {
      throw new Error("Некорректный режим масштаба Tobii");
    }
    this.coordinateScaleMode = mode;
    this.updateScreenMetrics();
    this.processData();
    return this.getDiagnostics();
  };

  private readonly onCalibrationStart = async () => {
    await this.requireCalibrationMethod("startCalibration")();
    return true;
  };

  private readonly onCalibrationAddPoint = async (event: IpcMainInvokeEvent, point: { x: number, y: number }) => {
    if (!Number.isFinite(point?.x) || !Number.isFinite(point?.y)) {
      throw new Error("Некорректная точка калибровки");
    }
    await this.requireCalibrationMethod("addCalibrationPoint")(point.x, point.y);
    return true;
  };

  private readonly onCalibrationFinish = async () => {
    await this.requireCalibrationMethod("finishCalibration")();
    return true;
  };

  private readonly onCalibrationApplySaved = async () => {
    return await this.requireCalibrationMethod("applySavedCalibration")();
  };

  private readonly onStatus = (status: TobiiStatus) => {
    this.status = status;
    this.sendStatus();
  };

  private readonly onStatusGet = () => {
    return this.status;
  };

  private readonly onServiceRestart = async () => {
    const restartable = this.tobii as EyeTrackerProcess & { restartService?: () => void } | undefined;
    if (!restartable?.restartService) throw new Error("Перезапуск службы Tobii недоступен");
    restartable.restartService();
    return true;
  };

  private readonly onRendererReady = () => {
    this.sendStatus();
  };

  private readonly updateScreenMetrics = () => {
    if (!this.window || this.window.isDestroyed()) return;
    const winBounds = this.window.getContentBounds();
    const m = this.getAppliedScaleFactor(winBounds);
    this.tobii?.setScreenRect?.(winBounds.x, winBounds.y, winBounds.width, winBounds.height);
    this.tobii?.setScaleFactor?.(m);
  };

  constructor (win: BrowserWindow, options: BackWatchOptions = {}) {
    this.options = options;
    this.window = win;
    this.webContents = win.webContents;
    win.on("closed", () => this.destroy());
    win.on("move", this.updateScreenMetrics);
    win.on("resize", this.updateScreenMetrics);
    try {
      this.tobii = this.createTracker();
      this.tobii?.on("enter", (index: number) => this.onEnter(index));
      this.tobii?.on("exit", () => this.onExit());
      this.tobii?.on("click", (index, count) => this.onClick(index, count));
      this.tobii?.on("gaze", (point) => this.onGaze(point));
      this.tobii?.on("debug", (state) => this.onTrackerDebug(state));
      this.status = this.tobii?.getStatus?.() || this.status;
      this.tobii?.on("status", this.onStatus);
      void this.tobii?.initialize?.()
        .then(() => console.warn("[tobii] tracker initialized"))
        .catch((error) => console.warn("[tobii] tracker initialization failed", error));
      this.updateScreenMetrics();
      ipcMain.on("eye-elements", this.onEyeElements);
      ipcMain.on("button_timeout", this.onButtonTimeout);
      ipcMain.on("button_multiply_scale", this.onButtonMultiplyScale);
      ipcMain.on("tobii:debug:set-enabled", this.onDebugSetEnabled);
      ipcMain.handle("tobii:diagnostics:get", this.onDiagnosticsGet);
      ipcMain.handle("tobii:diagnostics:set-scale-mode", this.onDiagnosticsSetScaleMode);
      ipcMain.handle("tobii:calibration:start", this.onCalibrationStart);
      ipcMain.handle("tobii:calibration:add-point", this.onCalibrationAddPoint);
      ipcMain.handle("tobii:calibration:finish", this.onCalibrationFinish);
      ipcMain.handle("tobii:calibration:apply-saved", this.onCalibrationApplySaved);
      ipcMain.handle("tobii:status:get", this.onStatusGet);
      ipcMain.handle("tobii:service:restart", this.onServiceRestart);
      this.webContents.on("did-finish-load", this.onRendererReady);
    } catch (error) {
      console.warn("[tobii] failed to start tracker", error);
      if (this.options.showStartupError !== false) {
        dialog
          .showErrorBox("Ошибка запуска обработчика айтрекера", "Для исправления проблемы установите Visual Studio 2012 (VC++ 11.0) с обновлением 4 или свяжитесь с Бакаидовым.");
      }
    }
  }

  private createTracker (): EyeTrackerProcess | undefined {
    if (platform() === "win32") {
      if (process.env.TOBII_NATIVE === "1") {
        try {
          return new NativeTobiiTrackerProcess();
        } catch (error) {
          console.warn("[tobii] native Windows tracker unavailable, falling back to EyeLog", error);
        }
      }
      return new EyeLogTrackerProcess(this.options.resolveExtraResource);
    }
    if (platform() === "darwin") {
      if (this.options.enableNativeMacTracker || process.env.TOBII_NATIVE === "1") {
        try {
          return new NativeTobiiTrackerProcess();
        } catch (error) {
          console.warn("[tobii] native tracker unavailable, falling back to helper", error);
        }
      }
      return new TobiiFreeTrackerProcess({
        resolveExtraResource: this.options.resolveExtraResource,
        socketName: this.options.socketName
      });
    }
    return undefined;
  }

  private requireCalibrationMethod<K extends "startCalibration" | "addCalibrationPoint" | "finishCalibration" | "applySavedCalibration"> (method: K): NonNullable<EyeTrackerProcess[K]> {
    const fn = this.tobii?.[method];
    if (!fn) throw new Error("Калибровка Tobii доступна только в экспериментальном macOS-режиме");
    return fn.bind(this.tobii) as NonNullable<EyeTrackerProcess[K]>;
  }

  private rememberTrackerDebug (state: EyeTrackerDebugState) {
    this.recentTrackerDebug = [...this.recentTrackerDebug.slice(-119), state];
  }

  private onTrackerDebug (state: EyeTrackerDebugState) {
    this.rememberTrackerDebug(state);
    if (this.debugEnabled || !app.isPackaged) this.window?.webContents.send("tobii:debug", state);
  }

  private getDisplayForBounds (bounds = this.window?.getContentBounds()) {
    if (!bounds) return screen.getPrimaryDisplay();
    return screen.getDisplayMatching(bounds);
  }

  private getAppliedScaleFactor (bounds = this.window?.getContentBounds()) {
    const displayScaleFactor = this.getDisplayForBounds(bounds).scaleFactor || 1;
    if (this.coordinateScaleMode === "one") this.appliedScaleFactor = 1;
    else if (this.coordinateScaleMode === "display") this.appliedScaleFactor = displayScaleFactor;
    else if (this.coordinateScaleMode === "inverse-display") this.appliedScaleFactor = displayScaleFactor > 0 ? 1 / displayScaleFactor : 1;
    else if (platform() === "win32" && this.status.mode === "direct") this.appliedScaleFactor = displayScaleFactor;
    else this.appliedScaleFactor = this.multiplyScale ? displayScaleFactor : 1;
    return this.appliedScaleFactor;
  }

  private getDiagnostics (): TobiiDiagnosticsSnapshot {
    const contentBounds = this.window && !this.window.isDestroyed() ? this.window.getContentBounds() : undefined;
    const display = this.getDisplayForBounds(contentBounds);
    const windowBounds = this.window && !this.window.isDestroyed() ? this.window.getBounds() : undefined;
    return {
      status: this.status,
      coordinateScaleMode: this.coordinateScaleMode,
      appliedScaleFactor: this.appliedScaleFactor,
      window: this.window && !this.window.isDestroyed() && windowBounds && contentBounds
        ? { focused: this.window.isFocused(), bounds: windowBounds, contentBounds }
        : undefined,
      display: {
        bounds: display.bounds,
        workArea: display.workArea,
        scaleFactor: display.scaleFactor
      },
      recentTrackerDebug: this.recentTrackerDebug,
      recentGaze: this.recentGaze
    };
  }

  private processData () {
    if (!this.window || this.window.isDestroyed() || !this.data) return;
    const winBounds = this.window.getContentBounds();
    if (!this.boundsLogged) {
      this.boundsLogged = true;
      const display = screen.getPrimaryDisplay();
      console.warn("[tobiifree-helper] window metrics", {
        windowBounds: this.window.getBounds(),
        contentBounds: winBounds,
        displayBounds: display.bounds,
        displayWorkArea: display.workArea,
        displayScaleFactor: display.scaleFactor,
        firstDomBound: this.data.bounds[0]
      });
    }

    const m = this.getAppliedScaleFactor(winBounds);
    this.tobii?.setScaleFactor?.(m);
    this.tobii?.setScreenRect?.(winBounds.x, winBounds.y, winBounds.width, winBounds.height);

    const bounds: EyeTrackerBound[] = this.data.bounds.map((el: DOMRect) => {
      const [x, y, width, height] = [el.x + winBounds.x, el.y + winBounds.y, el.width, el.height].map(el => Math.round(el * m));
      return { x, y, width, height };
    });
    if (bounds.length > 0) {
      this.tobii?.setBounds(bounds);
    }
  }

  private destroy () {
    ipcMain.off("eye-elements", this.onEyeElements);
    ipcMain.off("button_timeout", this.onButtonTimeout);
    ipcMain.off("button_multiply_scale", this.onButtonMultiplyScale);
    ipcMain.off("tobii:debug:set-enabled", this.onDebugSetEnabled);
    ipcMain.removeHandler("tobii:diagnostics:get");
    ipcMain.removeHandler("tobii:diagnostics:set-scale-mode");
    ipcMain.removeHandler("tobii:calibration:start");
    ipcMain.removeHandler("tobii:calibration:add-point");
    ipcMain.removeHandler("tobii:calibration:finish");
    ipcMain.removeHandler("tobii:calibration:apply-saved");
    ipcMain.removeHandler("tobii:status:get");
    ipcMain.removeHandler("tobii:service:restart");
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

  onClick (index: number, count: number) {
    if (!this.window?.isFocused()) return;
    this.window?.webContents.send("eye-click", {
      elementIndex: index,
      count,
      id: this.hid
    });
  }

  onExit () {
    this.window?.webContents.send("eye-exit", {
      id: this.hid
    });
  }

  onEnter (index: number) {
    this.window?.webContents.send("eye-enter", {
      elementIndex: index,
      id: this.hid
    });
  }

  onGaze (point: EyeTrackerGazePoint) {
    if (!this.window || this.window.isDestroyed()) return;
    const bounds = this.window.getContentBounds();
    const displayScaleFactor = this.getDisplayForBounds(bounds).scaleFactor || 1;
    const clientPoint = {
      ...point,
      x: point.x - bounds.x,
      y: point.y - bounds.y
    };
    this.recentGaze = [...this.recentGaze.slice(-119), {
      at: Date.now(),
      screen: point,
      client: clientPoint,
      contentBounds: bounds,
      displayScaleFactor
    }];
    this.window.webContents.send("tobii:gaze", clientPoint);
  }

  private sendStatus () {
    if (!this.window || this.window.isDestroyed()) return;
    this.window.webContents.send("tobii:status", this.status);
  }
}
