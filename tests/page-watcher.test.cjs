const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { test } = require("node:test");
const vm = require("node:vm");
const path = require("node:path");

const renderer = readFileSync(require.resolve("../dist/renderer/PageWatcher.js"), "utf8");

test("package includes its license and corresponding integration source", () => {
  const root = path.resolve(__dirname, "..");
  const metadata = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
  assert.equal(metadata.license, "GPL-3.0-or-later");
  for (const file of ["LICENSE", "README.md", "THIRD_PARTY_NOTICES.md",
    "src/renderer/PageWatcher.ts", "tsconfig.json"]) {
    assert.ok(readFileSync(path.join(root, file)).length, file);
  }
});

function setup(overrides = {}, locked = false) {
  const settings = {
    enabled: true, eyeSelect: true, eyeActivation: true,
    keyboardActivation: false, joystickActivation: false, timeout: 1000,
    ...overrides
  };
  const element = new EventTarget();
  element.dataset = {};
  element.classList = { contains: (name) => locked && name === "lock" };
  element.getBoundingClientRect = () => ({ x: 0, y: 0, width: 100, height: 100 });
  let clicks = 0;
  let enters = 0;
  element.addEventListener("click", () => clicks++);
  element.addEventListener("eye-enter", () => enters++);
  const window = new EventTarget();
  const listeners = new Map();
  let frame;
  let pressed = false;
  const exports = {};
  vm.runInNewContext(renderer, {
    exports, CustomEvent, HTMLInputElement: class {}, window,
    document: { getElementsByClassName: () => [element] },
    MutationObserver: class { observe() {} disconnect() {} },
    navigator: { getGamepads: () => [{ id: "test", buttons: [{ value: Number(pressed) }] }] },
    requestAnimationFrame: (callback) => { frame = callback; return 1; },
    cancelAnimationFrame: () => { frame = undefined; },
    require: (name) => {
      if (name === "electron") return {};
      if (name === "uuid") return { v4: () => "test-elements" };
      throw new Error(`Unexpected dependency: ${name}`);
    }
  });
  const watcher = new exports.PageWatcher({
    getSettings: () => settings,
    getKeyMapping: () => ({ enter: ["Enter", "joy0"], right: ["ArrowRight", "joy1"] }),
    ipcRenderer: {
      on: (channel, listener) => listeners.set(channel, listener),
      off: (channel) => listeners.delete(channel), send() {}
    }
  });
  function press(source) {
    if (source === "gaze") {
      listeners.get("eye-enter")(null, { id: "test-elements", elementIndex: 0 });
      listeners.get("eye-click")(null, { id: "test-elements", elementIndex: 0, count: 1 });
    } else if (source === "joystick") {
      pressed = true;
      frame();
      pressed = false;
      frame();
    } else {
      const event = new Event("keydown", { cancelable: true });
      event.code = "Enter";
      window.dispatchEvent(event);
    }
  }
  return {
    watcher, settings, element, press,
    clicks: () => clicks, enters: () => enters,
    cleanup: () => { watcher.destroy(); assert.equal(listeners.size, 0); assert.equal(frame, undefined); }
  };
}

for (const eyeActivation of [false, true]) {
  for (const keyboardActivation of [false, true]) {
    for (const joystickActivation of [false, true]) {
      for (const source of ["gaze", "keyboard", "joystick"]) {
        test(`${source}: eye=${eyeActivation} keyboard=${keyboardActivation} joystick=${joystickActivation}`, () => {
          const fixture = setup({ eyeActivation, keyboardActivation, joystickActivation });
          try {
            fixture.press(source);
            fixture.press(source);
            const enabled = source === "gaze" ? eyeActivation : source === "keyboard" ? keyboardActivation : joystickActivation;
            assert.equal(fixture.clicks(), enabled ? (source === "gaze" ? 2 : 1) : 0);
            if (source !== "gaze") assert.equal(fixture.enters(), enabled ? 1 : 0);
          } finally { fixture.cleanup(); }
        });
      }
    }
  }
}

test("two-argument clickWatch retains keyboard gating", () => {
  const fixture = setup({ joystickActivation: true });
  try {
    fixture.watcher.clickWatch(fixture.element, false);
    assert.equal(fixture.clicks(), 0);
    fixture.settings.keyboardActivation = true;
    fixture.watcher.clickWatch(fixture.element, false);
    assert.equal(fixture.clicks(), 1);
  } finally { fixture.cleanup(); }
});

for (const source of ["gaze", "keyboard", "joystick"]) {
  test(`${source} can resume a lock while enabled=false`, () => {
    const fixture = setup({ enabled: false, eyeSelect: false, eyeActivation: false,
      keyboardActivation: source === "keyboard", joystickActivation: source === "joystick" }, true);
    try {
      fixture.press(source);
      fixture.press(source);
      assert.equal(fixture.clicks(), source === "gaze" ? 2 : 1);
    } finally { fixture.cleanup(); }
  });
}

test("eye-disabled blocks gaze but not keyboard or joystick", () => {
  const fixture = setup({ keyboardActivation: true, joystickActivation: true });
  fixture.element.dataset.eyeDisabled = "1";
  try {
    fixture.press("gaze");
    assert.equal(fixture.clicks(), 0);
    fixture.press("keyboard");
    fixture.press("keyboard");
    fixture.press("joystick");
    assert.equal(fixture.clicks(), 2);
  } finally { fixture.cleanup(); }
});
