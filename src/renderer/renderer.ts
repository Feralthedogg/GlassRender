/**
 * @file renderer.ts
 * @brief WebGL2 implementation of the public renderer API.
 */

import {
    BLOCK_BYTES, type BackdropPixels, type CornerKind, DEFAULT_CHROMATIC_ABERRATION, MAX_MEMBERS, MEMBER_BOX, MEMBER_FIELD, MEMBER_UNEVEN, type RowOrder, ROWS_TOP_DOWN,
    type Scheme, SCHEME_DARK, type Stacking, STACKING_EXACT, UNION_BYTES
} from "../layout.js";
import { PRESET_CLEAR, PRESET_COUNT, PRESET_STANDARD } from "../preset.js";
import { err, ok, type Result } from "../result.js";
import {
    A, ADAPT_LIVE, ADAPT_OFF, F, G, GEOM_BOX, GEOM_FIELD, GEOM_UNEVEN, GEOM_UNION, MATERIAL_DARK, MATERIAL_LIGHT, MAXP,
    MB, MMF, R, RGBA16F, RGBA8
} from "./lanes.js";
import { LAST_ERROR, openShared, type Shared } from "./shared.js";
import { Frame } from "./frame.js";
import { displayHeadroom, edrFactor, hdrScaleFits, resolveDisplayHeadroom, surfaceFactor, type DisplayBrightness } from "../hdr.js";

export { LAST_ERROR };

function chromaticValue(value: number): number {
    return Number.isFinite(value) ? value < 0 ? 0 : value > 1 ? 1 : value : DEFAULT_CHROMATIC_ABERRATION;
}

/**
 * @brief Glass renderer bound to one WebGL2 context.
 * @details Shapes live in numbered slots; every call takes plain numbers so the per-frame path
 * stays allocation free. Create it with `createRenderer`.
 */
export class Renderer extends Frame {
    private constructor(gl: WebGL2RenderingContext, sh: Shared, strideBytes: number, ustrideBytes: number, maxTex: number) {
        super(gl, sh, strideBytes, ustrideBytes, maxTex);
    }

    /**
     * @brief Build a renderer: compiles the pass programs and creates the shared GPU objects.
     * @returns The renderer, or the reason the context cannot be used.
     */
    static create(gl: WebGL2RenderingContext): Result<Renderer> {
        if (gl.isContextLost()) return err("the context is lost");
        const sh = openShared(gl, 16);
        if (typeof sh === "string") return err(sh);
        const align = gl.getParameter(0x8a34) as number, limit = gl.getParameter(0x0d33) as number;
        return ok(new Renderer(gl, sh, Math.ceil(BLOCK_BYTES / align) * align, Math.ceil(UNION_BYTES / align) * align, limit < 8192 ? limit : 8192));
    }

    /**
     * @brief Make every GPU object again after the context was lost and restored (the
     * `webglcontextrestored` event): pass and glass programs, the backdrop copy, mask fields and
     * blur pyramids.
     * @details Shapes, handles and materials stay as they were. A backdrop texture given with
     * `setBackdropTexture` belongs to the caller: give it again afterwards.
     * @returns 0, or why the context cannot be used yet.
     */
    restore(): Result<number> {
        const gl = this.gl;
        if (gl.isContextLost()) return err("the context is still lost");
        // Lost-context objects are already invalid; clear references without deleting them.
        this.programs.clear(); this.progs.fill(null); this.kit.fill(null); this.kitLoc.fill(null);
        this.dropRim(false);
        this.dropGroup(false);
        this.dropTintMask(false);
        this.dropTint(false);
        this.pageTex.fill(null); this.pageFbo.fill(null); this.pageDim.fill(0); this.pages = 0; this.shelfPage = -1;
        this.fields.fill(null); this.masks.fill(null); this.mfields.fill(null); this.mmasks.fill(null);
        this.sceneTex = null; this.copyTex = null; this.sceneFbo = null; this.copyFbo = null; this.bothFbo = null;
        this.destinationTex = null; this.destinationFbo = null;
        this.sceneW = 0; this.sceneH = 0;
        this.sync = null; this.pendCount = 0;
        this.extended = false;
        const sh = openShared(gl, this.lumaCap);
        if (typeof sh === "string") return err(sh);
        this.adopt(sh);
        this.source = sh.backdrop;
        const src = this.backdropSource;
        if (src !== null) this.setBackdropSource(src);
        else if (this.backdropPixels !== null) this.uploadBackdropPixels(this.backdropPixels);
        else if (!this.topDown) { this.topDown = true; this.frameDirty = true; }
        if (this.wantExtended) this.applyRange();
        this.uboBytes = 0; this.uuboBytes = 0;
        const n = this.capacity, rg = this.reg;
        for (let slot = 0; slot < n; slot++) {
            if (this.kinds[slot] === 0) continue;
            rg[slot * R + 14] = 0; rg[slot * R + 8] = 1;
            if (this.geoms[slot] === GEOM_FIELD) {
                const t = gl.createTexture() as WebGLTexture | null, ms = this.sources[slot] as TexImageSource | null;
                if (t !== null && ms !== null) { this.masks[slot] = t; this.loadMask(this.fdim, slot * F, t, ms); }
                this.fdim[slot * F + 2] = 0; this.fdim[slot * F + 3] = 0;
            } else if (this.geoms[slot] === GEOM_UNION) {
                for (let k = 0; k < MMF; k++) {
                    const at = slot * MMF + k, ms = this.msources[at] as TexImageSource | null;
                    if (ms === null) continue;
                    const t = gl.createTexture() as WebGLTexture | null;
                    if (t !== null) { this.mmasks[at] = t; this.loadMask(this.mfdim, at * F, t, ms); }
                    this.mfdim[at * F + 2] = 0; this.mfdim[at * F + 3] = 0;
                }
            }
            if (this.st[slot] === ADAPT_LIVE) this.lumaDirty[slot] = 1;
            this.refresh(slot);
        }
        this.maskDirty = true;
        this.frameDirty = true;
        this.backdropDirty = true;
        this.layoutDirty = true;
        this.stale = true;
        return ok(0);
    }

