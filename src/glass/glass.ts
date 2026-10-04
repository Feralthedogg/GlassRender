// Convenience layer over the renderer: a self-sizing canvas, a render loop that runs while something changes or moves,
// named options for shapes and groups, and WebGL context management. Calls may allocate; frames do not, except for
// elements followed on every frame.
import { STACKING_EXACT, STACKING_FLAT } from "../layout.js";
import { headroomShare, type Rgb } from "../material.js";
import { Renderer } from "../renderer/renderer.js";
import { err, ok, type Result } from "../result.js";
import { Backdrop } from "./backdrop.js";
import { Surroundings } from "./environment.js";
import { Followers, type Follower } from "./follower.js";
import { GlassGroup } from "./group.js";
import type { GlassItem } from "./item.js";
import { GlassShape } from "./shape.js";
import type {
    Appearance, EnvironmentOptions, Fit, Follow, GlassOptions, GroupOptions, ShapeOptions, StackingMode
} from "./types.js";

// How a browser lets a canvas show values above standard white (a proposed interface available in some browsers).
type RangeCanvas = HTMLCanvasElement & { configureHighDynamicRange?: (options: { mode: string }) => void };

const ACCENT: Rgb = [0, 0.478, 1];

/** Glass on a canvas: shapes and groups, a backdrop, and a render loop that runs while something changes. */
export class Glass {
    /** The canvas the glass is drawn on. */
    readonly canvas: HTMLCanvasElement;
    /** The renderer underneath, for low-level calls (`update()` afterwards schedules a frame). */
    readonly renderer: Renderer;
    private readonly items: GlassItem[];
    private readonly leaving: GlassItem[];
    private readonly followers: Followers;
    private readonly backdrop: Backdrop;
    private readonly surroundings: Surroundings;
    private readonly onFrame: FrameRequestCallback;
    private readonly onResolution: () => void;
    private readonly onLost: (event: Event) => void;
    private readonly onRestored: () => void;
    private readonly lostCallback: (() => void) | null;
    private readonly restoredCallback: ((error: string) => void) | null;
    private resolutionQuery: MediaQueryList | null;
    private canvasObserver: ResizeObserver | null;
    private appearance: Appearance;
    private dark: boolean;
    private env: EnvironmentOptions;
    private envBits: number;
    private range: Follow;
    private headroom: number;
    private extended: boolean;
    private rangeShown: boolean;
    private share: number;
    private accent: Rgb;
    private pixelWidth: number;
    private pixelHeight: number;
    private ratio: number;
    private readonly maxRatio: number;
    private frameId: number;
    private measure: boolean;
    private reorder: boolean;
    private lost: boolean;
    private destroyed: boolean;
    /** Why the glass could not be rebuilt after the context came back ("" otherwise). */
    error: string;

    /** @internal Use `createGlass`. */
    constructor(canvas: HTMLCanvasElement, renderer: Renderer, o: GlassOptions) {
        this.canvas = canvas;
        this.renderer = renderer;
        this.items = [];
        this.leaving = [];
        this.followers = new Followers((): void => { this.measure = true; this.update(); });
        this.backdrop = new Backdrop((): void => { this.upload(); this.update(); }, o.fit ?? "cover", o.live ?? false);
        this.surroundings = new Surroundings((): void => { this.surroundingsChanged(); });
        this.onFrame = (now: number): void => { this.tick(now); };
        this.onResolution = (): void => { this.watchResolution(); this.resize(); };
        this.onLost = (event: Event): void => { this.whenLost(event); };
        this.onRestored = (): void => { this.whenRestored(); };
        this.lostCallback = o.onContextLost ?? null;
        this.restoredCallback = o.onContextRestored ?? null;
        this.resolutionQuery = null;
        this.canvasObserver = null;
        this.appearance = o.appearance ?? "auto";
        this.dark = this.surroundings.dark;
        this.env = o.environment ?? {};
        this.envBits = 0;
        this.range = o.extendedRange ?? false;
        this.headroom = o.headroom !== undefined && o.headroom > 1 ? o.headroom : 2;
        this.extended = false;
        this.rangeShown = false;
        this.share = 0;
        this.accent = o.accent ?? ACCENT;
        this.pixelWidth = 0;
        this.pixelHeight = 0;
        this.ratio = 1;
        this.maxRatio = o.maxPixelRatio !== undefined && o.maxPixelRatio > 0 ? o.maxPixelRatio : 2;
        this.frameId = 0;
        this.measure = false;
        this.reorder = false;
        this.lost = false;
        this.destroyed = false;
        this.error = "";
        canvas.addEventListener("webglcontextlost", this.onLost);
        canvas.addEventListener("webglcontextrestored", this.onRestored);
        this.applyEnvironment();
        if (o.stacking === "flat") renderer.setStacking(STACKING_FLAT);
        if (o.lightAngle !== undefined) renderer.setLightAngle(o.lightAngle);
        if (o.autoResize ?? true) {
            if (typeof ResizeObserver === "function") {
                this.canvasObserver = new ResizeObserver(() => { this.resize(); });
                this.canvasObserver.observe(canvas);
            }
            this.watchResolution();
            this.resize();
        } else this.setSize(canvas.width, canvas.height, 1);
        this.applyRange();
        if (o.backdrop !== undefined) this.setBackdrop(o.backdrop, o.fit ?? "cover", o.live ?? false);
        this.update();
    }

