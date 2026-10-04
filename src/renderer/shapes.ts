// Shapes: the material rows (presets at the current scheme, presence and surroundings; custom descriptions), the shape
// rows, the program of the feature key and the backdrop region a slot asks for.
import {
    CORNER_SMOOTH, FEATURE_FADE, FEATURE_FIELD, FEATURE_ROUND_NORMAL, FEATURE_SHARP, FEATURE_UNEVEN, FEATURE_VEIL,
    MATERIAL_FLOATS, MAX_MEMBERS, MEMBER_BOX, MEMBER_FIELD, MEMBER_SHIFT, MEMBER_UNEVEN, SMOOTH_REACH
} from "../layout.js";
import { glassFragment, SHAPE_VERTEX } from "../kernels.js";
import { ADAPTIVE_SIDE, backdropRegion, type MaterialSpec, packMaterial, packTint } from "../material.js";
import { packPreset, presetFollows } from "../preset.js";
import {
    A, ADAPT_FIRST, ADAPT_LIVE, ADAPT_OFF, B, C, edge, F, G, GEN_MASK, GEN_SHIFT, GEOM_BOX, GEOM_FIELD, GEOM_UNEVEN, GEOM_UNION,
    MATERIAL_CUSTOM, MATERIAL_DARK, MAXL, MB, MF, MMF, R
} from "./lanes.js";
import { link } from "./shared.js";
import { State } from "./state.js";

// scratch of the region helper: capture x y w h, region x y w h, levels, low level
const REGION = new Int32Array(10);

/** Material and geometry rows of a slot, and its program. */
export abstract class Shapes extends State {
    // Start a slot as a new shape; returns its handle (a new generation, so handles of earlier users of the slot are dead).
    protected init(slot: number, kind: number, geom: number): number {
        const gen = (((this.gens[slot] as number) + 1) & GEN_MASK) || 1, a = this.ad, b = slot * A;
        this.kinds[slot] = kind;
        this.geoms[slot] = geom;
        this.st[slot] = ADAPT_OFF;
        this.fixedTone[slot] = 0;
        this.presets[slot] = 0;
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
        if (this.kinds[slot] !== MATERIAL_CUSTOM) this.packTone(slot);
        else if (this.packed[slot] !== this.ad[slot * A + 8]) this.packCustom(slot);
        this.finish(slot);
    }

    // Material rows of a custom material at the current presence, with its tint.
    protected packCustom(slot: number): void {
        const sp = this.specs[slot] as MaterialSpec | null, o = slot * this.stride, pr = this.ad[slot * A + 8] as number;
        if (sp === null) return;
        let f = packMaterial(this.blocks, o, this.geo, slot * G + 6, sp, pr, this.share, this.scale);
        if (f < 0) return;
        const t = this.tints, tb = slot * 4;
        f |= packTint(this.blocks, o, t[tb] as number, t[tb + 1] as number, t[tb + 2] as number, (t[tb + 3] as number) * pr, 0);
        this.feats[slot] = f;
        this.packed[slot] = pr;
        this.touch(slot);
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
        const t = this.tints, tb = slot * 4;
        f |= packTint(this.blocks, o, t[tb] as number, t[tb + 1] as number, t[tb + 2] as number, (t[tb + 3] as number) * pr, mix);
        this.feats[slot] = f;
        this.touch(slot);
    }

    // Shape rows, program and region demand of a slot.
    protected finish(slot: number): void {
        const g = this.geo, b = slot * G, d = this.blocks, o = slot * this.stride + MATERIAL_FLOATS;
        const veil = g[b + 20] as number, fade = g[b + 21] as number;
        let bits = this.packGeometry(slot);
        let p: WebGLProgram | null = null, key = -1;
        d[o + 36] = g[b + 19] as number; d[o + 37] = veil; d[o + 38] = fade;
        if (bits >= 0) {
            if (veil > 0) bits |= FEATURE_VEIL;
            if (fade < 1) bits |= FEATURE_FADE;
            // a mask field keeps its own direction: the ellipse mix applies to analytic outlines only (a union applies it
            // member by member)
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
            const e0 = E * r;
            d[o + 4] = r; d[o + 5] = e0; d[o + 6] = e0 + (r - e0) * (kx > ky ? kx : ky);
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
            // field texture: the frame grown by the reach of the shadow lookups, at device resolution, centred
            const ax = g[b + 10] as number, ay = g[b + 11] as number;
            const pad = (g[b + 6] as number) + ((ax < 0 ? -ax : ax) > (ay < 0 ? -ay : ay) ? (ax < 0 ? -ax : ax) : (ay < 0 ? -ay : ay)) + 2;
            const fw = Math.ceil((w + 2 * pad) * s), fh = Math.ceil((h + 2 * pad) * s), fd = this.fdim, f = slot * F;
            if (fw > this.maxTex || fh > this.maxTex || !(w > 0) || !(h > 0)) return -1;
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
            let fp = (g[b + 6] as number) + aa + 2; if (fp < sp + 2) fp = sp + 2;
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
                    const e0 = E * r;
                    u[v + 4] = r; u[v + 5] = e0; u[v + 6] = e0 + (r - e0) * (kx > ky ? kx : ky); u[v + 8] = kx; u[v + 9] = ky;
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

    protected program(key: number): WebGLProgram | null {
        const have = this.programs.get(key);
        if (have !== undefined) return have;
        const gl = this.gl, p = link(gl, SHAPE_VERTEX, glassFragment(key));
        if (p === null) return null;
        gl.uniformBlockBinding(p, gl.getUniformBlockIndex(p, "M"), 0);
        gl.uniformBlockBinding(p, gl.getUniformBlockIndex(p, "F"), 1);
        if ((key >>> MEMBER_SHIFT) !== 0) gl.uniformBlockBinding(p, gl.getUniformBlockIndex(p, "U"), 2);
        gl.useProgram(p);
        gl.uniform1i(gl.getUniformLocation(p, "uP"), 0);
        gl.uniform1i(gl.getUniformLocation(p, "uB"), 1);
        if ((key & FEATURE_FIELD) !== 0) {
            if ((key >>> MEMBER_SHIFT) === 0) gl.uniform1i(gl.getUniformLocation(p, "uF"), 2);
            else for (let k = 0; k < MMF; k++) gl.uniform1i(gl.getUniformLocation(p, "uF" + k), 2 + k);
        }
        this.programs.set(key, p);
        return p;
    }
}