    /** @brief Set the target size in device pixels and the device pixels per point. */
    resize(width: number, height: number, scale: number): void {
        this.width = width > 1 ? width | 0 : 1;
        this.height = height > 1 ? height | 0 : 1;
        this.scale = scale > 0 ? scale : 1;
        const fr = this.frame, s = this.scale, rescaled = fr[0] !== Math.fround(s);
        fr[0] = s; fr[1] = 1 / s; fr[6] = 1 / this.width; fr[7] = 1 / this.height;
        fr[8] = this.width; fr[9] = this.height;
        if (this.wantExtended) this.applyRange();
        const n = this.capacity;
        // materials follow the screen scale (device-pixel bands, backdrop scale), geometry follows the size
        for (let i = 0; i < n; i++) {
            const k = this.kinds[i] as number;
            if (k === 0) continue;
            if (rescaled) this.refresh(i); else this.finish(i);
        }
        this.frameDirty = true;
        this.backdropDirty = true;
    }

    /**
     * @brief Draw in extended range: a half-float drawing buffer whose values may pass 1 (the glass
     * is computed in extended range; the face limit and the rim light limit stay).
     * @details The context must have been created with `alpha: true` (browsers give a half-float
     * buffer only then; the renderer keeps it opaque), and the page must let the canvas show such
     * values, for example with `configureHighDynamicRange({ mode: "extended" })` where the browser
     * has it.
     * @param on Extended range on or off.
     * @param headroom Current brightness multiplier supplied by the host, finite and at least 1;
     * from 1.2 up the built-in materials drop the flat shadow part and the darker rim band
     * of standard output.
     * @returns True when the drawing buffer holds extended-range values now.
     */
    setExtendedRange(on: boolean, headroom: number): boolean {
        this.wantExtended = on;
        this.headroom = displayHeadroom(headroom);
        this.applyRange();
        return this.extended;
    }

    /**
     * @brief Resolve supplied brightness state without changing the requested output range.
     * @returns The display multiplier, or an error that preserves the current configuration.
     */
    setDisplayBrightness(state: DisplayBrightness): Result<number> {
        const resolved = resolveDisplayHeadroom(state);
        if (!resolved.ok) return resolved;
        this.headroom = resolved.value;
        this.applyRange();
        return resolved;
    }

    /**
     * @brief Supply explicit color scales from an external rendering surface.
     * @details These are independent of display headroom. Identity (1, 1, 1) is the default; the
     * browser does not discover these surface coefficients.
     * @param contextScale Positive context color multiplier.
     * @param factor Surface EDR factor; 0 selects the default 1, negative values become 0 and
     * values above 1 become 1.
     * @param stateFactor Optional nonnegative state multiplier applied to the surface factor
     * before EDR resolve (default 1). It does not select context-scale normalization.
     * @returns Whether scale normalization is active now, or an error for nonfinite/invalid inputs.
     */
    setSurfaceScale(contextScale: number, factor: number, stateFactor = 1): Result<boolean> {
        if (!Number.isFinite(contextScale) || !hdrScaleFits(contextScale) || !Number.isFinite(factor)
            || !Number.isFinite(stateFactor) || stateFactor < 0 || !Number.isFinite(Math.fround(stateFactor))) {
            return err("positive Float32 context scale, finite surface factor and nonnegative finite state multiplier required");
        }
        const s = Math.fround(contextScale), surface = surfaceFactor(factor), state = Math.fround(stateFactor);
        if (!Number.isFinite(edrFactor(surface, state, state !== 1))) return err("finite EDR shader coefficient required");
        if (s !== this.contextScale || surface !== this.surfaceScale || state !== this.surfaceStateFactor) {
            this.contextScale = s; this.surfaceScale = surface; this.surfaceStateFactor = state; this.applySurfaceScale();
        }
        return ok((this.frame[15] as number) !== 0);
    }

    /**
     * @brief Upload an image, canvas or video frame as the backdrop.
     * @details It must have the target size; it is drawn as is and sampled by the glass. The
     * renderer keeps its own copy: call again when the source changes.
     */
    setBackdropSource(src: TexImageSource): void {
        const gl = this.gl;
        gl.activeTexture(0x84c1);
        gl.bindTexture(0x0de1, this.backdrop);
        gl.texImage2D(0x0de1, 0, RGBA8, 0x1908, 0x1401, src);
        this.source = this.backdrop;
        this.backdropSource = src;
        this.backdropPixels = null;
        this.backdropDirty = true;
        if (!this.topDown) { this.topDown = true; this.frameDirty = true; }
    }

