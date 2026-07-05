import { EventEmitter } from "events";
import { TobiiProcess } from "eyelog/dist/TobiiProcess";
import { Bound } from "eyelog/dist/bound";
import { resolvePackageExtraResource } from "./resolvePackageExtraResource";
import type { EyeTrackerBound, EyeTrackerDebugState, EyeTrackerGazePoint, EyeTrackerProcess, TobiiStatus } from "./EyeTrackerProcess";

type EyeLogProcess = TobiiProcess & {
  on(event: "gaze", listener: (x: number, y: number, timestamp: number) => void): EyeLogProcess;
  on(event: "stderr", listener: (data: string) => void): EyeLogProcess;
  on(event: "error", listener: (error: Error) => void): EyeLogProcess;
  on(event: "processExit", listener: (code: number | null, signal: NodeJS.Signals | null) => void): EyeLogProcess;
  destroy?: () => void;
};

type EyeLogEvents = {
  enter: [index: number];
  exit: [];
  click: [index: number, count: number];
  debug: [state: EyeTrackerDebugState];
  gaze: [point: EyeTrackerGazePoint];
  status: [status: TobiiStatus];
};

type EyeLogEventName = keyof EyeLogEvents;

export class EyeLogTrackerProcess extends EventEmitter implements EyeTrackerProcess {
  private readonly tracker: EyeLogProcess;
  private screenRect = { x: 0, y: 0, width: 1, height: 1 };
  private scaleFactor = 1;
  private status: TobiiStatus = {
    state: "connecting",
    mode: "direct",
    message: "Запуск EyeLog",
    deviceFound: false,
    updatedAt: Date.now()
  };

  constructor (resolveExtraResource = resolvePackageExtraResource) {
    super();
    this.tracker = new TobiiProcess(resolveExtraResource("bin", "EyeLog.exe")) as EyeLogProcess;
    this.tracker.on("enter", (index) => this.emit("enter", index));
    this.tracker.on("exit", () => this.emit("exit"));
    this.tracker.on("click", (index, count) => this.emit("click", index, count));
    this.tracker.on("gaze", (x, y) => this.onRawGaze(x, y));
    this.tracker.on("stderr", (data) => {
      const message = data.trim();
      if (message) console.warn("[eyelog]", message);
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

  on<K extends EyeLogEventName> (event: K, listener: (...args: EyeLogEvents[K]) => void): this {
    return super.on(event, listener);
  }

  emit<K extends EyeLogEventName> (event: K, ...args: EyeLogEvents[K]): boolean {
    return super.emit(event, ...args);
  }

  getStatus () {
    return this.status;
  }

  setBounds (bounds: EyeTrackerBound[]) {
    this.tracker.setBounds(bounds.map(({ x, y, width, height }) => new Bound(x, y, width, height)));
  }

  setTimeout (value: number) {
    this.tracker.setTimeout(value);
  }

  setScaleFactor (value: number) {
    this.scaleFactor = Number.isFinite(value) && value > 0 ? value : 1;
  }

  setScreenRect (x: number, y: number, width: number, height: number) {
    this.screenRect = { x, y, width, height };
  }

  destroy () {
    this.tracker.destroy?.();
  }

  private onRawGaze (x: number, y: number) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    const now = Date.now();
    const screenPoint = {
      x: x / this.scaleFactor,
      y: y / this.scaleFactor
    };
    const point: EyeTrackerGazePoint = {
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

  private isInsideScreenRect (x: number, y: number) {
    return x >= this.screenRect.x && x <= this.screenRect.x + this.screenRect.width &&
      y >= this.screenRect.y && y <= this.screenRect.y + this.screenRect.height;
  }

  private updateStatus (patch: Partial<TobiiStatus>) {
    this.status = {
      ...this.status,
      ...patch,
      updatedAt: Date.now()
    };
    this.emit("status", this.status);
  }
}
