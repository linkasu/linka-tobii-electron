// tobii.ts — top-level entry point.
//
// `Tobii.fromUsb()` — direct USB (browser or Node), returns UsbSource.
// `Tobii.fromDaemon()` — WebSocket to tobiifreed, returns WsSource.
var __rewriteRelativeImportExtension = (this && this.__rewriteRelativeImportExtension) || function (path, preserveJsx) {
    if (typeof path === "string" && /^\.\.?\//.test(path)) {
        return path.replace(/\.(tsx)$|((?:\.d)?)((?:\.[^./]+?)?)\.([cm]?)ts$/i, function (m, tsx, d, ext, cm) {
            return tsx ? preserveJsx ? ".jsx" : ".js" : d && (!ext || !cm) ? m : (d + ext + "." + cm.toLowerCase() + "js");
        });
    }
    return path;
};
import { UsbSource } from "./usb_source.js";
import { WsSource } from "./ws_source.js";
import { WebUsbTransport, TOBII_VID, TOBII_PID_RUNTIME } from "./webusb.js";
import { wasmBytes } from "./wasm-bundle.js";
async function pickDevice() {
    if (typeof navigator !== 'undefined' && 'usb' in navigator) {
        return navigator.usb.requestDevice({
            filters: [{ vendorId: TOBII_VID, productId: TOBII_PID_RUNTIME }],
        });
    }
    const usbModName = 'usb';
    const mod = await import(__rewriteRelativeImportExtension(/* @vite-ignore */ usbModName)).catch(() => {
        throw new Error('WebUSB not available and the `usb` package is not installed. ' +
            'In Node, add `usb` as a dependency or pass `device` explicitly.');
    });
    const WebUSB = mod.WebUSB;
    const webusb = new WebUSB({ allowAllDevices: true });
    const devices = await webusb.getDevices();
    const device = devices.find((d) => d.vendorId === TOBII_VID && d.productId === TOBII_PID_RUNTIME);
    if (!device) {
        throw new Error(`ET5 not found (vid=0x${TOBII_VID.toString(16)} pid=0x${TOBII_PID_RUNTIME.toString(16)})`);
    }
    return device;
}
export const Tobii = {
    /** Direct USB connection (browser WebUSB or Node usb package). */
    async fromUsb(opts = {}) {
        const device = opts.device ?? await pickDevice();
        const transport = await WebUsbTransport.fromDevice(device);
        return UsbSource.create({
            transport,
            wasmBytes: wasmBytes(),
            requestTimeoutMs: opts.requestTimeoutMs,
        });
    },
    /** Connect to tobiifreed daemon via WebSocket. */
    async fromDaemon(opts) {
        return WsSource.connect(opts.url, opts.requestTimeoutMs);
    },
    /** @deprecated Use `Tobii.fromUsb()` instead. */
    async createSession(opts = {}) {
        return Tobii.fromUsb(opts);
    },
};
//# sourceMappingURL=tobii.js.map