    /**
     * @brief Upload target-sized encoded extended-sRGB premultiplied pixels without an 8-bit copy.
     * @details RGB values must fit finite binary16; alpha is 0..1 and zero alpha has zero RGB.
     * Retains a snapshot for context restoration. Give new target-sized pixels after resizing.
     * Row order defaults to top down; no implicit color conversion or premultiplication occurs.
     * @returns 0 on upload, or a validation/context error. Invalid data preserves the prior source.
     */
    setBackdropPixels(pixels: BackdropPixels): Result<number> {
        const { width, height, data } = pixels, rows = pixels.rows ?? ROWS_TOP_DOWN;
        if (this.gl.isContextLost()) return err("the context is lost");
        if (!Number.isInteger(width) || !Number.isInteger(height) || width !== this.width || height !== this.height
            || width < 1 || height < 1 || width > this.maxTex || height > this.maxTex) {
            return err("backdrop pixels must match the target pixel dimensions");
        }
        if (!(data instanceof Float32Array) && !(data instanceof Uint16Array)) return err("Float32Array or binary16 Uint16Array required");
        if (data.length !== width * height * 4) return err("backdrop pixels require exactly width * height * 4 RGBA components");
        if (rows !== 0 && rows !== 1) return err("invalid backdrop row order");
        const halfWords = data instanceof Uint16Array;
        // Copy before validation and before changing GPU state. Use the built-in constructor so
        // caller overrides of slice/species cannot replace the validated upload buffer.
        const snapshot = halfWords ? new Uint16Array(data) : new Float32Array(data);
        for (let i = 0; i < snapshot.length; i++) {
            const v = snapshot[i] as number;
            if (halfWords ? (v & 0x7c00) === 0x7c00 : !Number.isFinite(v) || Math.abs(v) > 65504) {
                return err("backdrop RGB and alpha must fit finite binary16 values");
            }
            if ((i & 3) === 3) {
                if (halfWords ? ((v & 0x7fff) > 0x3c00 || (v > 0x8000)) : v < 0 || v > 1) return err("backdrop alpha must be in 0..1");
                const zeroAlpha = halfWords ? (v & 0x7fff) === 0 : v === 0;
                if (zeroAlpha && ((halfWords ? (snapshot[i - 3] as number) & 0x7fff : snapshot[i - 3]) !== 0
                    || (halfWords ? (snapshot[i - 2] as number) & 0x7fff : snapshot[i - 2]) !== 0
                    || (halfWords ? (snapshot[i - 1] as number) & 0x7fff : snapshot[i - 1]) !== 0)) return err("premultiplied zero-alpha pixels require zero RGB");
            }
        }
        this.uploadBackdropPixels({ width, height, data: snapshot, rows });
        return ok(0);
    }

    /** @brief Remove the source and restore the empty backdrop, including after context loss. */
    clearBackdrop(): void {
        this.backdropSource = null; this.backdropPixels = null; this.source = this.backdrop;
        if (!this.gl.isContextLost()) {
            const gl = this.gl;
            const unpack = gl.getParameter(0x88ef) as WebGLBuffer | null;
            gl.activeTexture(0x84c1); gl.bindTexture(0x0de1, this.backdrop);
            // Null allocation initializes the four channels to zero, as in openShared().
            gl.bindBuffer(0x88ec, null);
            gl.texImage2D(0x0de1, 0, RGBA8, 1, 1, 0, 0x1908, 0x1401, null);
            gl.bindBuffer(0x88ec, unpack);
        }
        this.backdropDirty = true;
        if (!this.topDown) { this.topDown = true; this.frameDirty = true; }
    }

    private uploadBackdropPixels(pixels: BackdropPixels): void {
        const gl = this.gl, { width, height, data } = pixels;
        const alignment = gl.getParameter(0x0cf5) as number, rowLength = gl.getParameter(0x0cf2) as number;
        const skipRows = gl.getParameter(0x0cf3) as number, skipPixels = gl.getParameter(0x0cf4) as number;
        const flip = gl.getParameter(0x9240) as boolean, premultiply = gl.getParameter(0x9241) as boolean;
        const unpack = gl.getParameter(0x88ef) as WebGLBuffer | null;
        gl.activeTexture(0x84c1); gl.bindTexture(0x0de1, this.backdrop);
        gl.bindBuffer(0x88ec, null);
        gl.pixelStorei(0x0cf5, 1); gl.pixelStorei(0x0cf2, 0); gl.pixelStorei(0x0cf3, 0); gl.pixelStorei(0x0cf4, 0);
        gl.pixelStorei(0x9240, 0); gl.pixelStorei(0x9241, 0);
        // The dimensions and owned native buffer have already passed validation. WebGL reports
        // upload/context errors through its error state; restore the caller's unpack settings next.
        gl.texImage2D(0x0de1, 0, RGBA16F, width, height, 0, 0x1908, data instanceof Uint16Array ? 0x140b : 0x1406, data);
        gl.pixelStorei(0x0cf5, alignment); gl.pixelStorei(0x0cf2, rowLength); gl.pixelStorei(0x0cf3, skipRows); gl.pixelStorei(0x0cf4, skipPixels);
        gl.pixelStorei(0x9240, flip ? 1 : 0); gl.pixelStorei(0x9241, premultiply ? 1 : 0); gl.bindBuffer(0x88ec, unpack);
        this.source = this.backdrop; this.backdropSource = null; this.backdropPixels = pixels; this.backdropDirty = true;
        const topDown = (pixels.rows ?? ROWS_TOP_DOWN) === ROWS_TOP_DOWN;
        if (topDown !== this.topDown) { this.topDown = topDown; this.frameDirty = true; }
    }