    /** Width of the canvas in CSS pixels. */
    get width(): number {
        return this.pixelWidth / this.ratio;
    }

    /** Height of the canvas in CSS pixels. */
    get height(): number {
        return this.pixelHeight / this.ratio;
    }

    /** The surroundings in effect, as `ENV_*` bits ("auto" settings resolved). */
    get environment(): number {
        return this.envBits;
    }

    /** True while the glass is drawn in extended range. */
    get extendedRange(): boolean {
        return this.extended;
    }

    /** True while the WebGL context is lost; drawing resumes on its own when it is back. */
    get contextLost(): boolean {
        return this.lost;
    }

    /** Add a shape. Only the frame is required. */
    add(o: ShapeOptions): GlassShape {
        const s = new GlassShape(this, this.renderer, o);
        this.items.push(s);
        this.update();
        return s;
    }

    /** Add a group: outlines added to it share one piece of glass and merge within `spacing`. */
    addGroup(o: GroupOptions = {}): GlassGroup {
        const g = new GlassGroup(this, this.renderer, o);
        this.items.push(g);
        this.update();
        return g;
    }

    /**
     * Set the picture behind the glass. It is laid on the canvas by `fit` and laid again when the canvas is resized.
     * @param live Upload it again on every frame (a playing video, an animated canvas).
     */
    setBackdrop(source: TexImageSource | null, fit: Fit = "cover", live = false): void {
        if (this.backdrop.set(source, fit, live)) this.upload();
        this.update();
    }

    /** Change the default surroundings of the shapes. */
    setAppearance(appearance: Appearance): void {
        if (appearance === this.appearance) return;
        this.appearance = appearance;
        for (const it of this.items) it.restyle();
        this.update();
    }

    /**
     * Change the surroundings of the built-in materials: window activity, the tinted setting, reduced transparency,
     * increased contrast, reduced motion. Fields left out keep their value; "auto" follows the device.
     */
    setEnvironment(environment: EnvironmentOptions): void {
        this.env = { ...this.env, ...environment };
        this.applyEnvironment();
    }

    /**
     * Draw in extended range (values above the standard white on screens that show them) or go back to standard range.
     * It can be turned on only when the glass was created with the `extendedRange` option (true or "auto"): the
     * drawing buffer needs an alpha channel for it, which is decided when the context is made.
     * @param on true, false, or "auto" to follow `dynamic-range: high`.
     * @param headroom Brightest value of the screen relative to the standard white (kept when left out).
     * @returns True when the glass is drawn in extended range now.
     */
    setExtendedRange(on: Follow, headroom?: number): boolean {
        this.range = on;
        if (headroom !== undefined && headroom > 1) this.headroom = headroom;
        this.applyRange();
        return this.extended;
    }

    /** Change the accent colour of the "prominent" preset. */
    setAccent(accent: Rgb): void {
        this.accent = accent;
        for (const it of this.items) if (it.accented()) it.retint();
        this.update();
    }

    /** Turn every rim light by `radians` clockwise (for a light that follows a pointer or a device's tilt). */
    setLightAngle(radians: number): void {
        this.renderer.setLightAngle(radians);
        this.update();
    }

    /** Glass over glass: "exact" (default) or "flat". */
    setStacking(mode: StackingMode): void {
        this.renderer.setStacking(mode === "flat" ? STACKING_FLAT : STACKING_EXACT);
        this.update();
    }

