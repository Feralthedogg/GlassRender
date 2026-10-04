import type { Renderer } from "../renderer/renderer.js";
import type { Fit } from "./types.js";

const SW = 0, SH = 1;

function sizeOf(s: TexImageSource, out: Float64Array): void {
    out[SW] = "videoWidth" in s ? s.videoWidth : "naturalWidth" in s ? s.naturalWidth : "displayWidth" in s ? s.displayWidth : s.width;
    out[SH] = "videoHeight" in s ? s.videoHeight : "naturalHeight" in s ? s.naturalHeight : "displayHeight" in s ? s.displayHeight : s.height;
}

/** @internal Backdrop source of one glass. */
export class Backdrop {
    private readonly onLoad: () => void;
    private readonly size: Float64Array;
    private source: TexImageSource | null;
    private fit: Fit;
    private scratch: HTMLCanvasElement | null;
    /** Upload again on every frame. */
    live: boolean;

    /** @param onLoad Called when an image that was still loading is ready (upload and draw). */
    constructor(onLoad: () => void, fit: Fit, live: boolean) {
        this.onLoad = onLoad;
        this.size = new Float64Array(2);
        this.source = null;
        this.fit = fit;
        this.scratch = null;
        this.live = live;
    }

    /** Take a source. @returns True when it can be uploaded now (false while an image is still loading). */
    set(source: TexImageSource | null, fit: Fit, live: boolean): boolean {
        this.release();
        this.source = source;
        this.fit = fit;
        this.live = live;
        if (source !== null && "complete" in source && !source.complete) { source.addEventListener("load", this.onLoad); return false; }
        return true;
    }

    /** Lay the source on a W x H drawing buffer: as it is when it has that size, else drawn by the fit rule. */
    upload(renderer: Renderer, W: number, H: number): void {
        const s = this.source;
        if (s === null || W === 0 || H === 0) return;
        const z = this.size;
        sizeOf(s, z);
        const sw = z[SW] as number, sh = z[SH] as number;
        if (sw === 0 || sh === 0) return;
        if (sw === W && sh === H) { renderer.setBackdropSource(s); return; }
        let c = this.scratch;
        if (c === null) { c = document.createElement("canvas"); this.scratch = c; }
        if (c.width !== W) c.width = W;
        if (c.height !== H) c.height = H;
        const g = c.getContext("2d", { alpha: false });
        if (g === null) return;
        let img: CanvasImageSource;
        if (s instanceof ImageData) {
            const t = document.createElement("canvas");
            t.width = sw; t.height = sh;
            const tg = t.getContext("2d");
            if (tg === null) return;
            tg.putImageData(s, 0, 0);
            img = t;
        } else img = s;
        if (this.fit === "stretch") g.drawImage(img, 0, 0, W, H);
        else {
            const k = this.fit === "cover" ? (W / sw > H / sh ? W / sw : H / sh) : W / sw < H / sh ? W / sw : H / sh;
            const dw = sw * k, dh = sh * k;
            if (this.fit === "contain") { g.fillStyle = "#000"; g.fillRect(0, 0, W, H); }
            g.drawImage(img, (W - dw) * 0.5, (H - dh) * 0.5, dw, dh);
        }
        renderer.setBackdropSource(c);
    }

    /** Stop waiting for the source to load. */
    release(): void {
        if (this.source !== null && "complete" in this.source) this.source.removeEventListener("load", this.onLoad);
    }
}