    /**
     * @brief Use a target-sized texture owned by the caller as the backdrop.
     * @details The renderer reads it whenever it has to rebuild something; call `markBackdropDirty`
     * after each change of its content.
     * @param rows Row order of the texture: `ROWS_TOP_DOWN` for DOM uploads, `ROWS_BOTTOM_UP` for
     * framebuffer renders.
     */
    setBackdropTexture(texture: WebGLTexture, rows: RowOrder): void {
        const gl = this.gl, topDown = rows === ROWS_TOP_DOWN;
        gl.activeTexture(0x84c1);
        gl.bindTexture(0x0de1, texture);
        gl.texParameteri(0x0de1, 0x2801, 0x2601); gl.texParameteri(0x0de1, 0x2800, 0x2601);
        gl.texParameteri(0x0de1, 0x2802, 0x812f); gl.texParameteri(0x0de1, 0x2803, 0x812f);
        this.source = texture;
        this.backdropSource = null;
        this.backdropPixels = null;
        this.backdropDirty = true;
        if (this.topDown !== topDown) { this.topDown = topDown; this.frameDirty = true; }
    }

    /**
     * @brief Tell the renderer the content of the backdrop texture changed, so the blur pyramids
     * are rebuilt on the next render.
     */
    markBackdropDirty(): void {
        this.backdropDirty = true;
    }

    /**
     * @brief Add a shape with the size-dependent standard material.
     * @param x Left edge in points.
     * @param y Top edge in points (y down).
     * @param w Width.
     * @param h Height.
     * @param radius Corner radius in points (clamped to half the short side).
     * @param corner Corner construction.
     * @param scheme Standard material for dark or light surroundings.
     * @returns Handle of the shape. It stops working once the shape is removed: calls with it are
     * ignored and never reach a shape added later. Later shapes are drawn over earlier ones and see
     * them through the glass.
     */
    addShape(x: number, y: number, w: number, h: number, radius: number, corner: CornerKind, scheme: Scheme): number {
        const slot = this.take(), g = this.geo, b = slot * G;
        g[b] = x; g[b + 1] = y; g[b + 2] = w; g[b + 3] = h; g[b + 4] = radius; g[b + 5] = corner;
        return this.init(slot, scheme === SCHEME_DARK ? MATERIAL_DARK : MATERIAL_LIGHT, GEOM_BOX);
    }

    /**
     * @brief Move or resize a shape; a built-in material follows the new short side.
     * @details Corner radii become equal again.
     */
    setShape(handle: number, x: number, y: number, w: number, h: number, radius: number): void {
        const slot = this.slotOf(handle);
        if (slot < 0) return;
        const g = this.geo, b = slot * G;
        g[b] = x; g[b + 1] = y; g[b + 2] = w; g[b + 3] = h; g[b + 4] = radius;
        if (this.geoms[slot] === GEOM_UNEVEN) this.geoms[slot] = GEOM_BOX;
        this.refresh(slot);
    }

    /**
     * @brief Give each corner of a shape its own radius, in points.
     * @details The radii shrink together when two of them do not fit on an edge.
     */
    setCorners(handle: number, topLeft: number, topRight: number, bottomRight: number, bottomLeft: number): void {
        const slot = this.slotOf(handle);
        if (slot < 0 || (this.geoms[slot] !== GEOM_BOX && this.geoms[slot] !== GEOM_UNEVEN)) return;
        const g = this.geo, b = slot * G;
        g[b + 12] = topLeft > 0 ? topLeft : 0; g[b + 13] = topRight > 0 ? topRight : 0;
        g[b + 14] = bottomRight > 0 ? bottomRight : 0; g[b + 15] = bottomLeft > 0 ? bottomLeft : 0;
        this.geoms[slot] = GEOM_UNEVEN;
        this.finish(slot);
    }

    /**
     * @brief Change how the corners of a shape are built (for a union: of every member with
     * corners).
     */
    setCorner(handle: number, corner: CornerKind): void {
        const slot = this.slotOf(handle);
        if (slot < 0) return;
        this.geo[slot * G + 5] = corner;
        if (this.geoms[slot] === GEOM_UNION) {
            const m = this.members, mo = slot * MAX_MEMBERS * MB, n = this.ucount[slot] as number;
            for (let i = 0; i < n; i++) if (m[mo + i * MB + 6] !== MEMBER_FIELD) m[mo + i * MB + 5] = corner;
        }
        this.refresh(slot);
    }

    /** @brief Give a shape the standard material for dark or light surroundings. */
    setStandard(handle: number, scheme: Scheme): void {
        this.setPreset(handle, PRESET_STANDARD, scheme);
    }

    /**
     * @brief Give a shape the clear material: light blur, strong refraction, no shadow, backdrop
     * captured at half resolution.
     * @details The scheme selects the rim light colors for dark or light surroundings.
     */
    setClear(handle: number, scheme: Scheme): void {
        this.setPreset(handle, PRESET_CLEAR, scheme);
    }

