import { ipcRenderer as electronIpcRenderer } from "electron";
import { v4 as uuid } from "uuid";
import type { BrowserElementsState, EyeTargetAction, EyeTargetKeyMapping, EyeTargetSettings } from "../types";

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
  distance?: (a: { x: number, y: number }, b: { x: number, y: number }) => number;
};

const defaultSettings: EyeTargetSettings = {
  timeout: 1000,
  enabled: true,
  eyeActivation: true,
  eyeSelect: true,
  keyboardActivation: false,
  joystickActivation: false
};

const defaultDistance = (a: { x: number, y: number }, b: { x: number, y: number }) => {
  return Math.hypot(a.x - b.x, a.y - b.y);
};

export class PageWatcher {
  static TIMEOUT = defaultSettings.timeout;
  static EXIT_TIMEOUT = 150;
  static instance?: PageWatcher;

  private readonly className: string;
  private readonly ipcRenderer: IpcRendererLike;
  private readonly getSettings: () => EyeTargetSettings;
  private readonly getKeyMapping: () => EyeTargetKeyMapping;
  private readonly distance: (a: { x: number, y: number }, b: { x: number, y: number }) => number;
  private readonly observer: MutationObserver;
  private readonly onResize = () => this.watchElementsChange();
  private readonly onKeyDown = (event: KeyboardEvent) => {
    if (event.target instanceof HTMLInputElement) return;
    if (this.onKeyboard(event.code)) {
      event.preventDefault();
      return false;
    }
    return undefined;
  };
  private readonly onEyeEnter = (_event: unknown, data: { id: string, elementIndex: number }) => {
    if (data.id !== this.elements.id) return;
    const element = this.elements.elements[data.elementIndex];
    this.enterWatch(element);
  };
  private readonly onEyeExit = (_event: unknown, data?: { id: string }) => {
    if (data?.id !== this.elements.id) return;
    this.exitWatch();
  };
  private readonly onEyeClick = (_event: unknown, data?: { id: string, elementIndex: number, count: number }) => {
    if (data?.id !== this.elements.id) return;
    const element = this.elements.elements[data.elementIndex];
    if (data.count > 1) return;
    if (element !== undefined) this.clickWatch(element, true);
  };

  private lastElement?: Element;
  private gamepadButtonsMap = new Map<string, boolean[]>();
  private animationFrame?: number;
  private elements: BrowserElementsState = {
    id: "",
    elements: [],
    bounds: []
  };

  constructor (options: PageWatcherOptions = {}) {
    PageWatcher.instance = this;
    this.className = options.className || "eye";
    this.ipcRenderer = options.ipcRenderer || electronIpcRenderer;
    this.getSettings = options.getSettings || (() => defaultSettings);
    this.getKeyMapping = options.getKeyMapping || (() => ({}));
    this.distance = options.distance || defaultDistance;

    this.watchElementsChange();
    window.addEventListener("resize", this.onResize);
    window.addEventListener("keydown", this.onKeyDown);
    this.observer = new MutationObserver(() => this.watchElementsChange());
    this.observer.observe(document, {
      childList: true,
      subtree: true
    });

    this.ipcRenderer.on("eye-enter", this.onEyeEnter);
    this.ipcRenderer.on("eye-exit", this.onEyeExit);
    this.ipcRenderer.on("eye-click", this.onEyeClick);
    this.joystickCycle();
  }

  destroy () {
    window.removeEventListener("resize", this.onResize);
    window.removeEventListener("keydown", this.onKeyDown);
    this.observer.disconnect();
    if (this.animationFrame !== undefined) cancelAnimationFrame(this.animationFrame);
    this.off("eye-enter", this.onEyeEnter);
    this.off("eye-exit", this.onEyeExit);
    this.off("eye-click", this.onEyeClick);
    if (PageWatcher.instance === this) PageWatcher.instance = undefined;
  }

  watchElementsChange (force = false) {
    const eyes = [...document.getElementsByClassName(this.className)];
    const bounds = eyes.map((el) => el.getBoundingClientRect());
    if (!force) {
      const equals = bounds.length === this.elements.bounds.length && !bounds.map((b, index) => {
        const a = this.elements.bounds[index];
        return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
      }).includes(false);
      if (equals) return;
    }
    this.elements = {
      elements: eyes,
      bounds,
      id: uuid()
    };
    this.ipcRenderer.send("eye-elements", JSON.parse(JSON.stringify(this.elements)));
  }

