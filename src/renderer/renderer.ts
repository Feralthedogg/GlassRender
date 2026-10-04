// WebGL2 implementation of the public renderer API.
import {
    BLOCK_BYTES, type CornerKind, MATERIAL_FLOATS, MAX_MEMBERS, MEMBER_BOX, MEMBER_FIELD, MEMBER_UNEVEN, type RowOrder, ROWS_TOP_DOWN,
    type Scheme, SCHEME_DARK, type Stacking, STACKING_EXACT, UNION_BYTES
} from "../layout.js";
import { explainMaterial, type MaterialSpec, packMaterial } from "../material.js";
import { PRESET_CLEAR, PRESET_COUNT, PRESET_STANDARD } from "../preset.js";
import { err, ok, type Result } from "../result.js";
import {
    A, ADAPT_LIVE, ADAPT_OFF, F, G, GEOM_BOX, GEOM_FIELD, GEOM_UNEVEN, GEOM_UNION, MATERIAL_CUSTOM, MATERIAL_DARK, MATERIAL_LIGHT, MAXP,
    MB, MMF, R, RGBA8
} from "./lanes.js";
import { LAST_ERROR, openShared, type Shared } from "./shared.js";
import { Frame } from "./frame.js";

export { LAST_ERROR };

/**
 * Glass renderer bound to one WebGL2 context. Shapes live in numbered slots; every call takes plain numbers
 * so the per-frame path stays allocation free. Create it with `createRenderer`.
 */
export class Renderer extends Frame {
    private constructor(gl: WebGL2RenderingContext, sh: Shared, strideBytes: number, ustrideBytes: number, maxTex: number) {
        super(gl, sh, strideBytes, ustrideBytes, maxTex);
    }