    /**
     * Size the drawing buffer. Without arguments it takes the displayed size of the canvas and the pixel ratio of the
     * screen (what `autoResize` does on its own).
     */
    resize(width?: number, height?: number, ratio?: number): void {
        if (this.destroyed) return;
        const dpr = ratio ?? (typeof devicePixelRatio === "number" && devicePixelRatio > 0 ? devicePixelRatio : 1);
        const r = dpr < this.maxRatio ? dpr : this.maxRatio;
        const w = width ?? this.canvas.clientWidth, h = height ?? this.canvas.clientHeight;
        if (w > 0 && h > 0) this.setSize(Math.round(w * r), Math.round(h * r), r);
    }

    /** Draw now (otherwise frames are drawn on their own after every change). */
    render(now?: number): void {
        if (this.destroyed || this.lost) return;
        if (this.frameId !== 0) { cancelAnimationFrame(this.frameId); this.frameId = 0; }
        this.tick(now ?? performance.now());
    }

    /** Ask for a frame (after low-level calls on `renderer`). */
    update(): void {
        if (this.frameId === 0 && !this.destroyed && !this.lost && typeof requestAnimationFrame === "function") {
            this.frameId = requestAnimationFrame(this.onFrame);
        }
    }

    /** Stop the loop, drop the listeners and release the GPU objects. */
    destroy(): void {
        if (this.destroyed) return;
        this.destroyed = true;
        if (this.frameId !== 0) cancelAnimationFrame(this.frameId);
        this.frameId = 0;
        this.canvas.removeEventListener("webglcontextlost", this.onLost);
        this.canvas.removeEventListener("webglcontextrestored", this.onRestored);
        if (this.resolutionQuery !== null) this.resolutionQuery.removeEventListener("change", this.onResolution);
        if (this.canvasObserver !== null) this.canvasObserver.disconnect();
        for (const it of this.items) it.unfollow();
        this.followers.release();
        this.backdrop.release();
        this.surroundings.release();
        this.renderer.dispose();
    }

    /** @internal */
    appearanceSetting(): Appearance {
        return this.appearance;
    }

    /** @internal */
    prefersDark(): boolean {
        return this.dark;
    }

    /** @internal Extended-range share of the built-in materials (0 in standard range). */
    rangeShare(): number {
        return this.share;
    }

    /** @internal */
    accentColour(): Rgb {
        return this.accent;
    }

    /** @internal An item fading out before it is removed. */
    leave(it: GlassItem): void {
        this.leaving.push(it);
    }

    /** @internal An item gone at once. */
    forget(it: GlassItem): void {
        const i = this.items.indexOf(it);
        if (i >= 0) this.items.splice(i, 1);
    }

    /** @internal */
    watch(f: Follower): void {
        this.followers.add(f);
        this.reorder = true;
        this.measure = true;
        this.update();
    }

    /** @internal */
    unwatch(f: Follower): void {
        this.followers.remove(f);
    }

    private tick(now: number): void {
        this.frameId = 0;
        if (this.destroyed || this.lost) return;
        const fs = this.followers, live = this.backdrop.live;
        if ((this.measure || fs.everyFrame) && fs.size > 0) { this.measure = false; fs.measure(this.canvas); }
        if (this.reorder) this.order();
        if (live) this.upload();
        let more = this.renderer.render(now);
        const lv = this.leaving;
        for (let i = 0; i < lv.length; i++) {
            const it = lv[i] as GlassItem;
            if (this.renderer.getPresence(it.handle) > 0) continue;
            it.drop();
            this.forget(it);
            lv[i] = lv[lv.length - 1] as GlassItem; lv.pop(); i--;
            more = true;
        }
        if (lv.length > 0) more = true;
        // The scheme each glass shows; small adaptive glass changes it with the backdrop.
        const its = this.items;
        for (let i = 0; i < its.length; i++) (its[i] as GlassItem).sync();
        if (more || live || fs.everyFrame) this.update();
    }

    // Draw items that follow elements in document order (nested boxes draw over their parents), above coordinate-based
    // items.
    private order(): void {
        this.reorder = false;
        const list: GlassItem[] = [], keys: Element[] = [];
        for (const it of this.items) {
            const a = it.anchor();
            if (a === null || !it.alive) continue;
            let j = list.length;
            list.push(it); keys.push(a);
            while (j > 0 && ((keys[j - 1] as Element).compareDocumentPosition(a) & 2) !== 0) {
                list[j] = list[j - 1] as GlassItem; keys[j] = keys[j - 1] as Element; j--;
            }
            list[j] = it; keys[j] = a;
        }
        for (const it of list) this.renderer.raise(it.handle);
    }

