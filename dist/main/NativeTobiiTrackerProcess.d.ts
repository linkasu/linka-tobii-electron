import { EventEmitter } from "events";
import type { EyeTrackerBound, EyeTrackerDebugState, EyeTrackerGazePoint, EyeTrackerProcess, TobiiStatus } from "./EyeTrackerProcess";
type NativeTobiiRect = {
    x: number;
    y: number;
    width: number;
    height: number;
};
type NativeTobiiEvent = {
    type: "ready";
} | {
    type: "enter";
    index: number;
} | {
    type: "exit";
} | {
    type: "click";
    index: number;
    count: number;
} | {
    type: "debug";
    state: EyeTrackerDebugState;
} | {
    type: "error";
    code: string;
    message: string;
};
type NativeTobiiTracker = {
    start(): Promise<void>;
    stop(): void;
    destroy(): void;
    setBounds(bounds: NativeTobiiRect[]): void;
    setTimeout(valueMs: number): void;
    setScaleFactor(value: number): void;
    setScreenRect(x: number, y: number, width: number, height: number): void;
    setDebugEnabled(value: boolean): void;
    startCalibration(): Promise<void>;
    addCalibrationPoint(x: number, y: number): Promise<void>;
    finishCalibration(): Promise<Buffer>;
    applyCalibration(blob: Buffer): Promise<void>;
};
type NativeTobiiModule = {
    NativeTobiiTracker: new (listener: (event: NativeTobiiEvent) => void) => NativeTobiiTracker;
    isRuntimeSupported?: () => boolean;
    getRuntimeSupportReason?: () => string | undefined;
};
type NativeTobiiEvents = {
    enter: [index: number];
    exit: [];
    click: [index: number, count: number];
    debug: [state: EyeTrackerDebugState];
    gaze: [point: EyeTrackerGazePoint];
    status: [status: TobiiStatus];
};
type NativeTobiiEventName = keyof NativeTobiiEvents;
export declare class NativeTobiiTrackerProcess extends EventEmitter implements EyeTrackerProcess {
    private readonly tracker;
    private readonly calibrationPath;
    private status;
    constructor(nativeModule?: NativeTobiiModule);
    on<K extends NativeTobiiEventName>(event: K, listener: (...args: NativeTobiiEvents[K]) => void): this;
    emit<K extends NativeTobiiEventName>(event: K, ...args: NativeTobiiEvents[K]): boolean;
    initialize(): Promise<void>;
    getStatus(): TobiiStatus;
    setBounds(bounds: EyeTrackerBound[]): void;
    setTimeout(value: number): void;
    setScaleFactor(value: number): void;
    setScreenRect(x: number, y: number, width: number, height: number): void;
    setDebugEnabled(value: boolean): void;
    startCalibration(): Promise<void>;
    addCalibrationPoint(x: number, y: number): Promise<void>;
    finishCalibration(): Promise<void>;
    applySavedCalibration(): Promise<boolean>;
    destroy(): void;
    private onNativeEvent;
    private updateStatus;
}
export {};