    /**
     * Build a renderer: compiles the pass programs and creates the shared GPU objects.
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
     * Make every GPU object again after the context was lost and restored (the `webglcontextrestored` event): pass and
     * glass programs, the backdrop copy, mask fields and blur pyramids. Shapes, handles and materials stay as they were.
     * A backdrop texture given with `setBackdropTexture` belongs to the caller: give it again afterwards.
     * @returns 0, or why the context cannot be used yet.
     */
    restore(): Result<number> {
        const gl = this.gl;
        if (gl.isContextLost()) return err("the context is still lost");
        // the objects of the lost context are gone: forget them, there is nothing to delete
        this.programs.clear(); this.progs.fill(null); this.kit.fill(null); this.kitLoc.fill(null);
        this.pageTex.fill(null); this.pageFbo.fill(null); this.pageDim.fill(0); this.pages = 0; this.shelfPage = -1;
        this.fields.fill(null); this.masks.fill(null); this.mfields.fill(null); this.mmasks.fill(null);
        this.sceneTex = null; this.copyTex = null; this.sceneFbo = null; this.copyFbo = null; this.bothFbo = null;
        this.sceneW = 0; this.sceneH = 0;
        this.sync = null; this.pendCount = 0;
        this.extended = false;
        const sh = openShared(gl, this.lumaCap);
        if (typeof sh === "string") return err(sh);
        this.adopt(sh);
        this.source = sh.backdrop;
        const src = this.backdropSource;
        if (src !== null) this.setBackdropSource(src);
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
            if (this.kinds[slot] === MATERIAL_CUSTOM) this.packed[slot] = -1;
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

    /** Set the target size in device pixels and the device pixels per point. */
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
            if (rescaled) { if (k === MATERIAL_CUSTOM) this.packed[i] = -1; this.refresh(i); } else this.finish(i);
        }
        this.frameDirty = true;
        this.backdropDirty = true;
    }

    /**
     * Draw in extended range: a half-float drawing buffer whose values may pass 1 (the glass is computed in extended
     * range; the face limit and the rim light limit stay). The context must have been created with `alpha: true`
     * (browsers give a half-float buffer only then; the renderer keeps it opaque), and the page must let the canvas
     * show such values, for example with `configureHighDynamicRange({ mode: "extended" })` where the browser has it.
     * @param on Extended range on or off.
     * @param headroom Brightest value the screen shows relative to the standard white (2 is common); from 1.2 up the
     * built-in materials drop the flat shadow part and the darker rim band of standard output.
     * @returns True when the drawing buffer holds extended-range values now.
     */
    setExtendedRange(on: boolean, headroom: number): boolean {
        this.wantExtended = on;
        this.headroom = headroom > 1 ? headroom : 1;
        this.applyRange();
        return this.extended;
    }

    /**
     * Upload an image, canvas or video frame as the backdrop. It must have the target size; it is drawn as is and
     * sampled by the glass. The renderer keeps its own copy: call again when the source changes.
     */
    setBackdropSource(src: TexImageSource): void {
        const gl = this.gl;
        gl.activeTexture(0x84c1);
        gl.bindTexture(0x0de1, this.backdrop);
        gl.texImage2D(0x0de1, 0, RGBA8, 0x1908, 0x1401, src);
        this.source = this.backdrop;
        this.backdropSource = src;
        this.backdropDirty = true;
        if (!this.topDown) { this.topDown = true; this.frameDirty = true; }
    }

    /**
     * Use a target-sized texture owned by the caller as the backdrop. The renderer reads it whenever it has to
     * rebuild something; call `markBackdropDirty` after each change of its content.
     * @param rows Row order of the texture: `ROWS_TOP_DOWN` for DOM uploads, `ROWS_BOTTOM_UP` for framebuffer renders.
     */
    setBackdropTexture(texture: WebGLTexture, rows: RowOrder): void {
        const gl = this.gl, topDown = rows === ROWS_TOP_DOWN;
        gl.activeTexture(0x84c1);
        gl.bindTexture(0x0de1, texture);
        gl.texParameteri(0x0de1, 0x2801, 0x2601); gl.texParameteri(0x0de1, 0x2800, 0x2601);
        gl.texParameteri(0x0de1, 0x2802, 0x812f); gl.texParameteri(0x0de1, 0x2803, 0x812f);
        this.source = texture;
        this.backdropSource = null;
        this.backdropDirty = true;
        if (this.topDown !== topDown) { this.topDown = topDown; this.frameDirty = true; }
    }

    /** Tell the renderer the content of the backdrop texture changed, so the blur pyramids are rebuilt on the next render. */
    markBackdropDirty(): void {
        this.backdropDirty = true;
    }

    /**
     * Add a shape with the size-dependent standard material.
     * @param x Left edge in points.
     * @param y Top edge in points (y down).
     * @param w Width.
     * @param h Height.
     * @param radius Corner radius in points (clamped to half the short side).
     * @param corner Corner construction.
     * @param scheme Standard material for dark or light surroundings.
     * @returns Handle of the shape. It stops working once the shape is removed: calls with it are ignored and never
     * reach a shape added later. Later shapes are drawn over earlier ones and see them through the glass.
     */
    addShape(x: number, y: number, w: number, h: number, radius: number, corner: CornerKind, scheme: Scheme): number {
        const slot = this.take(), g = this.geo, b = slot * G;
        g[b] = x; g[b + 1] = y; g[b + 2] = w; g[b + 3] = h; g[b + 4] = radius; g[b + 5] = corner;
        return this.init(slot, scheme === SCHEME_DARK ? MATERIAL_DARK : MATERIAL_LIGHT, GEOM_BOX);
    }

    /** Move or resize a shape; a built-in material follows the new short side. Corner radii become equal again. */
    setShape(handle: number, x: number, y: number, w: number, h: number, radius: number): void {
        const slot = this.slotOf(handle);
        if (slot < 0) return;
        const g = this.geo, b = slot * G;
        g[b] = x; g[b + 1] = y; g[b + 2] = w; g[b + 3] = h; g[b + 4] = radius;
        if (this.geoms[slot] === GEOM_UNEVEN) this.geoms[slot] = GEOM_BOX;
        this.refresh(slot);
    }

    /**
     * Give each corner of a shape its own radius, in points. The radii shrink together when two of them do not
     * fit on an edge.
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

    /** Change how the corners of a shape are built (for a union: of every member with corners). */
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

    /** Give a shape the standard material for dark or light surroundings. */
    setStandard(handle: number, scheme: Scheme): void {
        this.setPreset(handle, PRESET_STANDARD, scheme);
    }

    /**
     * Give a shape the clear material: light blur, strong refraction, no shadow, backdrop captured at half
     * resolution. The scheme selects the rim light colours for dark or light surroundings.
     */
    setClear(handle: number, scheme: Scheme): void {
        this.setPreset(handle, PRESET_CLEAR, scheme);
    }

    /**
     * Give a shape a preset: one of the built-in materials (`PRESET_*`), each with its own laws over the size, the
     * surroundings and, for small glass, the backdrop luminance. An unknown number is ignored.
     */
    setPreset(handle: number, preset: number, scheme: Scheme): void {
        const slot = this.slotOf(handle);
        if (slot < 0 || !(preset >= 0 && preset < PRESET_COUNT)) return;
        this.kinds[slot] = scheme === SCHEME_DARK ? MATERIAL_DARK : MATERIAL_LIGHT;
        this.presets[slot] = preset | 0;
        this.st[slot] = ADAPT_OFF;
        this.refresh(slot);
    }

    /** Preset number of a shape, or -1 for a custom material or a dead handle. */
    getPreset(handle: number): number {
        const slot = this.slotOf(handle);
        return slot < 0 || this.kinds[slot] === MATERIAL_CUSTOM ? -1 : this.presets[slot] as number;
    }

    /**
     * Give a shape a custom material.
     * @returns The program key, or why the material was rejected: the first field that is wrong, by its path
     * (the shape keeps its previous material).
     */
    setMaterial(handle: number, spec: MaterialSpec): Result<number> {
        const slot = this.slotOf(handle);
        if (slot < 0) return err("the shape of this handle was removed");
        // packed aside first, so a rejected description leaves the shape as it was
        const t = this.trial, ti = this.trialInfo, f = packMaterial(t, 0, ti, 0, spec, 1, this.share, this.scale);
        if (f < 0) {
            const why = explainMaterial(spec);
            return err(why !== "" ? why : "material folds to a value that is not finite (a huge gain or a zero-width range)");
        }
        this.kinds[slot] = MATERIAL_CUSTOM;
        this.st[slot] = ADAPT_OFF;
        this.specs[slot] = spec;
        this.tints[slot * 4 + 3] = 0;
        if ((this.ad[slot * A + 8] as number) === 1) {
            const d = this.blocks, o = slot * this.stride, g = this.geo, b = slot * G + 6;
            for (let i = 0; i < MATERIAL_FLOATS; i++) d[o + i] = t[i] as number;
            for (let i = 0; i < 6; i++) g[b + i] = ti[i] as number;
            this.feats[slot] = f;
            this.packed[slot] = 1;
        } else this.packed[slot] = -1;
        this.refresh(slot);
        const key = this.keys[slot] as number;
        if (key < 0 && (this.geoms[slot] !== GEOM_UNION || (this.ucount[slot] as number) > 0)) {
            return err("glass program failed to compile: " + (LAST_ERROR[0] as string));
        }
        return ok(key);
    }

    /**
     * Lay a colour over the glass of a shape: a gradient over the glass luminance through two anchors of the tint
     * hue. Built-in materials use the rule of their current scheme; a custom material gets the rule for dark
     * surroundings (set `overlay` in its description for any other layer). A strength of 0 removes the layer.
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
        if (this.kinds[slot] === MATERIAL_CUSTOM) this.packed[slot] = -1;
        this.refresh(slot);
    }

    /** Draw a shape with its shadow at an opacity of 0..1 over what lies below it (1 by default). */
    setOpacity(handle: number, opacity: number): void {
        const slot = this.slotOf(handle);
        if (slot < 0) return;
        this.geo[slot * G + 21] = opacity < 0 ? 0 : opacity > 1 ? 1 : opacity;
        this.finish(slot);
    }

    /**
     * Lay a flat grey over the finished glass inside the shape, above the rim lights: the mark of a pressed control
     * (white at a strength of 0.08 on dark glass, black at 0.08 on light glass). A strength of 0 removes it.
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
     * Set how far a shape has materialised, at once: 1 is the shape as described, 0 hides it (it keeps its slot and
     * its GPU objects and is not drawn). In between, the material is blended in from plain glass (no blur, lens,
     * tone, glow or shadow; the rim lights stay) and the frame is larger by 8 points times (1 - presence) on every
     * side (a mask shape keeps its frame).
     */
    setPresence(handle: number, presence: number): void {
        const slot = this.slotOf(handle);
        if (slot < 0) return;
        const a = this.ad, b = slot * A, v = presence < 0 ? 0 : presence > 1 ? 1 : presence;
        a[b + 8] = v; a[b + 9] = 0; a[b + 10] = v;
        this.refresh(slot);
    }

    /**
     * Let a shape appear (presence 1) or disappear (0) over time: the presence follows a critically damped spring
     * of half a second and `render` reports true until it has settled.
     */
    animatePresence(handle: number, presence: number): void {
        const slot = this.slotOf(handle);
        if (slot < 0) return;
        this.ad[slot * A + 10] = presence < 0 ? 0 : presence > 1 ? 1 : presence;
        this.stale = true;
    }

    /**
     * Add a union: several rounded rectangles drawn as one piece of glass whose outlines flow into each other.
     * It is a shape (material, tint and removal work as for any shape); it shows once it has a member.
     * @param spacing Distance in points over which neighbouring members merge.
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
     * Add a rounded rectangle to a union (at most 16 members).
     * @returns Index of the member inside the union, or -1 when the handle is not a live union or it is full.
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
     * Add a member of any outline to a union from a coverage mask (alpha channel, stretched over the frame); at most 4
     * per union. It merges with its neighbours like any member.
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

    /** Replace the mask of a member added with `addMemberMask`. */
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
     * Move or resize a member of a union. A member with corners of its own gets one radius again; a mask member keeps
     * its mask (the radius is not used).
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
     * Give each corner of a union member its own radius, in points (radii that do not fit on an edge shrink together).
     * Mask members are left as they are.
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

    /** Remove a member of a union; the last member takes its index. */
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

    /** Set the merge distance of a union in points. */
    setSpacing(handle: number, spacing: number): void {
        const slot = this.slotOf(handle);
        if (slot < 0 || this.geoms[slot] !== GEOM_UNION) return;
        this.geo[slot * G + 16] = spacing > 0 ? spacing : 0;
        this.finish(slot);
    }

    /**
     * Add a shape of any outline from a coverage mask (for example a canvas with the outline filled). The alpha
     * channel of the mask is the coverage; the mask is stretched over the frame. The distance field of the outline
     * is rebuilt when the mask or the size of the frame changes, not when the shape moves.
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

    /** Replace the mask of a shape added with `addMask`. */
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
     * Choose how shapes that lie over other shapes are drawn.
     * @param mode `STACKING_EXACT` (default): a shape refracts the glass below it; every layer of overlap costs one
     * more group of capture passes. `STACKING_FLAT`: every shape refracts the backdrop only and all shapes are
     * drawn in one batch.
     */
    setStacking(mode: Stacking): void {
        const flat = mode !== STACKING_EXACT;
        if (this.flat !== flat) { this.flat = flat; this.layoutDirty = true; this.stale = true; this.full = true; }
    }

    /**
     * Set the surroundings of the built-in materials, as `ENV_*` bits: the window is inactive (flat glass without
     * shadow, glow or rim lights), the more opaque tinted setting, reduce transparency, increase contrast (an outline
     * ring instead of the rim lights), reduce motion (no refraction inside the glass, more blur). Custom materials are
     * left as described; build them with the same bits through `standardMaterial(side, scheme, environment)`.
     */
    setEnvironment(environment: number): void {
        const e = environment | 0;
        if (e === this.env) return;
        this.env = e;
        const n = this.capacity, kinds = this.kinds;
        for (let i = 0; i < n; i++) {
            const k = kinds[i] as number;
            if (k !== 0 && k !== MATERIAL_CUSTOM) this.refresh(i);
        }
        this.stale = true;
    }

    /** The `ENV_*` bits set with `setEnvironment`. */
    getEnvironment(): number {
        return this.env;
    }

    /**
     * Let a small built-in glass follow the backdrop luminance (default) or keep the fixed tone of its scheme, as glass
     * of a fixed size does.
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
     * Scheme a built-in glass shows now: 0 dark, 1 light, between the two while an adaptive glass changes over; -1 for a
     * custom material or a dead handle. Content on the glass can follow it.
     */
    getScheme(handle: number): number {
        const slot = this.slotOf(handle);
        if (slot < 0) return -1;
        const kind = this.kinds[slot] as number;
        if (kind === MATERIAL_CUSTOM) return -1;
        if (this.st[slot] === ADAPT_LIVE) return this.ad[slot * A + 2] as number;
        return kind === MATERIAL_DARK ? 0 : 1;
    }

    /** Current presence of a shape (0 hidden .. 1 fully there), or -1 when its handle is dead. */
    getPresence(handle: number): number {
        const slot = this.slotOf(handle);
        return slot < 0 ? -1 : this.ad[slot * A + 8] as number;
    }

    /** True while the shape of a handle exists (it has not been removed). */
    isAlive(handle: number): boolean {
        return this.slotOf(handle) >= 0;
    }

    /**
     * Turn every rim light, by `radians` clockwise from where its material puts it (0 by default). It follows a
     * moving light source, the way a device's tilt turns the highlights of the glass on it.
     */
    setLightAngle(radians: number): void {
        const fr = this.frame, c = Math.cos(radians), s = Math.sin(radians);
        if (c - c !== 0 || (fr[10] === c && fr[11] === s)) return;
        fr[10] = c; fr[11] = s;
        this.frameDirty = true;
        this.stale = true;
    }

    /** Draw a shape last, over every other shape. */
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

    /** Remove a shape. Its handle is dead from now on; the slot behind it may serve a shape added later. */
    removeShape(handle: number): void {
        const slot = this.slotOf(handle);
        if (slot < 0) return;
        this.keys[slot] = -1;
        this.draws[slot] = 0;
        this.progs[slot] = null;
        this.kinds[slot] = 0;
        this.st[slot] = ADAPT_OFF;
        this.reg[slot * R + 14] = 0;
        this.specs[slot] = null;
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

    /** Release every GPU object the renderer created. */
    dispose(): void {
        const gl = this.gl;
        for (let i = 0; i < MAXP; i++) this.dropPage(i);
        for (let i = 0; i < this.capacity; i++) this.dropField(i);
        for (let i = 0; i < this.capacity * MMF; i++) this.dropMemberField(i);
        for (let i = 0; i < 4; i++) { gl.deleteProgram(this.kit[i] as WebGLProgram | null); this.kit[i] = null; }
        this.dropScene();
        if (this.sync !== null) { gl.deleteSync(this.sync); this.sync = null; }
        gl.deleteBuffer(this.ubo); gl.deleteBuffer(this.frameUbo); gl.deleteBuffer(this.unionUbo); gl.deleteBuffer(this.instBuf);
        gl.deleteBuffer(this.lumaBuf); gl.deleteBuffer(this.pbo);
        gl.deleteTexture(this.backdrop); gl.deleteTexture(this.lumaTex); gl.deleteFramebuffer(this.lumaFbo);
        gl.deleteProgram(this.present); gl.deleteProgram(this.split); gl.deleteProgram(this.capture); gl.deleteProgram(this.down);
        gl.deleteProgram(this.luma);
        gl.deleteVertexArray(this.vao); gl.deleteVertexArray(this.buildVao); gl.deleteVertexArray(this.lumaVao);
        for (const p of this.programs.values()) gl.deleteProgram(p);
        this.programs.clear();
        this.progs.fill(null);
    }
}

/**
 * Create a renderer for a WebGL2 context.
 * @returns The renderer, or the reason the context cannot be used.
 */
export function createRenderer(gl: WebGL2RenderingContext): Result<Renderer> {
    return Renderer.create(gl);
}
