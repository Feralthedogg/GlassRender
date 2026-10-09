/**
 * @file atlas.ts
 * @brief Backdrop dependency batches, atlas placement and blur passes.
 * @details A sweep over shape bounds determines which earlier shapes each batch must capture.
 */

import { MATERIAL_FLOATS } from "../layout.js";
import { ADAPT_OFF, B, C, FLAG_READ, FLAG_READS, INST, MAXL, MAXP, R, RGBA8, RGBA16F } from "./lanes.js";
import { Fields } from "./fields.js";

/** @brief Drawing order by depth and the blur pyramid atlas. */
export abstract class Atlas extends Fields {
    // Depth of every shape (how many layers of lower glass it sits on), the draw sequence and atlas placement.
    protected layout(): void {
        const n = this.count, o = this.order, bd = this.bounds, fl = this.flags, keys = this.draws, rg = this.reg, dp = this.depth;
        const sq = this.seq, ds = this.dstart, cu = this.list, cs = this.cs;
        let top = 0, fit = true, live = 0;
        // Retain the old dependency while the sweep rewrites flags. partial() reuses this scratch afterwards.
        const priorReads = this.rebuild;
        for (let i = 0; i < n; i++) { const si = o[i] as number; priorReads[si] = (fl[si] as number) & FLAG_READS; fl[si] = 0; dp[si] = 0; }
        // candidate pairs (shapes whose bounds overlap) by a sweep, listed with the later shape of each pair
        const np = this.flat ? 0 : this.sweep();
        const pr = this.pairs, cd = this.cand;
        for (let i = 0; i <= this.capacity; i++) cs[i] = 0;
        for (let k = 0; k < np; k++) { const v = pr[k * 2 + 1] as number; cs[v + 1] = (cs[v + 1] as number) + 1; }
        for (let i = 0; i < this.capacity; i++) cs[i + 1] = (cs[i + 1] as number) + (cs[i] as number);
        if (cd.length < np) this.cand = new Int32Array(np * 2);
        const cand = this.cand;
        for (let k = 0; k < np; k++) {
            const v = pr[k * 2 + 1] as number, at = cs[v] as number;
            cand[at] = pr[k * 2] as number; cs[v] = at + 1;
        }
        for (let i = this.capacity; i > 0; i--) cs[i] = cs[i - 1] as number;
        cs[0] = 0;
        for (let i = 0; i < n; i++) {
            const si = o[i] as number, a = si * B;
            if (keys[si] === 0) continue;
            live++;
            const dx0 = bd[a] as number, dy0 = bd[a + 1] as number, dx1 = bd[a + 2] as number, dy1 = bd[a + 3] as number;
            const rx0 = bd[a + 4] as number, ry0 = bd[a + 5] as number, rx1 = bd[a + 6] as number, ry1 = bd[a + 7] as number;
            let d = 0;
            for (let k = cs[si] as number, e = cs[si + 1] as number; k < e; k++) {
                const sj = cand[k] as number, c = sj * B;
                // a shape that reads pixels of a lower one goes into a later batch; one that only covers pixels the
                // lower one reads must not come earlier (inside a batch everything is captured before anything is drawn)
                if ((bd[c] as number) < rx1 && (bd[c + 2] as number) > rx0 && (bd[c + 1] as number) < ry1 && (bd[c + 3] as number) > ry0) {
                    fl[si] = (fl[si] as number) | FLAG_READS; fl[sj] = (fl[sj] as number) | FLAG_READ;
                    if ((dp[sj] as number) >= d) d = (dp[sj] as number) + 1;
                } else if ((dp[sj] as number) > d && dx0 < (bd[c + 6] as number) && dx1 > (bd[c + 4] as number)
                    && dy0 < (bd[c + 7] as number) && dy1 > (bd[c + 5] as number)) d = dp[sj] as number;
            }
            dp[si] = d;
            if (d > top) top = d;
        }
        // slots in depth order, drawing order kept inside a depth
        for (let d = 0; d <= top + 1; d++) ds[d] = 0;
        for (let i = 0; i < n; i++) { const slot = o[i] as number; if (keys[slot] !== 0) ds[(dp[slot] as number) + 1] = (ds[(dp[slot] as number) + 1] as number) + 1; }
        for (let d = 0; d <= top; d++) { ds[d + 1] = (ds[d + 1] as number) + (ds[d] as number); cu[d] = ds[d] as number; }
        for (let i = 0; i < n; i++) {
            const slot = o[i] as number;
            if (keys[slot] === 0) continue;
            const d = dp[slot] as number, at = cu[d] as number;
            sq[at] = slot; cu[d] = at + 1;
        }
        this.depths = top + 1;
        const layered = top > 0;
        if (layered !== this.layered) { this.layered = layered; this.backdropDirty = true; }
        const format = this.extended && this.halfFloat ? RGBA16F : RGBA8;
        for (let i = 0; i < live; i++) {
            const slot = sq[i] as number, rb = slot * R, cells = rg[rb + 13] as number;
            // Moving, raising or removing lower glass can turn an upper capture into backdrop-only.
            if (priorReads[slot] !== ((fl[slot] as number) & FLAG_READS)) rg[rb + 8] = 1;
            if (rg[rb + 14] !== 0 && this.pageDim[(rg[rb] as number) * 4 + 3] !== format) { fit = false; break; }
            if ((rg[rb + 14] === 0 || (rg[rb + 5] as number) > (rg[rb + 3] as number) || (rg[rb + 6] as number) > (rg[rb + 4] as number)
                || (rg[rb + 1] as number) % cells !== 0 || (rg[rb + 2] as number) % cells !== 0
                || (rg[rb + 7] as number) > (this.pageDim[(rg[rb] as number) * 4 + 2] as number)) && !this.placeOne(slot)) { fit = false; break; }
        }
        if (!fit) this.place();
        else for (let i = 0; i < live; i++) this.packRegion(sq[i] as number);
        this.layoutDirty = false;
        this.stale = true;
    }

