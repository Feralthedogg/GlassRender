/**
 * @file shapes.ts
 * @brief Per-shape material, geometry and backdrop region resolution.
 */

import {
    CORNER_SMOOTH, FEATURE_ABERRATION, FEATURE_FADE, FEATURE_FIELD, FEATURE_LENS, FEATURE_LIGHTS, FEATURE_ROUND_NORMAL, FEATURE_SHARP, FEATURE_TINT, FEATURE_UNEVEN, FEATURE_VEIL,
    MATERIAL_FLOATS, MAX_MEMBERS, MEMBER_BOX, MEMBER_FIELD, MEMBER_SHIFT, MEMBER_UNEVEN, ROW_CLAMP, ROW_GRID, ROW_LENS_LAYER, ROW_TINT_MORE, SMOOTH_REACH
} from "../layout.js";
import { glassFragment, groupBodyFragment, shapeVertex, worldVertex } from "../kernels.js";
import { ADAPTIVE_SIDE, backdropRegion, packTint } from "../material.js";
import { packPreset, PRESET_CLEAR, PRESET_RANGE, presetFollows } from "../preset.js";
import {
    A, ADAPT_FIRST, ADAPT_LIVE, ADAPT_OFF, B, C, edge, F, FIELD_BITS, FIELD_RANGE, G, GEN_MASK, GEN_SHIFT, GEOM_BOX, GEOM_FIELD, GEOM_UNEVEN, GEOM_UNION,
    MATERIAL_DARK, MAXL, MB, MF, MMF, R
} from "./lanes.js";
import { link } from "./shared.js";
import { fma32, layerOpacity } from "../precision.js";
import { vibrantClamp } from "../hdr.js";
import { tintGradientMask } from "../gradient.js";
import { State } from "./state.js";

// Region scratch: capture and pyramid rectangles, level count and first level.
const REGION = new Int32Array(10);

/** @brief Material and geometry rows of a slot, and its program. */
export abstract class Shapes extends State {
    private tintMask: WebGLTexture | null = null;

    protected dropTintMask(deleteObjects: boolean): void {
        if (deleteObjects) this.gl.deleteTexture(this.tintMask);
        this.tintMask = null;
    }