  onKeyboard (code: string) {
    const settings = this.getSettings();
    const joy = code.startsWith("joy");
    if ((!joy && !settings.keyboardActivation) || (joy && !settings.joystickActivation)) return false;

    const elements = document.getElementsByClassName(this.className);
    const map = this.getKeyMapping();
    let action: EyeTargetAction | null = null;
    for (const key in map) {
      const candidate = key as EyeTargetAction;
      const mappedKeys = map[candidate] || [];
      if (mappedKeys.includes(code)) {
        action = candidate;
        break;
      }
    }
    if (action === null) return false;
    if (this.lastElement?.getBoundingClientRect().width === 0) this.lastElement = undefined;
    if (!this.lastElement && elements[0]) {
      this.lastElement = elements[0];
      this.lastElement.dispatchEvent(new CustomEvent("eye-enter", { detail: {} }));
      return true;
    }
    if (!this.lastElement) return true;

    if (action !== "enter") {
      if (!settings.enabled) return false;
      const next = this.findNear(elements, action);
      if (!next) return true;
      this.lastElement.dispatchEvent(new CustomEvent("eye-exit", { detail: {} }));
      this.lastElement = next;
      this.lastElement.dispatchEvent(new CustomEvent("eye-enter", { detail: {} }));
    } else {
      this.clickWatch(this.lastElement, false);
    }
    return true;
  }

  clickWatch (el: Element, eye: boolean) {
    const settings = this.getSettings();
    if (eye && this.isEyeDisabled(el)) return;
    if (!el.classList.contains("lock")) {
      if (eye && !settings.eyeActivation) return;
      if (!eye && !settings.keyboardActivation) return;
    }
    el.dispatchEvent(new CustomEvent("click", { detail: {} }));
  }

  enterWatch (el?: Element) {
    const settings = this.getSettings();
    if (!el) return;
    if (this.isEyeDisabled(el)) return;
    if (!settings.eyeSelect && !this.isLocked(el)) return;
    this.lastElement = el;
    el.dispatchEvent(new CustomEvent("eye-enter", { detail: { eye: true } }));
  }

  exitWatch () {
    const settings = this.getSettings();
    if (!settings.eyeSelect && !this.isLocked(this.lastElement)) return;
    if (this.lastElement && this.isEyeDisabled(this.lastElement)) return;
    this.lastElement?.dispatchEvent(new CustomEvent("eye-exit", { detail: { eye: true } }));
    this.lastElement = undefined;
  }

  private joystickCycle () {
    const gamepads = navigator.getGamepads();
    for (const gamepad of gamepads) {
      if (!gamepad) continue;
      const buttons = gamepad.buttons.map(({ value }) => !!value);
      const lasts = this.gamepadButtonsMap.get(gamepad.id);
      if (lasts) {
        for (let index = 0; index < buttons.length; index++) {
          const pressed = buttons[index];
          const last = lasts[index];
          if (!last && pressed) this.onKeyboard(`joy${index}`);
        }
      }
      this.gamepadButtonsMap.set(gamepad.id, buttons);
    }
    this.animationFrame = requestAnimationFrame(() => this.joystickCycle());
  }

  private isEyeDisabled (el?: Element): boolean {
    if (!el) return false;
    return (el as HTMLElement).dataset.eyeDisabled === "1";
  }

  private isLocked (el?: Element): boolean {
    return !!el?.classList.contains("lock");
  }

  private findNear (elements: HTMLCollectionOf<Element>, where: EyeTargetAction, strict = false): Element | null {
    if (!this.lastElement) return null;
    const currentRect = this.lastElement.getBoundingClientRect();
    let nearestDistance = Number.MAX_VALUE;
    let next = this.lastElement;
    for (const element of elements) {
      if (this.lastElement === element) continue;
      const rect = element.getBoundingClientRect();
      const rx = rect.x + rect.width / 2;
      const ry = rect.y + rect.height / 2;
      const cx = currentRect.x + currentRect.width / 2;
      const cy = currentRect.y + currentRect.height / 2;

      switch (where) {
        case "left":
          if (rx >= cx) continue;
          break;
        case "right":
          if (rx <= cx) continue;
          break;
        case "up":
          if (ry >= cy) continue;
          break;
        case "down":
          if (ry <= cy) continue;
          break;
        case "enter":
          break;
      }

      const vertical = where !== "left" && where !== "right";
      const xFactor = vertical ? 1000 : 1;
      const yFactor = !vertical ? 1000 : 1;
      const d = this.distance({ x: rx * xFactor, y: ry * yFactor }, { x: cx * xFactor, y: cy * yFactor });
      if (d < nearestDistance) {
        nearestDistance = d;
        next = element;
      }
    }
    if (next === this.lastElement && !strict) return this.findNear(elements, where, true);
    return next;
  }

  private off(channel: string, listener: (event: unknown, data: any) => void) {
    if (this.ipcRenderer.off) {
      this.ipcRenderer.off(channel, listener);
      return;
    }
    this.ipcRenderer.removeListener?.(channel, listener);
  }
}