    // Pairs of drawn shapes whose bounds (drawn and read rects together) overlap, as (earlier, later) in drawing order:
    // a sweep along the axis the shapes spread out on most, over an order kept from the last layout. Returns the count.
    protected sweep(): number {
        const n = this.count, o = this.order, bd = this.bounds, keys = this.draws, bx = this.bx, pos = this.pos, mk = this.mark, xs = this.xs;
        const st = ++this.stamp;
        let m = 0, lx = 1e30, hx = -1e30, ly = 1e30, hy = -1e30, sw = 0, sh = 0;
        for (let i = 0; i < n; i++) {
            const si = o[i] as number, a = si * B, q = si * 4;
            pos[si] = i;
            if (keys[si] === 0) continue;
            const x0 = (bd[a] as number) < (bd[a + 4] as number) ? bd[a] as number : bd[a + 4] as number;
            const y0 = (bd[a + 1] as number) < (bd[a + 5] as number) ? bd[a + 1] as number : bd[a + 5] as number;
            const x1 = (bd[a + 2] as number) > (bd[a + 6] as number) ? bd[a + 2] as number : bd[a + 6] as number;
            const y1 = (bd[a + 3] as number) > (bd[a + 7] as number) ? bd[a + 3] as number : bd[a + 7] as number;
            bx[q] = x0; bx[q + 1] = y0; bx[q + 2] = x1; bx[q + 3] = y1;
            if (x0 < lx) lx = x0; if (x1 > hx) hx = x1; if (y0 < ly) ly = y0; if (y1 > hy) hy = y1;
            sw += x1 - x0; sh += y1 - y0;
            mk[si] = st;
        }
        // the axis along which the shapes overlap least: span over the summed sizes
        const ax = (hx - lx) * sh >= (hy - ly) * sw ? 0 : 1;
        // the order of the last sweep (nearly sorted while shapes move a little), then new shapes
        for (let i = 0; i < this.xn; i++) { const si = xs[i] as number; if (mk[si] === st) { xs[m++] = si; mk[si] = -st; } }
        for (let i = 0; i < n; i++) { const si = o[i] as number; if (mk[si] === st) { xs[m++] = si; mk[si] = -st; } }
        this.xn = m;
        for (let i = 1; i < m; i++) {
            const v = xs[i] as number, k = bx[v * 4 + ax] as number;
            let j = i - 1;
            while (j >= 0 && (bx[(xs[j] as number) * 4 + ax] as number) > k) { xs[j + 1] = xs[j] as number; j--; }
            xs[j + 1] = v;
        }
        const act = this.act, by = 1 - ax;
        let na = 0, np = 0;
        for (let i = 0; i < m; i++) {
            const v = xs[i] as number, q = v * 4, lo = bx[q + ax] as number, c0 = bx[q + by] as number, c1 = bx[q + by + 2] as number;
            let k = 0;
            for (let a = 0; a < na; a++) { const w = act[a] as number; if ((bx[w * 4 + ax + 2] as number) > lo) act[k++] = w; }
            na = k;
            for (let a = 0; a < na; a++) {
                const w = act[a] as number, r = w * 4;
                if ((bx[r + by] as number) < c1 && (bx[r + by + 2] as number) > c0) {
                    if ((np + 1) * 2 > this.pairs.length) { const g = new Int32Array(this.pairs.length * 2); g.set(this.pairs); this.pairs = g; }
                    const pr = this.pairs, early = (pos[w] as number) < (pos[v] as number);
                    pr[np * 2] = early ? w : v; pr[np * 2 + 1] = early ? v : w; np++;
                }
            }
            act[na++] = v;
        }
        return np;
    }

