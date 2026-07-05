export interface EyeTrackerBound {
    x: number;
    y: number;
    width: number;
    height: number;
}
export interface EyeTrackerDebugState {
    raw: {
        x: number;
        y: number;
    };
    normalized: {
        x: number;
        y: number;
    };
    screen: {
        x: number;
        y: number;
    };
    screenRect: {
        x: number;
        y: number;
        width: number;
        height: number;
    };
    boundsCount: number;
    hitIndex: number;
    softwareCalibration: boolean;
    scaleFactor?: number;
    at?: number;
}
export interface EyeTrackerGazePoint {
    x: number;
    y: number;
    valid: boolean;
    source: "tobii";
    timestamp: number;
}
export type TobiiStatusState = "unsupported" | "service_starting" | "service_unavailable" | "connecting" | "waiting_device" | "connected" | "tracking" | "reconnecting" | "error";
export interface TobiiStatus {
    state: TobiiStatusState;
    mode: "socket-service" | "direct" | "native" | "unsupported";
    message: string;
    socketPath?: string;
    servicePid?: number;
    deviceFound: boolean;
    lastGazeAt?: number;
    lastError?: string;
    reconnectAttempt?: number;
    updatedAt: number;
}
export interface EyeTrackerProcess {
    on(event: "enter", listener: (index: number) => void): this;
    on(event: "exit", listener: () => void): this;
    on(event: "click", listener: (index: number, count: number) => void): this;
    on(event: "debug", listener: (state: EyeTrackerDebugState) => void): this;
    on(event: "gaze", listener: (point: EyeTrackerGazePoint) => void): this;
    on(event: "status", listener: (status: TobiiStatus) => void): this;
    getStatus?(): TobiiStatus;
    setBounds(bounds: EyeTrackerBound[]): void;
    setTimeout(value: number): void;
    setScaleFactor?(value: number): void;
    setScreenRect?(x: number, y: number, width: number, height: number): void;
    setDebugEnabled?(value: boolean): void;
    initialize?(): Promise<void>;
    startCalibration?(): Promise<void>;
    addCalibrationPoint?(x: number, y: number): Promise<void>;
    finishCalibration?(): Promise<void>;
    applySavedCalibration?(): Promise<boolean>;
    destroy(): void;
}
export type TobiiCoordinateScaleMode = "auto" | "one" | "display" | "inverse-display";
export interface TobiiDiagnosticsSnapshot {
    status: TobiiStatus;
    coordinateScaleMode: TobiiCoordinateScaleMode;
    appliedScaleFactor: number;
    window?: {
        focused: boolean;
        bounds: {
            x: number;
            y: number;
            width: number;
            height: number;
        };
        contentBounds: {
            x: number;
            y: number;
            width: number;
            height: number;
        };
    };
    display?: {
        bounds: {
            x: number;
            y: number;
            width: number;
            height: number;
        };
        workArea: {
            x: number;
            y: number;
            width: number;
            height: number;
        };
        scaleFactor: number;
    };
    recentTrackerDebug: EyeTrackerDebugState[];
    recentGaze: Array<{
        at: number;
        screen: EyeTrackerGazePoint;
        client: EyeTrackerGazePoint;
        contentBounds: {
            x: number;
            y: number;
            width: number;
            height: number;
        };
        displayScaleFactor: number;
    }>;
}