    /**
     * @brief Give a shape a preset: one of the built-in materials (`PRESET_*`), each with its own
     * laws over the size, the surroundings and, for small glass, the backdrop luminance.
     * @details An unknown number is ignored.
     */
    setPreset(handle: number, preset: number, scheme: Scheme): void {
        const slot = this.slotOf(handle);
        if (slot < 0 || !(preset >= 0 && preset < PRESET_COUNT)) return;
        this.kinds[slot] = scheme === SCHEME_DARK ? MATERIAL_DARK : MATERIAL_LIGHT;
        this.presets[slot] = preset | 0;
        this.st[slot] = ADAPT_OFF;
        this.refresh(slot);
    }

    /** @brief Preset number of a shape, or -1 for a dead handle. */
    getPreset(handle: number): number {
        const slot = this.slotOf(handle);
        return slot < 0 ? -1 : this.presets[slot] as number;
    }

    /**
     * @brief Lay a color over the glass of a shape: a gradient over the glass luminance through two
     * anchors of the tint hue.
     * @details Materials use the rule of their current scheme. A strength of 0 removes the layer.
     * @param r Red, 0..1.
     * @param g Green, 0..1.
     * @param b Blue, 0..1.
     * @param strength Strength, 0..1.
     */
    setTint(handle: number, r: number, g: number, b: number, strength: number): void {
        const slot = this.slotOf(handle);
        if (slot < 0) return;
        const t = this.tints, o = slot * 4;
        t[o] = r; t[o + 1] = g; t[o + 2] = b; t[o + 3] = strength > 0 ? strength : 0;
        this.refresh(slot);
    }

    /**
     * @brief Change the default color-separation multiplier for shapes that inherit it.
     * @details Clamps finite values to 0..1; nonfinite values restore the built-in default.
     */
    setDefaultChromaticAberration(strength: number): void {
        const value = chromaticValue(strength);
        if (value === this.chromaticDefault) return;
        this.chromaticDefault = value;
        for (let slot = 0; slot < this.capacity; slot++) {
            if (this.kinds[slot] !== 0 && (this.chromatic[slot] as number) < 0) this.refresh(slot);
        }
    }

    /** @brief Current default color-separation multiplier. */
    getDefaultChromaticAberration(): number {
        return this.chromaticDefault;
    }

    /**
     * @brief Override one shape's color separation without changing its other optical effects.
     * @details 0 disables separation, 1 preserves the preset distance, and null inherits the default.
     * Finite numbers are clamped to 0..1; nonfinite numbers use the built-in default.
     */
    setChromaticAberration(handle: number, strength: number | null): void {
        const slot = this.slotOf(handle);
        if (slot < 0) return;
        const value = strength === null ? -1 : chromaticValue(strength);
        if (value === this.chromatic[slot]) return;
        this.chromatic[slot] = value;
        this.refresh(slot);
    }

    /** @brief Effective color-separation multiplier, or -1 for a dead handle. */
    getChromaticAberration(handle: number): number {
        const slot = this.slotOf(handle);
        if (slot < 0) return -1;
        const value = this.chromatic[slot] as number;
        return value < 0 ? this.chromaticDefault : value;
    }

    /**
     * @brief Draw a shape with its shadow at an opacity of 0..1 over what lies below it (1 by
     * default).
     */
    setOpacity(handle: number, opacity: number): void {
        const slot = this.slotOf(handle);
        if (slot < 0) return;
        this.geo[slot * G + 21] = opacity < 0 ? 0 : opacity > 1 ? 1 : opacity;
        this.finish(slot);
    }

    /**
     * @brief Lay a flat grey over the finished glass inside the shape, above the rim lights: the
     * mark of a pressed control (white at a strength of 0.08 on dark glass, black at 0.08 on light
     * glass).
     * @details A strength of 0 removes it.
     * @param level Grey level, 0 black to 1 white.
     * @param strength Strength, 0..1.
     */
    setVeil(handle: number, level: number, strength: number): void {
        const slot = this.slotOf(handle);
        if (slot < 0) return;
        const g = this.geo, b = slot * G;
        g[b + 19] = level < 0 ? 0 : level > 1 ? 1 : level; g[b + 20] = strength < 0 ? 0 : strength > 1 ? 1 : strength;
        this.finish(slot);
    }

    /**
     * @brief Set how far a shape has materialised, at once: 1 is the shape as described, 0 hides it
     * (it keeps its slot and its GPU objects and is not drawn).
     * @details In between, the material is blended in from plain glass (no blur, lens, tone, glow
     * or shadow; the rim lights stay) and the frame is larger by 8 points times (1 - presence) on
     * every side (a mask shape keeps its frame).
     */
    setPresence(handle: number, presence: number): void {
        const slot = this.slotOf(handle);
        if (slot < 0) return;
        const a = this.ad, b = slot * A, v = presence < 0 ? 0 : presence > 1 ? 1 : presence;
        a[b + 8] = v; a[b + 9] = 0; a[b + 10] = v;
        this.refresh(slot);
    }