    // Region rows of a placed slot: pixel (y up) -> atlas uv of the region, and the region rect in uv.
    protected packRegion(slot: number): void {
        const rg = this.reg, rb = slot * R, d = this.blocks, o = slot * this.stride + MATERIAL_FLOATS, q = this.cap, c = slot * C;
        const pg = (rg[rb] as number) * 4, iw = 1 / (this.pageDim[pg] as number), ih = 1 / (this.pageDim[pg + 1] as number);
        const T = q[c + 2] as number, iT = 1 / T, ax = rg[rb + 1] as number, ay = rg[rb + 2] as number;
        // grid position (texels from the bottom-left corner of the target) of the region's first texel
        const gx = (q[c] as number) * iT + (q[c + 4] as number), gy = (q[c + 1] as number) * iT + (q[c + 5] as number);
        const v0 = iT * iw, v1 = iT * ih, v2 = (ax - gx) * iw, v3 = (ay - gy) * ih;
        const v4 = ax * iw, v5 = ay * ih, v6 = (ax + (rg[rb + 5] as number)) * iw, v7 = (ay + (rg[rb + 6] as number)) * ih;
        // rows that stay the same need no upload; a region that moved is built again anyway (its output stays the same)
        if (d[o + 16] === Math.fround(v0) && d[o + 17] === Math.fround(v1) && d[o + 18] === Math.fround(v2) && d[o + 19] === Math.fround(v3)
            && d[o + 20] === Math.fround(v4) && d[o + 21] === Math.fround(v5) && d[o + 22] === Math.fround(v6) && d[o + 23] === Math.fround(v7)) return;
        d[o + 16] = v0; d[o + 17] = v1; d[o + 18] = v2; d[o + 19] = v3; d[o + 20] = v4; d[o + 21] = v5; d[o + 22] = v6; d[o + 23] = v7;
        this.stage(slot);
    }

