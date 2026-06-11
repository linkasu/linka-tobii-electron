// gusb.ts — Transport implementation over GUsb (GObject USB).
//
// For use in GJS environments (AGS, GNOME Shell extensions, etc.)
// where Node's `usb` package isn't available but GObject introspection
// provides GUsb bindings.
//
// Requires: gi://GUsb (gusb package with GIR typelib installed)
export const TOBII_VID = 0x2104;
export const TOBII_PID_RUNTIME = 0x0313;
const INTERFACE = 0;
const EP_IN = 0x83; // endpoint 3, IN direction
const EP_OUT = 0x05; // endpoint 5, OUT direction
const IN_CHUNK_SIZE = 16384;
const TRANSFER_TIMEOUT = 5000;
export class GUsbTransport {
    device;
    GUsb;
    constructor(device, gusb) {
        this.device = device;
        this.GUsb = gusb;
    }
    /**
     * Open the first connected ET5 via GUsb.
     * @param gusb The GUsb module, imported as `import GUsb from 'gi://GUsb'` in GJS.
     */
    static async open(gusb) {
        const ctx = new gusb.Context();
        ctx.enumerate();
        const device = ctx.find_by_vid_pid(TOBII_VID, TOBII_PID_RUNTIME);
        if (!device)
            throw new Error('ET5 not found (vid=0x2104 pid=0x0313)');
        device.open();
        device.claim_interface(INTERFACE, gusb.DeviceClaimInterfaceFlags.NONE);
        // Session-open: vendor control transfer 0x41
        const data = new Uint8Array(0);
        const [ok] = device.control_transfer(gusb.DeviceDirection.OUT, gusb.DeviceRequestType.VENDOR, gusb.DeviceRecipient.INTERFACE, 0x41, 0x0000, 0x0000, data, TRANSFER_TIMEOUT);
        if (!ok)
            throw new Error('session-open control transfer failed');
        return new GUsbTransport(device, gusb);
    }
    async send(bytes) {
        const [ok, written] = this.device.bulk_transfer(EP_OUT, bytes, TRANSFER_TIMEOUT);
        if (!ok || written !== bytes.byteLength) {
            throw new Error(`bulk OUT failed: wrote ${written}/${bytes.byteLength}`);
        }
    }
    async recv(signal, onChunk) {
        // Use synchronous bulk_transfer in a loop. GJS runs on a GLib main loop,
        // so we yield back to it periodically with a short timeout. For a proper
        // async version, use bulk_transfer_async with GLib.idle_add.
        //
        // However, synchronous with a timeout works well enough for eye tracking
        // since the device pushes data continuously at ~33Hz.
        while (!signal.aborted) {
            try {
                const buf = new Uint8Array(IN_CHUNK_SIZE);
                const [ok, len] = this.device.bulk_transfer(EP_IN, buf, 100);
                if (!ok || len === 0)
                    continue;
                onChunk(buf.subarray(0, len));
            }
            catch (e) {
                if (signal.aborted)
                    return;
                // Timeout is expected — just retry
                const msg = e instanceof Error ? e.message : String(e);
                if (msg.includes('TIMEOUT') || msg.includes('timed out'))
                    continue;
                throw e;
            }
        }
    }
    async close() {
        try {
            // Session-close: vendor control 0x42
            const data = new Uint8Array(0);
            this.device.control_transfer(this.GUsb.DeviceDirection.OUT, this.GUsb.DeviceRequestType.VENDOR, this.GUsb.DeviceRecipient.INTERFACE, 0x42, 0, 0, data, TRANSFER_TIMEOUT);
        }
        catch { }
        try {
            this.device.release_interface(INTERFACE, this.GUsb.DeviceClaimInterfaceFlags.NONE);
        }
        catch { }
        try {
            this.device.close();
        }
        catch { }
    }
}
//# sourceMappingURL=gusb.js.map