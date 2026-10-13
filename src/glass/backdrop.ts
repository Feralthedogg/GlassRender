/**
 * @file backdrop.ts
 * @brief Backdrop sizing, fitting and upload lifecycle.
 */

import type { Renderer } from "../renderer/renderer.js";
import type { Fit } from "./types.js";

const SW = 0, SH = 1;
// A video whose pictures come faster than its callbacks report them is uploaded on every frame for this long.
const CHASE = 1000;

function sizeOf(s: TexImageSource, out: Float64Array): void {
    out[SW] = "videoWidth" in s ? s.videoWidth : "naturalWidth" in s ? s.naturalWidth : "displayWidth" in s ? s.displayWidth : s.width;
    out[SH] = "videoHeight" in s ? s.videoHeight : "naturalHeight" in s ? s.naturalHeight : "displayHeight" in s ? s.displayHeight : s.height;
}

/**
 * @brief Backdrop source of one glass.
 * @internal
 */
export class Backdrop {
    private readonly onLoad: () => void;
    private readonly onChange: () => void;
    private readonly onPicture: (now: number, picture: VideoFrameCallbackMetadata) => void;
    private readonly onSeek: () => void;
    private readonly size: Float64Array;
    private source: TexImageSource | null;
    private fit: Fit;
    private scratch: HTMLCanvasElement | null;
    private video: HTMLVideoElement | null;
    private pictureId: number;
    private presented: number;
    private due: boolean;
    private after: boolean;
    private skipped: boolean;
    private chase: number;
    /** @brief Upload again as the source changes. */
    live: boolean;
    /** @brief The frame after the last one asked about is wanted too. */
    again: boolean;

    /**
     * @param onLoad Called when an image that was still loading is ready (upload and draw).
     * @param onChange Called when a live video shows a new picture (ask for a frame).
     */
    constructor(onLoad: () => void, onChange: () => void, fit: Fit, live: boolean) {
        this.onLoad = onLoad;
        this.onChange = onChange;
        this.onPicture = (_now: number, picture: VideoFrameCallbackMetadata): void => { this.picture(picture.presentedFrames); };
        this.onSeek = (): void => { this.picture(0); };
        this.size = new Float64Array(2);
        this.source = null;
        this.fit = fit;
        this.scratch = null;
        this.video = null;
        this.pictureId = 0;
        this.presented = 0;
        this.due = false;
        this.after = false;
        this.skipped = false;
        this.chase = 0;
        this.live = live;
        this.again = false;
    }

    /**
     * @brief Take a source. @returns True when it can be uploaded now (false while an image is
     * still loading).
     */
    set(source: TexImageSource | null, fit: Fit, live: boolean): boolean {
        this.release();
        this.source = source;
        this.fit = fit;
        this.live = live;
        // A video tells when it shows a new picture: a paused one, or one slower than the display, is not uploaded on every frame.
        if (live && source !== null && "requestVideoFrameCallback" in source) {
            this.video = source;
            this.pictureId = source.requestVideoFrameCallback(this.onPicture);
            source.addEventListener("loadeddata", this.onSeek);
            source.addEventListener("seeked", this.onSeek);
        }
        if (source !== null && "complete" in source && !source.complete) { source.addEventListener("load", this.onLoad); return false; }
        return true;
    }

    /**
     * @brief Whether the live source is uploaded at the frame of time `now` (ms); sets `again`.
     * @details A canvas cannot tell when it changes and is uploaded on every frame. A video is
     * uploaded when it has shown a new picture, and the frame after that one is looked at as well:
     * pictures on two frames in a row, or pictures that no callback reported, mean that pictures
     * come faster than the callbacks report them, and the video is then uploaded on every frame
     * while it plays.
     */
    frame(now: number): boolean {
        if (!this.live) { this.again = false; return false; }
        const v = this.video;
        if (v === null) { this.again = true; return true; }
        const due = this.due;
        if (this.skipped || (due && this.after)) this.chase = now + CHASE;
        this.skipped = false;
        this.after = due;
        const up = due || (now < this.chase && !v.paused && !v.ended);
        this.again = up;
        return up;
    }

    /**
     * @brief Lay the source on a W x H drawing buffer: as it is when it has that size, else drawn
     * by the fit rule.
     */
    upload(renderer: Renderer, W: number, H: number): void {
        const s = this.source;
        this.due = false;
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

    /** @brief Stop waiting for the source to load or to change. */
    release(): void {
        if (this.source !== null && "complete" in this.source) this.source.removeEventListener("load", this.onLoad);
        const v = this.video;
        if (v === null) return;
        v.cancelVideoFrameCallback(this.pictureId);
        v.removeEventListener("loadeddata", this.onSeek);
        v.removeEventListener("seeked", this.onSeek);
        this.video = null;
        this.pictureId = 0;
        this.presented = 0;
        this.due = false;
        this.after = false;
        this.skipped = false;
        this.chase = 0;
    }

    // The video shows a new picture, its `count`th (0 when unknown): upload it at the next frame and wait for the one after it.
    private picture(count: number): void {
        const v = this.video;
        if (v === null) return;
        v.cancelVideoFrameCallback(this.pictureId);
        this.pictureId = v.requestVideoFrameCallback(this.onPicture);
        if (count > 0) {
            if (this.presented > 0 && count - this.presented > 1) this.skipped = true;
            this.presented = count;
        }
        this.due = true;
        this.onChange();
    }
}