    // Put one region into the free space left on the last page (new or grown shapes). False when it does not fit.
    protected placeOne(slot: number): boolean {
        const rg = this.reg, rb = slot * R, page = this.shelfPage, pd = this.pageDim;
        if (page < 0 || this.pageTex[page] === null) return false;
        const pw = rg[rb + 5] as number, ph = rg[rb + 6] as number, cells = rg[rb + 13] as number;
        const W = pd[page * 4] as number, H = pd[page * 4 + 1] as number;
        if ((rg[rb + 7] as number) > (pd[page * 4 + 2] as number)) return false;
        let ax = Math.ceil(this.shelfX / cells) * cells, y = this.shelfY, shelf = this.shelfH, ay = Math.ceil(y / cells) * cells;
        if (ax + pw > W) { y += shelf; shelf = 0; ax = 0; ay = Math.ceil(y / cells) * cells; }
        if (ax + pw > W || ay + ph > H) return false;
        rg[rb] = page; rg[rb + 1] = ax; rg[rb + 2] = ay; rg[rb + 3] = pw; rg[rb + 4] = ph; rg[rb + 8] = 1; rg[rb + 14] = 1;
        this.shelfX = ax + pw; this.shelfY = y; this.shelfH = ay + ph - y > shelf ? ay + ph - y : shelf;
        return true;
    }

    // Shelf packing of every region into atlas pages, tallest first; all regions are rebuilt afterwards.
    protected place(): void {
        const n = this.count, o = this.order, rg = this.reg, keys = this.draws, ls = this.list, max = this.maxTex;
        this.full = true;
        let m = 0, area = 0, wide = 1;
        for (let i = 0; i < n; i++) {
            const slot = o[i] as number, rb = slot * R, pw = rg[rb + 5] as number, ph = rg[rb + 6] as number;
            rg[rb + 14] = 0;
            if (keys[slot] === 0 || pw > max || ph > max) continue;
            let j = m++;
            // Equal-height regions keep a placement independent of drawing order.
            // Moving a shape above another must not change its sampling coordinates in a fresh scene.
            while (j > 0) {
                const prior = ls[j - 1] as number, priorHeight = rg[prior * R + 6] as number;
                if (priorHeight > ph || (priorHeight === ph && prior < slot)) break;
                ls[j] = prior; j--;
            }
            ls[j] = slot;
            area += pw * ph; if (pw > wide) wide = pw;
        }
        let W = 256;
        while (W < wide || W * W < area * 1.2) W <<= 1;
        if (W > max) W = max;
        let page = 0, x = 0, y = 0, shelf = 0, used = 0, top = 1;
        for (let i = 0; i < m; i++) {
            const slot = ls[i] as number, rb = slot * R, pw = rg[rb + 5] as number, ph = rg[rb + 6] as number, cells = rg[rb + 13] as number;
            let ax = Math.ceil(x / cells) * cells, ay = Math.ceil(y / cells) * cells;
            if (ax + pw > W) { y += shelf; shelf = 0; ax = 0; ay = Math.ceil(y / cells) * cells; }
            if (ay + ph > max) {
                this.openPage(page, W, used, top);
                if (++page === MAXP) { page = -1; break; }
                y = 0; shelf = 0; used = 0; top = 1; ax = 0; ay = 0;
            }
            rg[rb] = page; rg[rb + 1] = ax; rg[rb + 2] = ay; rg[rb + 3] = pw; rg[rb + 4] = ph; rg[rb + 8] = 1; rg[rb + 14] = 1;
            x = ax + pw;
            this.shelfX = x; this.shelfY = y;
            if (ay + ph - y > shelf) shelf = ay + ph - y;
            if (ay + ph > used) used = ay + ph;
            if ((rg[rb + 7] as number) > top) top = rg[rb + 7] as number;
            this.shelfH = shelf;
        }
        this.shelfPage = m > 0 ? page : -1;
        if (page >= 0) { if (m > 0) this.openPage(page, W, used, top); page = m > 0 ? page + 1 : 0; } else page = MAXP;
        for (let i = page; i < MAXP; i++) this.dropPage(i);
        this.pages = page;
        for (let i = 0; i < m; i++) { const slot = ls[i] as number; if (rg[slot * R + 14] !== 0) this.packRegion(slot); }
    }