    private setSize(w: number, h: number, ratio: number): void {
        if (w === this.pixelWidth && h === this.pixelHeight && ratio === this.ratio) return;
        this.pixelWidth = w; this.pixelHeight = h; this.ratio = ratio;
        if (this.canvas.width !== w) this.canvas.width = w;
        if (this.canvas.height !== h) this.canvas.height = h;
        this.renderer.resize(w, h, ratio);
        this.upload();
        this.measure = true;
        this.update();
    }

    private watchResolution(): void {
        if (this.resolutionQuery !== null) this.resolutionQuery.removeEventListener("change", this.onResolution);
        this.resolutionQuery = typeof matchMedia === "function" && typeof devicePixelRatio === "number"
            ? matchMedia("(resolution: " + devicePixelRatio + "dppx)") : null;
        if (this.resolutionQuery !== null) this.resolutionQuery.addEventListener("change", this.onResolution);
    }

    // The device or page changed a value followed by an "auto" setting.
    private surroundingsChanged(): void {
        if (this.destroyed) return;
        const dark = this.surroundings.dark;
        if (dark !== this.dark) {
            this.dark = dark;
            for (const it of this.items) if (it.automatic()) it.restyle();
            this.update();
        }
        this.applyEnvironment();
        if (this.range === "auto") this.applyRange();
    }

    // Pass the surroundings to the renderer and rebuild described materials for them.
    private applyEnvironment(): void {
        const bits = this.surroundings.bits(this.env);
        if (bits === this.envBits) return;
        this.envBits = bits;
        this.renderer.setEnvironment(bits);
        for (const it of this.items) if (it.described()) it.restyle();
        this.update();
    }

    // Update the renderer and canvas output range, then rebuild described materials for it.
    private applyRange(): void {
        const want = this.range === "auto" ? this.surroundings.highRange : this.range;
        const on = this.renderer.setExtendedRange(want, this.headroom), share = on ? headroomShare(this.headroom) : 0;
        this.showRange(on);
        if (on !== this.extended || share !== this.share) {
            this.extended = on; this.share = share;
            for (const it of this.items) if (it.described()) it.restyle();
        }
        this.update();
    }

    // Let the canvas show values above standard white where the browser supports it.
    private showRange(on: boolean): void {
        if (on === this.rangeShown) return;
        this.rangeShown = on;
        const c: RangeCanvas = this.canvas;
        if (typeof c.configureHighDynamicRange === "function") c.configureHighDynamicRange({ mode: on ? "extended" : "default" });
    }

    private whenLost(event: Event): void {
        // Without this, the browser does not restore the context.
        event.preventDefault();
        this.lost = true;
        if (this.frameId !== 0) { cancelAnimationFrame(this.frameId); this.frameId = 0; }
        const f = this.lostCallback;
        if (f !== null) f();
    }

    private whenRestored(): void {
        if (this.destroyed) return;
        const back = this.renderer.restore();
        this.error = back.ok ? "" : back.error;
        if (back.ok) {
            this.lost = false;
            this.update();
        }
        const f = this.restoredCallback;
        if (f !== null) f(this.error);
    }

    private upload(): void {
        this.backdrop.upload(this.renderer, this.pixelWidth, this.pixelHeight);
    }
}

/**
 * Put glass on a canvas: create a WebGL2 context and renderer, size the canvas to its displayed size, draw when anything
 * changes, and rebuild after context restoration.
 * @returns The glass, or why the canvas cannot be used.
 */
export function createGlass(canvas: HTMLCanvasElement, options: GlassOptions = {}): Result<Glass> {
    // Extended-range rendering needs a half-float drawing buffer with an alpha channel; the glass remains opaque.
    const alpha = options.extendedRange !== undefined && options.extendedRange !== false;
    const gl = canvas.getContext("webgl2", { antialias: false, alpha, depth: false, stencil: false, premultipliedAlpha: true });
    if (gl === null) return err("WebGL2 is not available");
    const made = Renderer.create(gl);
    if (!made.ok) return made;
    return ok(new Glass(canvas, made.value, options));
}