    /**
     * @brief Let a shape appear (presence 1) or disappear (0) over time: the presence follows a
     * critically damped spring of half a second and `render` reports true until it has settled.
     */
    animatePresence(handle: number, presence: number): void {
        const slot = this.slotOf(handle);
        if (slot < 0) return;
        this.ad[slot * A + 10] = presence < 0 ? 0 : presence > 1 ? 1 : presence;
        this.stale = true;
    }

    /**
     * @brief Add a union: several rounded rectangles drawn as one piece of glass whose outlines
     * flow into each other.
     * @details It is a shape (material, tint and removal work as for any shape); it shows once it
     * has a member.
     * @param spacing Distance in points over which neighboring members merge.
     * @param scheme Standard material for dark or light surroundings.
     * @returns Handle of the union.
     */
    addUnion(spacing: number, scheme: Scheme): number {
        const slot = this.take(), g = this.geo, b = slot * G;
        g[b + 16] = spacing > 0 ? spacing : 0;
        this.ucount[slot] = 0;
        return this.init(slot, scheme === SCHEME_DARK ? MATERIAL_DARK : MATERIAL_LIGHT, GEOM_UNION);
    }

    /**
     * @brief Add a rounded rectangle to a union (at most 16 members).
     * @returns Index of the member inside the union, or -1 when the handle is not a live union or
     * it is full.
     */
    addMember(handle: number, x: number, y: number, w: number, h: number, radius: number, corner: CornerKind): number {
        const slot = this.slotOf(handle);
        if (slot < 0 || this.geoms[slot] !== GEOM_UNION) return -1;
        const n = this.ucount[slot] as number;
        if (n >= MAX_MEMBERS) return -1;
        const m = this.members, o = (slot * MAX_MEMBERS + n) * MB;
        m.fill(0, o, o + MB);
        m[o] = x; m[o + 1] = y; m[o + 2] = w; m[o + 3] = h; m[o + 4] = radius; m[o + 5] = corner; m[o + 6] = MEMBER_BOX;
        this.ucount[slot] = n + 1;
        this.refresh(slot);
        return n;
    }

    /**
     * @brief Add a member of any outline to a union from a coverage mask (alpha channel, stretched
     * over the frame); at most 4 per union.
     * @details It merges with its neighbours like any member.
     * @returns Index of the member inside the union, or why it cannot be added.
     */
    addMemberMask(handle: number, source: TexImageSource, x: number, y: number, w: number, h: number): Result<number> {
        const gl = this.gl, slot = this.slotOf(handle);
        if (slot < 0 || this.geoms[slot] !== GEOM_UNION) return err("the handle is not a live union");
        const n = this.ucount[slot] as number;
        if (n >= MAX_MEMBERS) return err("the union is full (" + MAX_MEMBERS + " members)");
        if (!this.halfFloat) return err("masks need float render targets (EXT_color_buffer_float)");
        const k = this.freeField(slot);
        if (k < 0) return err("a union holds at most " + MMF + " mask members");
        if (!this.openKit()) return err("field program failed to compile: " + (LAST_ERROR[0] as string));
        const t = gl.createTexture() as WebGLTexture | null;
        if (t === null) return err("context cannot create objects (lost?)");
        const at = slot * MMF + k, m = this.members, o = (slot * MAX_MEMBERS + n) * MB;
        this.mmasks[at] = t;
        this.msources[at] = source;
        this.mfdim.fill(0, at * F, at * F + F);
        this.loadMask(this.mfdim, at * F, t, source);
        m.fill(0, o, o + MB);
        m[o] = x; m[o + 1] = y; m[o + 2] = w; m[o + 3] = h; m[o + 6] = MEMBER_FIELD; m[o + 7] = k;
        this.ucount[slot] = n + 1;
        this.refresh(slot);
        return ok(n);
    }

    /** @brief Replace the mask of a member added with `addMemberMask`. */
    setMemberMask(handle: number, index: number, source: TexImageSource): void {
        const slot = this.slotOf(handle);
        if (slot < 0 || this.geoms[slot] !== GEOM_UNION || index < 0 || index >= (this.ucount[slot] as number)) return;
        const o = (slot * MAX_MEMBERS + index) * MB, m = this.members;
        if (m[o + 6] !== MEMBER_FIELD) return;
        const at = slot * MMF + (m[o + 7] as number), t = this.mmasks[at] as WebGLTexture | null;
        if (t === null) return;
        this.msources[at] = source;
        this.loadMask(this.mfdim, at * F, t, source);
        this.mfdim[at * F + 2] = 0;
        this.maskDirty = true;
        this.stale = true;
    }

    /**
     * @brief Move or resize a member of a union.
     * @details A member with corners of its own gets one radius again; a mask member keeps its mask
     * (the radius is not used).
     */
    setMember(handle: number, index: number, x: number, y: number, w: number, h: number, radius: number): void {
        const slot = this.slotOf(handle);
        if (slot < 0 || this.geoms[slot] !== GEOM_UNION || index < 0 || index >= (this.ucount[slot] as number)) return;
        const m = this.members, o = (slot * MAX_MEMBERS + index) * MB;
        m[o] = x; m[o + 1] = y; m[o + 2] = w; m[o + 3] = h; m[o + 4] = radius;
        if (m[o + 6] === MEMBER_UNEVEN) m[o + 6] = MEMBER_BOX;
        this.refresh(slot);
    }