    // Texture and level framebuffers of an atlas page; kept when the size is unchanged.
    protected openPage(page: number, w: number, used: number, levels: number): void {
        const gl = this.gl, pd = this.pageDim, pb = page * 4, step = 1 << (levels - 1 > 9 ? levels - 1 : 9);
        const h = Math.ceil((used > 1 ? used : 1) / step) * step, format = this.extended && this.halfFloat ? RGBA16F : RGBA8;
        if (this.pageTex[page] !== null && pd[pb] === w && pd[pb + 1] === h && pd[pb + 2] === levels && pd[pb + 3] === format) return;
        this.dropPage(page);
        const t = gl.createTexture() as WebGLTexture | null;
        if (t === null) return;
        gl.activeTexture(0x84c0);
        gl.bindTexture(0x0de1, t);
        gl.texStorage2D(0x0de1, levels, format, w, h);
        gl.texParameteri(0x0de1, 0x2801, 0x2703); gl.texParameteri(0x0de1, 0x2800, 0x2601);
        gl.texParameteri(0x0de1, 0x2802, 0x812f); gl.texParameteri(0x0de1, 0x2803, 0x812f);
        const f = this.pageFbo, fb = page * MAXL;
        for (let k = 0; k < levels; k++) {
            const fbo = gl.createFramebuffer() as WebGLFramebuffer | null;
            if (fbo === null) { gl.deleteTexture(t); for (let j = 0; j < k; j++) { gl.deleteFramebuffer(f[fb + j] as WebGLFramebuffer | null); f[fb + j] = null; } return; }
            gl.bindFramebuffer(0x8d40, fbo);
            gl.framebufferTexture2D(0x8d40, 0x8ce0, 0x0de1, t, k);
            f[fb + k] = fbo;
        }
        this.pageTex[page] = t;
        pd[pb] = w; pd[pb + 1] = h; pd[pb + 2] = levels; pd[pb + 3] = format;
    }

    protected dropPage(page: number): void {
        const gl = this.gl, f = this.pageFbo, fb = page * MAXL, t = this.pageTex[page] as WebGLTexture | null, pb = page * 4;
        if (t === null) return;
        for (let k = 0; k < MAXL; k++) { const o = f[fb + k] as WebGLFramebuffer | null; if (o !== null) { gl.deleteFramebuffer(o); f[fb + k] = null; } }
        gl.deleteTexture(t);
        this.pageTex[page] = null;
        this.pageDim[pb] = 0; this.pageDim[pb + 1] = 0; this.pageDim[pb + 2] = 0; this.pageDim[pb + 3] = 0;
    }

    // Instance record of a slot region at index i: region rect (atlas base texels), capture origin px and texel size,
    // position of the region's first texel in the capture and the capture size.
    protected instance(i: number, slot: number): void {
        const d = this.inst, a = i * INST, rg = this.reg, rb = slot * R, q = this.cap, c = slot * C;
        d[a] = rg[rb + 1] as number; d[a + 1] = rg[rb + 2] as number; d[a + 2] = rg[rb + 5] as number; d[a + 3] = rg[rb + 6] as number;
        for (let k = 0; k < 8; k++) d[a + 4 + k] = q[c + k] as number;
        this.lvl[i] = rg[rb + 7] as number;
        rg[rb + 8] = 0;
        if (this.st[slot] !== ADAPT_OFF) this.lumaDirty[slot] = 1;
    }

