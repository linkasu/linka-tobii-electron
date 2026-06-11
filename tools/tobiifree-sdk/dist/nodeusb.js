// nodeusb.ts — Node entry point. Uses the `usb` package's WebUSB polyfill
// so the same WebUsbTransport logic works without a browser.
//
// Requires `usb` (npm: usb) as a peer dependency. The caller installs it.
var __rewriteRelativeImportExtension = (this && this.__rewriteRelativeImportExtension) || function (path, preserveJsx) {
    if (typeof path === "string" && /^\.\.?\//.test(path)) {
        return path.replace(/\.(tsx)$|((?:\.d)?)((?:\.[^./]+?)?)\.([cm]?)ts$/i, function (m, tsx, d, ext, cm) {
            return tsx ? preserveJsx ? ".jsx" : ".js" : d && (!ext || !cm) ? m : (d + ext + "." + cm.toLowerCase() + "js");
        });
    }
    return path;
};
import { WebUsbTransport, TOBII_VID, TOBII_PID_RUNTIME } from "./webusb.js";
export async function openNodeTracker() {
    const usbModName = 'usb';
    const mod = (await import(__rewriteRelativeImportExtension(/* @vite-ignore */ usbModName)));
    const webusb = new mod.WebUSB({ allowAllDevices: true });
    const devices = await webusb.getDevices();
    const device = devices.find((d) => d.vendorId === TOBII_VID && d.productId === TOBII_PID_RUNTIME);
    if (!device)
        throw new Error('ET5 not found (vid=0x2104 pid=0x0313)');
    return WebUsbTransport.fromDevice(device);
}
/** Read the wasm module from disk. Pass the result to `Tracker.open`. */
export async function loadWasmFromFile(path) {
    const { readFile } = await import('node:fs/promises');
    return readFile(path);
}
export { WebUsbTransport };
//# sourceMappingURL=nodeusb.js.map