    /**
     * @brief Give each corner of a union member its own radius, in points (radii that do not fit on
     * an edge shrink together).
     * @details Mask members are left as they are.
     */
    setMemberCorners(handle: number, index: number, topLeft: number, topRight: number, bottomRight: number, bottomLeft: number): void {
        const slot = this.slotOf(handle);
        if (slot < 0 || this.geoms[slot] !== GEOM_UNION || index < 0 || index >= (this.ucount[slot] as number)) return;
        const m = this.members, o = (slot * MAX_MEMBERS + index) * MB;
        if (m[o + 6] === MEMBER_FIELD) return;
        m[o + 8] = topLeft > 0 ? topLeft : 0; m[o + 9] = topRight > 0 ? topRight : 0;
        m[o + 10] = bottomRight > 0 ? bottomRight : 0; m[o + 11] = bottomLeft > 0 ? bottomLeft : 0;
        m[o + 6] = MEMBER_UNEVEN;
        this.refresh(slot);
    }

    /** @brief Remove a member of a union; the last member takes its index. */
    removeMember(handle: number, index: number): void {
        const slot = this.slotOf(handle);
        if (slot < 0 || this.geoms[slot] !== GEOM_UNION) return;
        const n = this.ucount[slot] as number;
        if (index < 0 || index >= n) return;
        const m = this.members, o = (slot * MAX_MEMBERS + index) * MB, l = (slot * MAX_MEMBERS + n - 1) * MB;
        if (m[o + 6] === MEMBER_FIELD) this.dropMemberField(slot * MMF + (m[o + 7] as number));
        if (o !== l) m.copyWithin(o, l, l + MB);
        this.ucount[slot] = n - 1;
        this.refresh(slot);
    }

    /** @brief Set the merge distance of a union in points. */
    setSpacing(handle: number, spacing: number): void {
        const slot = this.slotOf(handle);
        if (slot < 0 || this.geoms[slot] !== GEOM_UNION) return;
        this.geo[slot * G + 16] = spacing > 0 ? spacing : 0;
        this.finish(slot);
    }

    /**
     * @brief Add a shape of any outline from a coverage mask (for example a canvas with the outline
     * filled).
     * @details The alpha channel of the mask is the coverage; the mask is stretched over the frame.
     * The distance field of the outline is rebuilt when the mask or the size of the frame changes,
     * not when the shape moves.
     * @param source Mask image.
     * @param x Left edge of the frame in points.
     * @param y Top edge in points.
     * @param w Width.
     * @param h Height.
     * @param scheme Standard material for dark or light surroundings.
     * @returns Handle of the shape, or why masks cannot be used on this context.
     */
    addMask(source: TexImageSource, x: number, y: number, w: number, h: number, scheme: Scheme): Result<number> {
        const gl = this.gl;
        if (!this.halfFloat) return err("masks need float render targets (EXT_color_buffer_float)");
        if (!this.openKit()) return err("field program failed to compile: " + (LAST_ERROR[0] as string));
        const t = gl.createTexture() as WebGLTexture | null;
        if (t === null) return err("context cannot create objects (lost?)");
        const slot = this.take(), g = this.geo, b = slot * G;
        g[b] = x; g[b + 1] = y; g[b + 2] = w; g[b + 3] = h;
        this.masks[slot] = t;
        this.sources[slot] = source;
        this.fdim.fill(0, slot * F, slot * F + F);
        this.loadMask(this.fdim, slot * F, t, source);
        return ok(this.init(slot, scheme === SCHEME_DARK ? MATERIAL_DARK : MATERIAL_LIGHT, GEOM_FIELD));
    }

    /** @brief Replace the mask of a shape added with `addMask`. */
    setMask(handle: number, source: TexImageSource): void {
        const slot = this.slotOf(handle);
        if (slot < 0 || this.geoms[slot] !== GEOM_FIELD) return;
        const t = this.masks[slot] as WebGLTexture | null;
        if (t === null) return;
        this.sources[slot] = source;
        this.loadMask(this.fdim, slot * F, t, source);
        this.fdim[slot * F + 2] = 0;
        this.maskDirty = true;
        this.stale = true;
    }

    /**
     * @brief Choose how shapes that lie over other shapes are drawn.
     * @param mode `STACKING_EXACT` (default): a shape refracts the glass below it; every layer of
     * overlap costs one more group of capture passes. `STACKING_FLAT`: every shape refracts the
     * backdrop only and all shapes are drawn in one batch.
     */
    setStacking(mode: Stacking): void {
        const flat = mode !== STACKING_EXACT;
        if (this.flat !== flat) { this.flat = flat; this.layoutDirty = true; this.stale = true; this.full = true; }
    }

    /**
     * @brief Resolve built-in materials again with the supplied `ENV_*` flags.
     * @details Inactive windows flatten the material; contrast uses outline rings. Reduced motion
     * removes interior refraction and increases blur.
     */
    setEnvironment(environment: number): void {
        const e = environment | 0;
        if (e === this.env) return;
        this.env = e;
        const n = this.capacity, kinds = this.kinds;
        for (let i = 0; i < n; i++) {
            const k = kinds[i] as number;
            if (k !== 0) this.refresh(i);
        }
        this.stale = true;
    }

    /** @brief The `ENV_*` bits set with `setEnvironment`. */
    getEnvironment(): number {
        return this.env;
    }