    /** One immutable distance LUT, recreated lazily after context restoration. */
    protected bindTintMask(): boolean {
        const gl = this.gl;
        gl.activeTexture(gl.TEXTURE7);
        if (this.tintMask === null) {
            const texture = gl.createTexture();
            if (texture === null) { gl.activeTexture(gl.TEXTURE0); return false; }
            gl.bindTexture(gl.TEXTURE_2D, texture);
            gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA16F, 256, 1);
            // Typed uploads must not inherit the caller's pixel-unpack buffer or row skips.
            const unpack = gl.getParameter(gl.PIXEL_UNPACK_BUFFER_BINDING) as WebGLBuffer | null;
            const names = [gl.UNPACK_ROW_LENGTH, gl.UNPACK_SKIP_PIXELS, gl.UNPACK_SKIP_ROWS] as const;
            const values = names.map(name => gl.getParameter(name) as number);
            gl.bindBuffer(gl.PIXEL_UNPACK_BUFFER, null);
            for (const name of names) gl.pixelStorei(name, 0);
            try { gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 256, 1, gl.RGBA, gl.FLOAT, tintGradientMask()); }
            finally {
                names.forEach((name, i) => gl.pixelStorei(name, values[i] as number));
                gl.bindBuffer(gl.PIXEL_UNPACK_BUFFER, unpack);
            }
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            this.tintMask = texture;
        } else gl.bindTexture(gl.TEXTURE_2D, this.tintMask);
        gl.activeTexture(gl.TEXTURE0);
        return true;
    }
    // Start a slot as a new shape; returns its handle (a new generation, so handles of earlier users of the slot are dead).
    protected init(slot: number, kind: number, geom: number): number {
        const gen = (((this.gens[slot] as number) + 1) & GEN_MASK) || 1, a = this.ad, b = slot * A;
        this.kinds[slot] = kind;
        this.geoms[slot] = geom;
        this.st[slot] = ADAPT_OFF;
        this.fixedTone[slot] = 0;
        this.presets[slot] = 0;
        this.chromatic[slot] = -1;
        this.lumaDirty[slot] = 0;
        this.feats[slot] = 0;
        this.gens[slot] = gen;
        this.tints.fill(0, slot * 4, slot * 4 + 4);
        a.fill(0, b, b + A);
        a[b + 8] = 1; a[b + 10] = 1;
        this.geo[slot * G + 21] = 1;
        this.reg.fill(0, slot * R, slot * R + R);
        this.order[this.count++] = slot;
        this.full = true;
        this.refresh(slot);
        return slot | (gen << GEN_SHIFT);
    }

    // Material (presets) and geometry of a slot from its lanes.
    protected refresh(slot: number): void {
        const g = this.geo, b = slot * G, e = this.swell(slot);
        if (this.geoms[slot] === GEOM_UNION) {
            // bounding box of the members; the material follows the short side of the largest member (and of the smallest)
            const m = this.members, n = this.ucount[slot] as number, mo = slot * MAX_MEMBERS * MB;
            let x0 = 0, y0 = 0, x1 = 0, y1 = 0, side = 0, least = 0, area = -1;
            for (let i = 0; i < n; i++) {
                const q = mo + i * MB, ee = m[q + 6] === MEMBER_FIELD ? 0 : e;
                const x = (m[q] as number) - ee, y = (m[q + 1] as number) - ee, w = (m[q + 2] as number) + 2 * ee, h = (m[q + 3] as number) + 2 * ee;
                const sh = w < h ? w : h;
                if (i === 0) { x0 = x; y0 = y; x1 = x + w; y1 = y + h; least = sh; } else {
                    if (x < x0) x0 = x; if (y < y0) y0 = y; if (x + w > x1) x1 = x + w; if (y + h > y1) y1 = y + h;
                    if (sh < least) least = sh;
                }
                if (w * h > area) { area = w * h; side = sh; }
            }
            g[b] = x0; g[b + 1] = y0; g[b + 2] = x1 - x0; g[b + 3] = y1 - y0; g[b + 17] = side; g[b + 18] = least;
        } else {
            const w = (g[b + 2] as number) + 2 * e, h = (g[b + 3] as number) + 2 * e;
            g[b + 17] = g[b + 18] = w < h ? w : h;
        }
        this.packTone(slot);
        this.finish(slot);
    }

    // Material rows of a preset for the current adaptive state: small glass of a preset that follows the backdrop takes
    // the scheme the backdrop luminance gives it, through a transition.
    protected packTone(slot: number): void {
        const g = this.geo, b = slot * G, a = this.ad, ab = slot * A, o = slot * this.stride, P = this.presets[slot] as number;
        const side = g[b + 17] as number, env = this.kinds[slot] === MATERIAL_DARK ? 0 : 1;
        let mix = env;
        if (side <= ADAPTIVE_SIDE && this.fixedTone[slot] === 0 && presetFollows(P, this.env)) {
            const s = this.st[slot] as number;
            if (s === ADAPT_OFF) { this.st[slot] = ADAPT_FIRST; this.lumaDirty[slot] = 1; a[ab + 2] = env; a[ab + 5] = env; }
            else if (s === ADAPT_LIVE) mix = a[ab + 2] as number;
        } else this.st[slot] = ADAPT_OFF;
        const pr = a[ab + 8] as number;
        let f = packPreset(this.blocks, o, g, b + 6, P, side, g[b + 18] as number, mix, pr, this.env, this.share, this.scale);
        const value = this.chromatic[slot] as number, strength = value < 0 ? this.chromaticDefault : value;
        if (strength !== 1 && (f & (FEATURE_ABERRATION | FEATURE_LENS)) !== 0) {
            // Scale fresh packed rows so cache hits and repeated updates never compound the multiplier.
            if ((f & FEATURE_ABERRATION) !== 0) this.blocks[o + ROW_CLAMP * 4 + 2] = (this.blocks[o + ROW_CLAMP * 4 + 2] as number) * strength;
            if ((f & FEATURE_LENS) !== 0) this.blocks[o + ROW_LENS_LAYER * 4] = (this.blocks[o + ROW_LENS_LAYER * 4] as number) * strength;
            if (strength === 0) f &= ~(FEATURE_ABERRATION | FEATURE_LENS);
        }
        g[b + 22] = PRESET_RANGE[0] as number; g[b + 23] = PRESET_RANGE[1] as number;
        const t = this.tints, tb = slot * 4;
        f |= packTint(this.blocks, o, t[tb] as number, t[tb + 1] as number, t[tb + 2] as number, (t[tb + 3] as number) * pr, mix);
        if ((f & FEATURE_TINT) !== 0) this.blocks[o + ROW_TINT_MORE * 4] = vibrantClamp(this.blocks[o + ROW_TINT_MORE * 4] as number);
        this.feats[slot] = f;
        this.touch(slot);
    }

    // Shape rows, program and region demand of a slot.
    protected finish(slot: number): void {
        const g = this.geo, b = slot * G, d = this.blocks, o = slot * this.stride + MATERIAL_FLOATS;
        const veil = g[b + 20] as number, fade = layerOpacity(g[b + 21] as number);
        let bits = this.packGeometry(slot);
        let p: WebGLProgram | null = null, key = -1;
        d[o + 36] = g[b + 19] as number; d[o + 37] = veil; d[o + 38] = fade;
        if (bits >= 0 && fade > 0) {
            if (veil > 0) bits |= FEATURE_VEIL;
            if (fade < 1) bits |= FEATURE_FADE;
            /*
             * Mask fields retain their own direction. Ellipse blending applies to analytic
             * outlines; unions select it independently for each member.
             */
            const f = this.feats[slot] as number;
            key = bits | ((bits & FEATURE_FIELD) !== 0 && (bits >>> MEMBER_SHIFT) === 0 ? f & ~FEATURE_ROUND_NORMAL : f);
            p = this.program(key);
        }
        this.keys[slot] = p === null ? -1 : key;
        this.progs[slot] = p;
        this.draws[slot] = p !== null && (this.ad[slot * A + 8] as number) > 0 ? 1 : 0;
        this.touch(slot);
        this.layoutDirty = true;
    }

    // Shape rows of the slot block, its bounds and its backdrop region demand.
    // Returns the shape bits of the program key, or -1 when there is nothing to draw.
    protected packGeometry(slot: number): number {
        const g = this.geo, b = slot * G, d = this.blocks, o = slot * this.stride + MATERIAL_FLOATS, geom = this.geoms[slot] as number;
        // while a shape materialises its frame (each member of a union) stands out by e points on every side
        const union = geom === GEOM_UNION, e = union ? 0 : this.swell(slot), em = union ? this.swell(slot) : 0;
        const x = (g[b] as number) - e, y = (g[b + 1] as number) - e, w = (g[b + 2] as number) + 2 * e, h = (g[b + 3] as number) + 2 * e;
        const hx = w * 0.5, hy = h * 0.5, s = this.scale, W = this.width, Hh = this.height, E = SMOOTH_REACH;
        const cx = x + hx, cy = Hh / s - y - hy, T = this.texel(slot);
        const smooth = g[b + 5] === CORNER_SMOOTH;
        let bits = 0;
        d[o] = cx; d[o + 1] = cy; d[o + 2] = hx; d[o + 3] = hy;
        d[o + 4] = 0; d[o + 5] = 0; d[o + 6] = 0; d[o + 7] = s / T;
        d[o + 8] = 1; d[o + 9] = 1; d[o + 10] = hy > 0 ? hx / hy : 1;
        d[o + 26] = 0;
        if (geom === GEOM_BOX) {
            // a fully round end stays round while the frame is grown
            let r = g[b + 4] as number; r = r < 0 ? -r : r;
            if (e > 0 && r >= (hx < hy ? hx : hy) - e - 1e-6) r += e;
            if (r > hx) r = hx; if (r > hy) r = hy;
            let kx = 1, ky = 1;
            if (smooth && r > 0) {
                kx = (E - hx / r) / (E - 1); kx = kx < 0 ? 0 : kx > 1 ? 1 : kx;
                ky = (E - hy / r) / (E - 1); ky = ky < 0 ? 0 : ky > 1 ? 1 : ky;
            }
            const e0 = Math.fround(Math.fround(E) * Math.fround(r));
            d[o + 4] = r; d[o + 5] = e0; d[o + 6] = e0 + Math.fround(r - e0) * (kx > ky ? kx : ky);
            d[o + 8] = kx; d[o + 9] = ky;
            if (r <= 0) bits = FEATURE_SHARP;
        } else if (geom === GEOM_UNEVEN) {
            let tl = g[b + 12] as number, tr = g[b + 13] as number, br = g[b + 14] as number, bl = g[b + 15] as number;
            let k = 1;
            if (tl + tr > w) k = w / (tl + tr);
            if (bl + br > w && w / (bl + br) < k) k = w / (bl + br);
            if (tl + bl > h && h / (tl + bl) < k) k = h / (tl + bl);
            if (tr + br > h && h / (tr + br) < k) k = h / (tr + br);
            tl *= k; tr *= k; br *= k; bl *= k;
            d[o + 28] = tr; d[o + 29] = tl; d[o + 30] = bl; d[o + 31] = br;
            // edge roundness from the mean radius of its two corners: top, bottom, right, left
            d[o + 32] = edge(hx, (tl + tr) * 0.5, smooth); d[o + 33] = edge(hx, (bl + br) * 0.5, smooth);
            d[o + 34] = edge(hy, (tr + br) * 0.5, smooth); d[o + 35] = edge(hy, (tl + bl) * 0.5, smooth);
            bits = FEATURE_UNEVEN;
        } else if (geom === GEOM_FIELD) {
            // field texture: the frame grown by the reach of the shadow lookups, at device resolution, centered
            const ax = g[b + 10] as number, ay = g[b + 11] as number;
            const offset = Math.max(Math.abs(ax), Math.abs(ay)), upper = g[b + 23] as number;
            const pad = Math.max(9 / s, Number.isFinite(upper)
                ? Math.max(Math.fround(upper + (this.presets[slot] === PRESET_CLEAR ? 0 : 8)), offset + 2)
                : (g[b + 6] as number) + offset + 2);
            const fw = Math.ceil((w + 2 * pad) * s), fh = Math.ceil((h + 2 * pad) * s), fd = this.fdim, f = slot * F;
            if (fw > this.maxTex || fh > this.maxTex || !(w > 0) || !(h > 0)) return -1;
            // Default ranges use half storage at spans of at least 32 points and packed storage below it.
            const lower = g[b + 22] as number;
            const encoded = Number.isFinite(lower) && Number.isFinite(upper) && lower < 0 && upper > 0;
            FIELD_RANGE[0] = encoded ? lower : 0; FIELD_RANGE[1] = encoded ? upper : 0;
            if (fd[f + 6] !== FIELD_BITS[0] || fd[f + 7] !== FIELD_BITS[1]) {
                fd[f + 2] = 0; fd[f + 3] = 0;
                fd[f + 6] = FIELD_BITS[0] as number; fd[f + 7] = FIELD_BITS[1] as number;
            }
            fd[f] = fw; fd[f + 1] = fh;
            if (fd[f + 2] !== fw || fd[f + 3] !== fh) this.maskDirty = true;
            d[o + 28] = s / fw; d[o + 29] = s / fh; d[o + 30] = 0.5; d[o + 31] = 0.5;
            bits = FEATURE_FIELD;
        } else {
            const n = this.ucount[slot] as number;
            if (n === 0) return -1;
            const m = this.members, mo = slot * MAX_MEMBERS * MB, u = this.ublocks, uo = slot * this.ustride, sp = g[b + 16] as number;
            // a mask member's field reaches as far as the shadow lookups and the merge distance
            const ax = g[b + 10] as number, ay = g[b + 11] as number, aa = (ax < 0 ? -ax : ax) > (ay < 0 ? -ay : ay) ? (ax < 0 ? -ax : ax) : (ay < 0 ? -ay : ay);
            const upper = g[b + 23] as number;
            let fp = Math.max(9 / s, Number.isFinite(upper) ? Math.max(Math.fround(upper + sp), aa + 2) : (g[b + 6] as number) + aa + 2);
            if (fp < sp + 2) fp = sp + 2;
            bits = n << MEMBER_SHIFT;
            for (let i = 0; i < n; i++) {
                const q = mo + i * MB, v = uo + i * MF, kind = m[q + 6] as number, ee = kind === MEMBER_FIELD ? 0 : em;
                const mw = (m[q + 2] as number) * 0.5 + ee, mh = (m[q + 3] as number) * 0.5 + ee, smoothM = m[q + 5] === CORNER_SMOOTH;
                u.fill(0, v, v + MF);
                u[v] = (m[q] as number) - ee + mw; u[v + 1] = Hh / s - (m[q + 1] as number) + ee - mh; u[v + 2] = mw; u[v + 3] = mh;
                u[v + 7] = mh > 0 ? mw / mh : 1; u[v + 10] = kind; u[v + 11] = m[q + 7] as number;
                if (kind === MEMBER_BOX) {
                    let r = m[q + 4] as number; r = r < 0 ? -r : r;
                    if (ee > 0 && r >= (mw < mh ? mw : mh) - ee - 1e-6) r += ee;
                    if (r > mw) r = mw; if (r > mh) r = mh;
                    let kx = 1, ky = 1;
                    if (smoothM && r > 0) {
                        kx = (E - mw / r) / (E - 1); kx = kx < 0 ? 0 : kx > 1 ? 1 : kx;
                        ky = (E - mh / r) / (E - 1); ky = ky < 0 ? 0 : ky > 1 ? 1 : ky;
                    }
                    const e0 = Math.fround(Math.fround(E) * Math.fround(r));
                    u[v + 4] = r; u[v + 5] = e0; u[v + 6] = e0 + Math.fround(r - e0) * (kx > ky ? kx : ky); u[v + 8] = kx; u[v + 9] = ky;
                } else if (kind === MEMBER_UNEVEN) {
                    let tl = m[q + 8] as number, tr = m[q + 9] as number, br = m[q + 10] as number, bl = m[q + 11] as number, k = 1;
                    const ww = 2 * mw, hh = 2 * mh;
                    if (tl + tr > ww) k = ww / (tl + tr);
                    if (bl + br > ww && ww / (bl + br) < k) k = ww / (bl + br);
                    if (tl + bl > hh && hh / (tl + bl) < k) k = hh / (tl + bl);
                    if (tr + br > hh && hh / (tr + br) < k) k = hh / (tr + br);
                    tl *= k; tr *= k; br *= k; bl *= k;
                    // the largest radius bounds how far the outline lies inside the box
                    let rm = tl > tr ? tl : tr; if (br > rm) rm = br; if (bl > rm) rm = bl;
                    u[v + 4] = rm; u[v + 12] = tr; u[v + 13] = tl; u[v + 14] = bl; u[v + 15] = br;
                    u[v + 16] = edge(mw, (tl + tr) * 0.5, smoothM); u[v + 17] = edge(mw, (bl + br) * 0.5, smoothM);
                    u[v + 18] = edge(mh, (tr + br) * 0.5, smoothM); u[v + 19] = edge(mh, (tl + bl) * 0.5, smoothM);
                    bits |= FEATURE_UNEVEN;
                } else {
                    const at = (slot * MMF + (m[q + 7] as number)) * F, fd = this.mfdim;
                    const fw = Math.ceil((2 * mw + 2 * fp) * s), fh = Math.ceil((2 * mh + 2 * fp) * s);
                    if (fw > this.maxTex || fh > this.maxTex || !(mw > 0) || !(mh > 0)) return -1;
                    fd[at] = fw; fd[at + 1] = fh;
                    if (fd[at + 2] !== fw || fd[at + 3] !== fh) this.maskDirty = true;
                    u[v + 12] = s / fw; u[v + 13] = s / fh; u[v + 14] = 0.5; u[v + 15] = 0.5;
                    bits |= FEATURE_FIELD;
                }
            }
            const lo = uo, hi = uo + this.ustride;
            if (lo < this.udirtyLo) this.udirtyLo = lo;
            if (hi > this.udirtyHi) this.udirtyHi = hi;
            d[o + 26] = sp;
        }
        // drawn area: the body with a pixel of edge, and the shadow around its offset outline
        const sp = g[b + 6] as number, ox = g[b + 10] as number, oy = g[b + 11] as number;
        const bx0 = (cx - hx - (sp - ox > 0 ? sp - ox : 0) - 1) * s, bx1 = (cx + hx + (sp + ox > 0 ? sp + ox : 0) + 1) * s;
        const by0 = (cy - hy - (sp + oy > 0 ? sp + oy : 0) - 1) * s, by1 = (cy + hy + (sp - oy > 0 ? sp - oy : 0) + 1) * s;
        d[o + 12] = bx0; d[o + 13] = by0; d[o + 14] = bx1; d[o + 15] = by1;
        // capture and pyramid region (texels on the target's grid from its bottom-left corner, y up); the smallest lookup
        // radius and whether a blur fill is on come from the material rows
        const R9 = REGION, mo = slot * this.stride;
        backdropRegion(R9, 0, x, y, w, h, g[b + 8] as number, s, T, d[mo + 164] as number, g[b + 7] as number, g[b + 9] as number,
            (d[mo + 165] as number) > 0, W, Hh, MAXL);
        const cx0 = R9[0] as number, cy0 = R9[1] as number, cw = R9[2] as number, ch = R9[3] as number, cx1 = cx0 + cw, cy1 = cy0 + ch;
        const rx0 = R9[4] as number, ry0 = R9[5] as number, pw = R9[6] as number, ph = R9[7] as number, levels = R9[8] as number;
        if (geom === GEOM_BOX) {
            const at = mo + ROW_GRID * 4, fr = Math.fround;
            const outline = Math.max(1 / s, -(d[slot * this.stride + 95] as number) * s);
            /*
             * Partition in Float64 before Float32 rounding. The fragment path uses Float32;
             * changing this order shifts grid boundaries at rounded corners.
             */
            const corner = fr(fr(d[o + 4] as number) * E);
            for (let axis = 0; axis < 2; axis++) {
                const half = axis === 0 ? hx : hy, centre = axis === 0 ? cx : cy;
                const offset = axis === 0 ? ox : -oy;
                const low = -half + Math.min(-outline, -sp + offset), high = half + Math.max(outline, sp + offset);
                const origin = axis === 0 ? rx0 : ry0, size = axis === 0 ? pw : ph;
                const coefficient = fr((axis === 0 ? 2 / W : -2 / Hh));
                for (let i = 0; i < 6; i++) {
                    const q = i === 0 ? low : i === 1 ? -half - outline : i === 2 ? -half + Math.min(corner, half)
                        : i === 3 ? half - Math.min(corner, half) : i === 4 ? half + outline : high;
                    const pixel = fr((q + centre) * s), clip = fr(fr(pixel * coefficient) + (axis === 0 ? -1 : 1));
                    d[at + axis * 6 + i] = axis === 0 ? clip : -clip;
                    d[at + 12 + axis * 6 + i] = fr(q);
                    d[at + 24 + axis * 6 + i] = fr(fma32(pixel, fr(1 / T), -fr(origin)) * fr(1 / size));
                }
            }
        }
        d[o + 11] = levels - 1;
        d[o + 24] = T; d[o + 25] = pw / ph; d[o + 27] = R9[9] as number;
        // capture lanes: origin px (y up), texel px, position of the region's first texel in the capture, capture size
        const q = this.cap, c = slot * C, rg = this.reg, rb = slot * R, bd = this.bounds, bb = slot * B;
        q[c] = cx0 * T; q[c + 1] = cy0 * T; q[c + 2] = T; q[c + 3] = 0;
        q[c + 4] = rx0 - cx0; q[c + 5] = ry0 - cy0; q[c + 6] = cw; q[c + 7] = ch;
        rg[rb + 5] = pw; rg[rb + 6] = ph; rg[rb + 7] = levels; rg[rb + 8] = 1;
        // captured texels inside the region: what the luminance reading averages
        rg[rb + 9] = cx0 - rx0; rg[rb + 10] = cy0 - ry0; rg[rb + 11] = cx1 - rx0; rg[rb + 12] = cy1 - ry0;
        rg[rb + 13] = 1 << (levels - 1);
        const ex0 = (cx - hx - 1) * s, ey0 = (cy - hy - 1) * s, ex1 = (cx + hx + 1) * s, ey1 = (cy + hy + 1) * s;
        const kx0 = cx0 * T, kx1 = cx1 * T, ky0 = cy0 * T, ky1 = cy1 * T;
        bd[bb] = bx0; bd[bb + 1] = by0; bd[bb + 2] = bx1; bd[bb + 3] = by1;
        bd[bb + 4] = ex0 < kx0 ? ex0 : kx0; bd[bb + 5] = ey0 < ky0 ? ey0 : ky0;
        bd[bb + 6] = ex1 > kx1 ? ex1 : kx1; bd[bb + 7] = ey1 > ky1 ? ey1 : ky1;
        if (this.st[slot] !== ADAPT_OFF) this.lumaDirty[slot] = 1;
        return bits;
    }

    protected separateRim(key: number): boolean {
        return this.extended && (key & FEATURE_LIGHTS) !== 0 && ((key & (FEATURE_FADE | FEATURE_VEIL)) === 0 || this.groupLayer(key));
    }

    protected groupLayer(key: number): boolean {
        return this.extended && (key & (FEATURE_LIGHTS | FEATURE_FADE)) === (FEATURE_LIGHTS | FEATURE_FADE)
            && (key & (FEATURE_LENS | FEATURE_VEIL)) === 0
            && ((key & FEATURE_TINT) === 0 || ((key >>> MEMBER_SHIFT) === 0 && (key & (FEATURE_FIELD | FEATURE_UNEVEN)) === 0));
    }

    protected separateTint(key: number): boolean {
        return this.extended && (key & FEATURE_TINT) !== 0 && (key >>> MEMBER_SHIFT) === 0
            && (key & (FEATURE_FIELD | FEATURE_UNEVEN | FEATURE_LENS | FEATURE_VEIL)) === 0
            && ((key & FEATURE_FADE) === 0 || this.groupLayer(key));
    }

    protected program(key: number): WebGLProgram | null {
        const edr = this.frame[14] !== 1, hdr = this.frame[15] !== 0, blend = this.extended;
        const cacheKey = key * 8 + (edr ? 1 : 0) + (hdr ? 2 : 0) + (blend ? 4 : 0);
        const have = this.programs.get(cacheKey);
        if (have !== undefined) return have;
        const grid = (key >>> MEMBER_SHIFT) === 0 && (key & (FEATURE_FIELD | FEATURE_UNEVEN)) === 0;
        const gl = this.gl;
        let bodyKey = this.separateRim(key) ? key & ~FEATURE_LIGHTS : key;
        if (this.separateTint(key)) bodyKey &= ~FEATURE_TINT;
        // Keep the measured reflected-vertex context of the normalized HDR profile.
        const world = blend && grid && !hdr;
        const p = link(gl, world ? worldVertex() : shapeVertex(grid, blend), this.groupLayer(key) ? groupBodyFragment(bodyKey, edr, hdr, world) : glassFragment(bodyKey, edr, hdr, blend, blend, world));
        if (p === null) return null;
        gl.uniformBlockBinding(p, gl.getUniformBlockIndex(p, "M"), 0);
        gl.uniformBlockBinding(p, gl.getUniformBlockIndex(p, "F"), 1);
        if ((key >>> MEMBER_SHIFT) !== 0) gl.uniformBlockBinding(p, gl.getUniformBlockIndex(p, "U"), 2);
        gl.useProgram(p);
        gl.uniform1ui(gl.getUniformLocation(p, "uHalfBarrier"), 0);
        gl.uniform1i(gl.getUniformLocation(p, "uP"), 0);
        gl.uniform1i(gl.getUniformLocation(p, "uB"), 1);
        if ((key & FEATURE_TINT) !== 0) gl.uniform1i(gl.getUniformLocation(p, "uTintMask"), 7);
        if (blend) gl.uniform1i(gl.getUniformLocation(p, "uD"), 6);
        if ((key & FEATURE_FIELD) !== 0) {
            if ((key >>> MEMBER_SHIFT) === 0) gl.uniform1i(gl.getUniformLocation(p, "uF"), 2);
            else for (let k = 0; k < MMF; k++) gl.uniform1i(gl.getUniformLocation(p, "uF" + k), 2 + k);
        }
        this.programs.set(cacheKey, p);
        return p;
    }
}
