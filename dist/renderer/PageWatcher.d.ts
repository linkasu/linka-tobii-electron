import type { EyeTargetKeyMapping, EyeTargetSettings } from "../types";
type IpcRendererLike = {
    on(channel: string, listener: (event: unknown, data: any) => void): void;
    off?(channel: string, listener: (event: unknown, data: any) => void): void;
    removeListener?(channel: string, listener: (event: unknown, data: any) => void): void;
    send(channel: string, data?: unknown): void;
};
export type PageWatcherOptions = {
    className?: string;
    ipcRenderer?: IpcRendererLike;
    getSettings?: () => EyeTargetSettings;
    getKeyMapping?: () => EyeTargetKeyMapping;
    distance?: (a: {
        x: number;
        y: number;
    }, b: {
        x: number;
        y: number;
    }) => number;
};
export declare class PageWatcher {
    static TIMEOUT: number;
    static EXIT_TIMEOUT: number;
    static instance?: PageWatcher;
    private readonly className;
    private readonly ipcRenderer;
    private readonly getSettings;
    private readonly getKeyMapping;
    private readonly distance;
    private readonly observer;
    private readonly onResize;
    private readonly onKeyDown;
    private readonly onEyeEnter;
    private readonly onEyeExit;
    private readonly onEyeClick;
    private lastElement?;
    private gamepadButtonsMap;
    private animationFrame?;
    private elements;
    constructor(options?: PageWatcherOptions);
    destroy(): void;
    watchElementsChange(force?: boolean): void;
    onKeyboard(code: string): boolean;
    clickWatch(el: Element, eye: boolean): void;
    enterWatch(el?: Element): void;
    exitWatch(): void;
    private joystickCycle;
    private isEyeDisabled;
    private isLocked;
    private findNear;
    private off;
}
export {};