    /**
     * @brief Let a small built-in glass follow the backdrop luminance (default) or keep the fixed
     * tone of its scheme, as glass of a fixed size does.
     */
    setAdaptive(handle: number, adaptive: boolean): void {
        const slot = this.slotOf(handle);
        if (slot < 0) return;
        const v = adaptive ? 0 : 1;
        if (this.fixedTone[slot] === v) return;
        this.fixedTone[slot] = v;
        this.st[slot] = ADAPT_OFF;
        this.refresh(slot);
    }

    /**
     * @brief Scheme a built-in glass shows now: 0 dark, 1 light, between the two while an adaptive
     * glass changes over; -1 for a dead handle.
     * @details Content on the glass can follow it.
     */
    getScheme(handle: number): number {
        const slot = this.slotOf(handle);
        if (slot < 0) return -1;
        const kind = this.kinds[slot] as number;
        if (this.st[slot] === ADAPT_LIVE) return this.ad[slot * A + 2] as number;
        return kind === MATERIAL_DARK ? 0 : 1;
    }

    /**
     * @brief Current presence of a shape (0 hidden ..
     * @details 1 fully there), or -1 when its handle is dead.
     */
    getPresence(handle: number): number {
        const slot = this.slotOf(handle);
        return slot < 0 ? -1 : this.ad[slot * A + 8] as number;
    }

    /** @brief True while the shape of a handle exists (it has not been removed). */
    isAlive(handle: number): boolean {
        return this.slotOf(handle) >= 0;
    }

    /**
     * @brief Turn every rim light, by `radians` clockwise from where its material puts it (0 by
     * default).
     * @details It follows a moving light source, the way a device's tilt turns the highlights of
     * the glass on it.
     */
    setLightAngle(radians: number): void {
        const fr = this.frame, c = Math.cos(radians), s = Math.sin(radians);
        if (c - c !== 0 || (fr[10] === c && fr[11] === s)) return;
        fr[10] = c; fr[11] = s;
        this.frameDirty = true;
        this.stale = true;
    }

    /** @brief Draw a shape last, over every other shape. */
    raise(handle: number): void {
        const slot = this.slotOf(handle);
        if (slot < 0) return;
        const o = this.order, n = this.count;
        let j = 0;
        for (let i = 0; i < n; i++) { const v = o[i] as number; if (v !== slot) o[j++] = v; }
        if (j === n) return;
        o[j] = slot;
        this.full = true;
        this.layoutDirty = true;
        this.stale = true;
    }

    /**
     * @brief Remove a shape.
     * @details Its handle is dead from now on; the slot behind it may serve a shape added later.
     */
    removeShape(handle: number): void {
        const slot = this.slotOf(handle);
        if (slot < 0) return;
        this.keys[slot] = -1;
        this.draws[slot] = 0;
        this.progs[slot] = null;
        this.kinds[slot] = 0;
        this.st[slot] = ADAPT_OFF;
        this.reg[slot * R + 14] = 0;
        this.dropField(slot);
        for (let k = 0; k < MMF; k++) this.dropMemberField(slot * MMF + k);
        if (slot < this.free) this.free = slot;
        const o = this.order, n = this.count;
        let j = 0;
        for (let i = 0; i < n; i++) { const v = o[i] as number; if (v !== slot) o[j++] = v; }
        this.count = j;
        this.layoutDirty = true;
        this.full = true;
        this.stale = true;
    }

    /** @brief Release every GPU object the renderer created. */
    dispose(): void {
        const gl = this.gl;
        this.dropRim(true);
        this.dropGroup(true);
        this.dropTintMask(true);
        this.dropTint(true);
        for (let i = 0; i < MAXP; i++) this.dropPage(i);
        for (let i = 0; i < this.capacity; i++) this.dropField(i);
        for (let i = 0; i < this.capacity * MMF; i++) this.dropMemberField(i);
        for (let i = 0; i < this.kit.length; i++) { gl.deleteProgram(this.kit[i] as WebGLProgram | null); this.kit[i] = null; }
        this.dropScene();
        if (this.sync !== null) { gl.deleteSync(this.sync); this.sync = null; }
        gl.deleteBuffer(this.ubo); gl.deleteBuffer(this.frameUbo); gl.deleteBuffer(this.unionUbo); gl.deleteBuffer(this.instBuf);
        gl.deleteBuffer(this.lumaBuf); gl.deleteBuffer(this.pbo);
        gl.deleteTexture(this.backdrop); gl.deleteTexture(this.lumaTex); gl.deleteFramebuffer(this.lumaFbo);
        gl.deleteProgram(this.present); gl.deleteProgram(this.split); gl.deleteProgram(this.capture); gl.deleteProgram(this.down); gl.deleteProgram(this.first);
        gl.deleteProgram(this.first8); gl.deleteProgram(this.down8);
        gl.deleteProgram(this.luma);
        gl.deleteVertexArray(this.vao); gl.deleteVertexArray(this.buildVao); gl.deleteVertexArray(this.lumaVao);
        for (const p of this.programs.values()) gl.deleteProgram(p);
        this.programs.clear();
        this.progs.fill(null);
    }
}

/**
 * @brief Create a renderer for a WebGL2 context.
 * @returns The renderer, or the reason the context cannot be used.
 */
export function createRenderer(gl: WebGL2RenderingContext): Result<Renderer> {
    return Renderer.create(gl);
}