    // Rebuild the pyramids of the stale regions of one batch (slots seq[start..end)): one pass per level and page.
    // mode 0: stale regions and (glass over glass) every shape that reads another; 1: every region; 2: the regions
    // flagged in `rebuild` (a partial frame)
    protected build(mode: number, start: number, end: number): void {
        const gl = this.gl, sq = this.seq, rg = this.reg, ls = this.list, fl = this.flags, layered = this.layered, rbf = this.rebuild;
        let m = 0;
        for (let i = start; i < end; i++) {
            const slot = sq[i] as number, rb = slot * R;
            if (rg[rb + 14] === 0) continue;
            if (mode === 2) { if (rbf[slot] === 0) continue; }
            // a shape over lower glass follows every change below it
            else if (mode === 0 && rg[rb + 8] === 0 && !(layered && ((fl[slot] as number) & FLAG_READS) !== 0)) continue;
            // ordered by page, then by level count (most levels first)
            const k = (rg[rb] as number) * 16 - (rg[rb + 7] as number);
            let j = m++;
            while (j > 0) { const p = (ls[j - 1] as number) * R, kp = (rg[p] as number) * 16 - (rg[p + 7] as number); if (kp <= k) break; ls[j] = ls[j - 1] as number; j--; }
            ls[j] = slot;
        }
        if (m === 0) return;
        for (let i = 0; i < m; i++) this.instance(i, ls[i] as number);
        gl.bindVertexArray(this.buildVao);
        gl.bindBuffer(0x8892, this.instBuf);
        gl.bufferData(0x8892, this.inst, 0x88e8, 0, m * INST);
        let first = 0, moved = false;
        while (first < m) {
            const page = rg[(ls[first] as number) * R] as number;
            let last = first + 1;
            while (last < m && rg[(ls[last] as number) * R] === page) last++;
            if (first !== 0) { moved = true; for (let i = 0; i < 3; i++) gl.vertexAttribPointer(i, 4, 0x1406, false, 48, first * 48 + i * 16); }
            this.pass(first, last - first, page);
            first = last;
        }
        if (moved) for (let i = 0; i < 3; i++) gl.vertexAttribPointer(i, 4, 0x1406, false, 48, i * 16);
    }

    // Base level, first level and blur chain of `count` instances starting at `first` (most levels first), all on one page.
    protected pass(first: number, count: number, page: number): void {
        const gl = this.gl, pd = this.pageDim, pb = page * 4, f = this.pageFbo, fb = page * MAXL, lv = this.lvl;
        const t = this.pageTex[page] as WebGLTexture | null;
        if (t === null) return;
        let w = pd[pb] as number, h = pd[pb + 1] as number;
        gl.bindTexture(0x0de1, t);
        gl.bindFramebuffer(0x8d40, f[fb] as WebGLFramebuffer | null);
        gl.viewport(0, 0, w, h);
        gl.useProgram(this.capture);
        gl.uniform3f(this.captureS, 2 / w, 2 / h, 1);
        gl.drawArraysInstanced(5, 0, 4, count);
        const top = lv[first] as number;
        const floating = pd[pb + 3] === RGBA16F, firstProgram = floating ? this.first : this.first8;
        const firstLocation = floating ? this.firstS : this.first8S, downProgram = floating ? this.down : this.down8;
        const downLocation = floating ? this.downS : this.down8S;
        let live = count, sc = 1;
        for (let k = 1; k < top; k++) {
            while (live > 0 && (lv[first + live - 1] as number) <= k) live--;
            if (live === 0) break;
            w >>= 1; h >>= 1; sc *= 0.5;
            gl.texParameteri(0x0de1, 0x813c, k - 1); gl.texParameteri(0x0de1, 0x813d, k - 1);
            gl.bindFramebuffer(0x8d40, f[fb + k] as WebGLFramebuffer | null);
            gl.viewport(0, 0, w, h);
            if (k === 1) {
                // the first level reads the captured texels with the capture's edge rule
                gl.useProgram(firstProgram);
                gl.uniform3f(firstLocation, 2 / w, 2 / h, sc);
            } else {
                if (k === 2) gl.useProgram(downProgram);
                gl.uniform3f(downLocation, 2 / w, 2 / h, sc);
            }
            gl.drawArraysInstanced(5, 0, 4, live);
        }
        gl.texParameteri(0x0de1, 0x813c, 0); gl.texParameteri(0x0de1, 0x813d, (pd[pb + 2] as number) - 1);
    }
}
