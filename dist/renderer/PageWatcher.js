"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PageWatcher = void 0;
const electron_1 = require("electron");
const uuid_1 = require("uuid");
const defaultSettings = {
    timeout: 1000,
    enabled: true,
    eyeActivation: true,
    eyeSelect: true,
    keyboardActivation: false,
    joystickActivation: false
};
const defaultDistance = (a, b) => {
    return Math.hypot(a.x - b.x, a.y - b.y);
};
class PageWatcher {
    static TIMEOUT = defaultSettings.timeout;
    static EXIT_TIMEOUT = 150;
    static instance;
    className;
    ipcRenderer;
    getSettings;
    getKeyMapping;
    distance;
    observer;
    onResize = () => this.watchElementsChange();
    onKeyDown = (event) => {
        if (event.target instanceof HTMLInputElement)
            return;
        if (this.onKeyboard(event.code)) {
            event.preventDefault();
            return false;
        }
        return undefined;
    };
    onEyeEnter = (_event, data) => {
        if (data.id !== this.elements.id)
            return;
        const element = this.elements.elements[data.elementIndex];
        this.enterWatch(element);
    };
    onEyeExit = (_event, data) => {
        if (data?.id !== this.elements.id)
            return;
        this.exitWatch();
    };
    onEyeClick = (_event, data) => {
        if (data?.id !== this.elements.id)
            return;
        const element = this.elements.elements[data.elementIndex];
        if (data.count > 1)
            return;
        if (element !== undefined)
            this.clickWatch(element, true);
    };
    lastElement;
    gamepadButtonsMap = new Map();
    animationFrame;
    elements = {
        id: "",
        elements: [],
        bounds: []
    };
    constructor(options = {}) {
        PageWatcher.instance = this;
        this.className = options.className || "eye";
        this.ipcRenderer = options.ipcRenderer || electron_1.ipcRenderer;
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
    destroy() {
        window.removeEventListener("resize", this.onResize);
        window.removeEventListener("keydown", this.onKeyDown);
        this.observer.disconnect();
        if (this.animationFrame !== undefined)
            cancelAnimationFrame(this.animationFrame);
        this.off("eye-enter", this.onEyeEnter);
        this.off("eye-exit", this.onEyeExit);
        this.off("eye-click", this.onEyeClick);
        if (PageWatcher.instance === this)
            PageWatcher.instance = undefined;
    }
    watchElementsChange(force = false) {
        const eyes = [...document.getElementsByClassName(this.className)];
        const bounds = eyes.map((el) => el.getBoundingClientRect());
        if (!force) {
            const equals = bounds.length === this.elements.bounds.length && !bounds.map((b, index) => {
                const a = this.elements.bounds[index];
                return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
            }).includes(false);
            if (equals)
                return;
        }
        this.elements = {
            elements: eyes,
            bounds,
            id: (0, uuid_1.v4)()
        };
        this.ipcRenderer.send("eye-elements", JSON.parse(JSON.stringify(this.elements)));
    }
    onKeyboard(code) {
        const settings = this.getSettings();
        const joy = code.startsWith("joy");
        if ((!joy && !settings.keyboardActivation) || (joy && !settings.joystickActivation))
            return false;
        const elements = document.getElementsByClassName(this.className);
        const map = this.getKeyMapping();
        let action = null;
        for (const key in map) {
            const candidate = key;
            const mappedKeys = map[candidate] || [];
            if (mappedKeys.includes(code)) {
                action = candidate;
                break;
            }
        }
        if (action === null)
            return false;
        if (this.lastElement?.getBoundingClientRect().width === 0)
            this.lastElement = undefined;
        if (!this.lastElement && elements[0]) {
            this.lastElement = elements[0];
            this.lastElement.dispatchEvent(new CustomEvent("eye-enter", { detail: {} }));
            return true;
        }
        if (!this.lastElement)
            return true;
        if (action !== "enter") {
            if (!settings.enabled)
                return false;
            const next = this.findNear(elements, action);
            if (!next)
                return true;
            this.lastElement.dispatchEvent(new CustomEvent("eye-exit", { detail: {} }));
            this.lastElement = next;
            this.lastElement.dispatchEvent(new CustomEvent("eye-enter", { detail: {} }));
        }
        else {
            this.clickWatch(this.lastElement, false);
        }
        return true;
    }
    clickWatch(el, eye) {
        const settings = this.getSettings();
        if (eye && this.isEyeDisabled(el))
            return;
        if (!el.classList.contains("lock")) {
            if (eye && !settings.eyeActivation)
                return;
            if (!eye && !settings.keyboardActivation)
                return;
        }
        el.dispatchEvent(new CustomEvent("click", { detail: {} }));
    }
    enterWatch(el) {
        const settings = this.getSettings();
        if (!el)
            return;
        if (this.isEyeDisabled(el))
            return;
        if (!settings.eyeSelect && !this.isLocked(el))
            return;
        this.lastElement = el;
        el.dispatchEvent(new CustomEvent("eye-enter", { detail: { eye: true } }));
    }
    exitWatch() {
        const settings = this.getSettings();
        if (!settings.eyeSelect && !this.isLocked(this.lastElement))
            return;
        if (this.lastElement && this.isEyeDisabled(this.lastElement))
            return;
        this.lastElement?.dispatchEvent(new CustomEvent("eye-exit", { detail: { eye: true } }));
        this.lastElement = undefined;
    }
    joystickCycle() {
        const gamepads = navigator.getGamepads();
        for (const gamepad of gamepads) {
            if (!gamepad)
                continue;
            const buttons = gamepad.buttons.map(({ value }) => !!value);
            const lasts = this.gamepadButtonsMap.get(gamepad.id);
            if (lasts) {
                for (let index = 0; index < buttons.length; index++) {
                    const pressed = buttons[index];
                    const last = lasts[index];
                    if (!last && pressed)
                        this.onKeyboard(`joy${index}`);
                }
            }
            this.gamepadButtonsMap.set(gamepad.id, buttons);
        }
        this.animationFrame = requestAnimationFrame(() => this.joystickCycle());
    }
    isEyeDisabled(el) {
        if (!el)
            return false;
        return el.dataset.eyeDisabled === "1";
    }
    isLocked(el) {
        return !!el?.classList.contains("lock");
    }
    findNear(elements, where, strict = false) {
        if (!this.lastElement)
            return null;
        const currentRect = this.lastElement.getBoundingClientRect();
        let nearestDistance = Number.MAX_VALUE;
        let next = this.lastElement;
        for (const element of elements) {
            if (this.lastElement === element)
                continue;
            const rect = element.getBoundingClientRect();
            const rx = rect.x + rect.width / 2;
            const ry = rect.y + rect.height / 2;
            const cx = currentRect.x + currentRect.width / 2;
            const cy = currentRect.y + currentRect.height / 2;
            switch (where) {
                case "left":
                    if (rx >= cx)
                        continue;
                    break;
                case "right":
                    if (rx <= cx)
                        continue;
                    break;
                case "up":
                    if (ry >= cy)
                        continue;
                    break;
                case "down":
                    if (ry <= cy)
                        continue;
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
        if (next === this.lastElement && !strict)
            return this.findNear(elements, where, true);
        return next;
    }
    off(channel, listener) {
        if (this.ipcRenderer.off) {
            this.ipcRenderer.off(channel, listener);
            return;
        }
        this.ipcRenderer.removeListener?.(channel, listener);
    }
}
exports.PageWatcher = PageWatcher;
//# sourceMappingURL=PageWatcher.js.map