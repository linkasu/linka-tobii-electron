import { EventEmitter } from "events";
import { resolvePackageExtraResource } from "./resolvePackageExtraResource";
import type { EyeTrackerBound, EyeTrackerDebugState, EyeTrackerGazePoint, EyeTrackerProcess, TobiiStatus } from "./EyeTrackerProcess";
type EyeLogEvents = {
    enter: [index: number];
    exit: [];
    click: [index: number, count: number];
    debug: [state: EyeTrackerDebugState];
    gaze: [point: EyeTrackerGazePoint];
    status: [status: TobiiStatus];
};
type EyeLogEventName = keyof EyeLogEvents;
export declare class EyeLogTrackerProcess extends EventEmitter implements EyeTrackerProcess {
    private readonly tracker;
    private screenRect;
    private scaleFactor;
    private status;
    constructor(resolveExtraResource?: typeof resolvePackageExtraResource);
    on<K extends EyeLogEventName>(event: K, listener: (...args: EyeLogEvents[K]) => void): this;
    emit<K extends EyeLogEventName>(event: K, ...args: EyeLogEvents[K]): boolean;
    getStatus(): TobiiStatus;
    setBounds(bounds: EyeTrackerBound[]): void;
    setTimeout(value: number): void;
    setScaleFactor(value: number): void;
    setScreenRect(x: number, y: number, width: number, height: number): void;
    destroy(): void;
    private onRawGaze;
    private isInsideScreenRect;
    private updateStatus;
}
export {};
