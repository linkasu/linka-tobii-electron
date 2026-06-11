// core.ts — thin WASM wrapper. The wasm owns seq counters, request-id
// tracking, frame dispatch, and typed GazeSample assembly. TS only
// shuffles bytes and forwards typed events.
import { readGazeSample } from "./gaze_view.js";
const KIND_NAMES = ['s64', 'u32', 'point2d', 'point3d', 'fixed16x16'];
/** Rebuild the 24-byte TTP header + payload for storage/replay. */
export function buildTtpFrameBytes(f) {
    const out = new Uint8Array(24 + f.payload.byteLength);
    const dv = new DataView(out.buffer);
    dv.setUint32(0, f.magic, false);
    dv.setUint32(4, f.seq, false);
    dv.setUint32(8, 0, false);
    dv.setUint32(12, f.op, false);
    dv.setUint32(16, 0, false);
    dv.setUint32(20, f.payload.byteLength, false);
    out.set(f.payload, 24);
    return out;
}
export async function loadCore(wasmBytes, events) {
    let instance;
    const { instance: inst } = await WebAssembly.instantiate(wasmBytes, {
        env: {
            on_ttp_frame: (magic, seq, op, pptr, plen) => {
                const exp = instance.exports;
                const view = new Uint8Array(exp.memory.buffer, pptr, plen);
                events.onFrame({ magic, seq, op, payload: view });
            },
            on_response: (requestId, pptr, plen) => {
                const exp = instance.exports;
                const view = new Uint8Array(exp.memory.buffer, pptr, plen);
                // Copy so callers can await freely.
                events.onResponse(requestId, view.slice());
            },
            on_gaze: (samplePtr) => {
                const exp = instance.exports;
                events.onGaze(readGazeSample(exp.memory.buffer, samplePtr));
            },
            on_raw_columns: (ptr, n) => {
                const exp = instance.exports;
                const view = new DataView(exp.memory.buffer, ptr, n * 32);
                const cols = [];
                for (let i = 0; i < n; i++) {
                    const off = i * 32;
                    cols.push({
                        colId: view.getUint32(off, true),
                        kind: KIND_NAMES[view.getUint32(off + 4, true)] ?? 'u32',
                        v0: view.getFloat64(off + 8, true),
                        v1: view.getFloat64(off + 16, true),
                        v2: view.getFloat64(off + 24, true),
                    });
                }
                events.onRawColumns(cols);
            },
            on_parse_error: (code) => events.onParseError(code),
        },
    });
    instance = inst;
    const exp = instance.exports;
    // Growable IN_BUF for JS → wasm byte transfers + a tiny DECODE_IN/OUT
    // pair used by decodeDisplayArea (response payloads are ~150B).
    const currentPages = exp.memory.buffer.byteLength / 65536;
    exp.memory.grow(2);
    const IN_BUF_PTR = currentPages * 65536;
    const IN_BUF_SIZE = 65536;
    const DECODE_IN_PTR = IN_BUF_PTR + IN_BUF_SIZE;
    const DECODE_IN_SIZE = 32768;
    const DECODE_OUT_PTR = DECODE_IN_PTR + DECODE_IN_SIZE;
    const sessionOutPtr = exp.session_out_ptr();
    function takeOutBytes() {
        const n = exp.session_out_len_();
        return new Uint8Array(exp.memory.buffer, sessionOutPtr, n).slice();
    }
    return {
        reset() { exp.session_reset(); },
        requestSubscribe(streamId) {
            exp.request_subscribe(streamId);
            return takeOutBytes();
        },
        requestGetDisplayArea() {
            const requestId = exp.request_get_display_area();
            return { requestId, bytes: takeOutBytes() };
        },
        requestSetDisplayArea(w, h, ox, oy, z) {
            exp.request_set_display_area(w, h, ox, oy, z);
            return takeOutBytes();
        },
        requestSetDisplayAreaCorners(tl, tr, bl) {
            exp.request_set_display_area_corners(tl.x, tl.y, tl.z, tr.x, tr.y, tr.z, bl.x, bl.y, bl.z);
            return takeOutBytes();
        },
        feedUsbIn(chunk) {
            if (chunk.byteLength > IN_BUF_SIZE) {
                throw new Error(`chunk ${chunk.byteLength} > IN_BUF_SIZE ${IN_BUF_SIZE}`);
            }
            const dst = new Uint8Array(exp.memory.buffer, IN_BUF_PTR, chunk.byteLength);
            dst.set(chunk);
            exp.feed_usb_in(IN_BUF_PTR, chunk.byteLength);
        },
        setRawColumnsEnabled(on) { exp.raw_columns_enable(on ? 1 : 0); },
        requestCalAddPoint(x, y, eyeChoice) {
            const requestId = exp.request_cal_add_point(x, y, eyeChoice);
            return { requestId, bytes: takeOutBytes() };
        },
        // --- State machines ---
        handshakeInit(streamId) {
            exp.handshake_init(streamId);
        },
        handshakePoll() {
            return exp.handshake_poll();
        },
        takeSessionOutBytes() {
            return takeOutBytes();
        },
        calStartInit() {
            exp.cal_start_init();
        },
        calStartPoll() {
            return exp.cal_start_poll();
        },
        calFinishInit() {
            exp.cal_finish_init();
        },
        calFinishPoll() {
            return exp.cal_finish_poll();
        },
        calFinishBlob() {
            const ptr = exp.cal_finish_blob_ptr();
            const len = exp.cal_finish_blob_len();
            return new Uint8Array(exp.memory.buffer, ptr, len).slice();
        },
        calApplyInit(blobLen) {
            exp.cal_apply_init(blobLen);
        },
        calApplyPoll() {
            return exp.cal_apply_poll();
        },
        writeScratch(blob) {
            const scratchPtr = exp.scratch_ptr();
            const dst = new Uint8Array(exp.memory.buffer, scratchPtr, blob.byteLength);
            dst.set(blob);
        },
        decodeDisplayArea(payload) {
            if (payload.byteLength > DECODE_IN_SIZE)
                return null;
            const inBuf = new Uint8Array(exp.memory.buffer, DECODE_IN_PTR, payload.byteLength);
            inBuf.set(payload);
            const ok = exp.decode_display_area(DECODE_IN_PTR, payload.byteLength, DECODE_OUT_PTR);
            if (ok === 0)
                return null;
            const dv = new DataView(exp.memory.buffer, DECODE_OUT_PTR, 72);
            return {
                tl: { x: dv.getFloat64(0, true), y: dv.getFloat64(8, true), z: dv.getFloat64(16, true) },
                tr: { x: dv.getFloat64(24, true), y: dv.getFloat64(32, true), z: dv.getFloat64(40, true) },
                bl: { x: dv.getFloat64(48, true), y: dv.getFloat64(56, true), z: dv.getFloat64(64, true) },
            };
        },
    };
}
/** Convenience wrapper used by Tracker. */
export function decodeDisplayArea(core, payload) {
    return core.decodeDisplayArea(payload);
}
//# sourceMappingURL=core.js.map