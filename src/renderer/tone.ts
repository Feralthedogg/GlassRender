import { SCHEME_DARK, SCHEME_LIGHT } from "../layout.js";
import { adaptScheme, luminanceLevel } from "../material.js";
import { A, ADAPT_FIRST, ADAPT_LIVE, ADAPT_OFF, MATERIAL_DARK, OMEGA, R } from "./lanes.js";
import { Atlas } from "./atlas.js";

/** Adaptive tone: luminance readings and transitions. */
export abstract class Tone extends Atlas {
    // Measure mean backdrop luminance under adaptive shapes of seq[start..end).
    // Mode 0 reads new shapes synchronously before the batch is drawn.
    // Mode 1 reads changed regions through a pixel buffer collected by `poll` on a later frame.
    // Mode 2 reads every adaptive shape synchronously. Returns true while a reading is open.
    protected measure(mode: number, start: number, end: number): boolean {
        const gl = this.gl, sq = this.seq, st = this.st, ld = this.lumaDirty, rg = this.reg, ls = this.list;
        if (mode === 1 && this.sync !== null) return true;
        let m = 0;
        for (let i = start; i < end; i++) {
            const slot = sq[i] as number, rb = slot * R, s = st[slot] as number;
            if (s === ADAPT_OFF || rg[rb + 14] === 0 || rg[rb + 8] !== 0) continue;
            if (mode === 0 ? s !== ADAPT_FIRST : mode === 1 && (s !== ADAPT_LIVE || ld[slot] === 0)) continue;
            // Keep readings ordered by atlas page.
            let j = m++;
            while (j > 0 && (rg[(ls[j - 1] as number) * R] as number) > (rg[rb] as number)) { ls[j] = ls[j - 1] as number; j--; }
            ls[j] = slot;
        }
        if (m === 0) return false;
        if (m > this.lumaCap) this.growLuma(m);
        const d = this.lumaData;
        for (let i = 0; i < m; i++) {
            const slot = ls[i] as number, rb = slot * R, a = i * 4, ax = rg[rb + 1] as number, ay = rg[rb + 2] as number;
            d[a] = ax + (rg[rb + 9] as number); d[a + 1] = ay + (rg[rb + 10] as number);
            d[a + 2] = ax + (rg[rb + 11] as number); d[a + 3] = ay + (rg[rb + 12] as number);
            ld[slot] = 0;
        }
        gl.bindVertexArray(this.lumaVao);
        gl.bindBuffer(0x8892, this.lumaBuf);
        gl.bufferData(0x8892, d, 0x88e8, 0, m * 4);
        gl.bindFramebuffer(0x8d40, this.lumaFbo);
        gl.viewport(0, 0, this.lumaCap, 1);
        gl.useProgram(this.luma);
        gl.activeTexture(0x84c0);
        let at = 0;
        while (at < m) {
            const page = rg[(ls[at] as number) * R] as number;
            let last = at + 1;
            while (last < m && rg[(ls[last] as number) * R] === page) last++;
            gl.bindTexture(0x0de1, this.pageTex[page] as WebGLTexture | null);
            gl.vertexAttribPointer(0, 4, 0x1406, false, 16, at * 16);
            gl.uniform2f(this.lumaW, 2 / this.lumaCap, at);
            gl.drawArraysInstanced(0, 0, 1, last - at);
            at = last;
        }
        if (mode !== 1) {
            gl.readPixels(0, 0, m, 1, 0x1908, 0x1401, this.lumaBytes);
            for (let i = 0; i < m; i++) this.adapt(ls[i] as number, i);
            return false;
        }
        const pend = this.pend, pg = this.pendGen, gens = this.gens;
        for (let i = 0; i < m; i++) { const slot = ls[i] as number; pend[i] = slot; pg[i] = gens[slot] as number; }
        this.pendCount = m;
        // Allocate fresh storage for every reading. Reusing storage that Chrome copied aside drops that copy and logs
        // a performance warning on every frame.
        gl.bindBuffer(0x88eb, this.pbo);
        gl.bufferData(0x88eb, this.lumaCap * 4, 0x88e1);
        gl.readPixels(0, 0, m, 1, 0x1908, 0x1401, 0);
        gl.bindBuffer(0x88eb, null);
        this.sync = gl.fenceSync(0x9117, 0);
        gl.flush();
        gl.bindFramebuffer(0x8d40, null);
        return true;
    }

    // Collect a finished pixel-buffer reading. Returns true while one is still open.
    protected poll(): boolean {
        const gl = this.gl, s = this.sync;
        if (s === null) return false;
        const r = gl.clientWaitSync(s, 0, 0);
        if (r === 0x911b) return true;
        gl.deleteSync(s);
        this.sync = null;
        if (r === 0x911d) { this.pendCount = 0; return false; }
        const m = this.pendCount, pend = this.pend, pg = this.pendGen, gens = this.gens;
        gl.bindBuffer(0x88eb, this.pbo);
        gl.getBufferSubData(0x88eb, 0, this.lumaBytes, 0, m * 4);
        gl.bindBuffer(0x88eb, null);
        for (let i = 0; i < m; i++) { const slot = pend[i] as number; if (gens[slot] === pg[i]) this.adapt(slot, i); }
        this.pendCount = 0;
        return false;
    }

    // Apply reading i to a slot: the first sets its scheme; later readings update its transition target.
    protected adapt(slot: number, i: number): void {
        const by = this.lumaBytes, a = this.ad, b = slot * A, s = this.st[slot] as number;
        const level = luminanceLevel(((by[i * 4] as number) + (by[i * 4 + 1] as number) / 255) / 255);
        const m = adaptScheme(level, this.kinds[slot] === MATERIAL_DARK ? SCHEME_DARK : SCHEME_LIGHT);
        if (s === ADAPT_FIRST) {
            a[b] = level; a[b + 1] = 0; a[b + 2] = m; a[b + 3] = 0; a[b + 4] = level; a[b + 5] = m;
            this.st[slot] = ADAPT_LIVE;
            this.packTone(slot);
        } else if (s === ADAPT_LIVE) { a[b + 4] = level; a[b + 5] = m; }
    }

    // Advance tone transitions by dt seconds. Returns true while one is running.
    protected animate(dt: number): boolean {
        const n = this.count, o = this.order, a = this.ad, st = this.st, e = Math.exp(-OMEGA * dt);
        let busy = false;
        for (let i = 0; i < n; i++) {
            const slot = o[i] as number, b = slot * A, pr = a[b + 8] as number, tp = a[b + 10] as number;
            if (pr !== tp) {
                // Use the same spring for appearing and disappearing presence.
                const c1 = pr - tp, c2 = (a[b + 9] as number) + OMEGA * c1;
                let x = (c1 + c2 * dt) * e, v = (c2 - OMEGA * (c1 + c2 * dt)) * e;
                if (x < 5e-4 && x > -5e-4 && v < 5e-3 && v > -5e-3) { x = 0; v = 0; }
                a[b + 8] = tp + x; a[b + 9] = v;
                this.refresh(slot);
                if (x !== 0) busy = true;
            }
            if (st[slot] !== ADAPT_LIVE) continue;
            const l = a[b] as number, tl = a[b + 4] as number, m = a[b + 2] as number, tm = a[b + 5] as number;
            if (l === tl && m === tm) continue;
            // Critically damped response: x = target + (c1 + c2 t) e^(-w t).
            let c1 = l - tl, c2 = (a[b + 1] as number) + OMEGA * c1, x = (c1 + c2 * dt) * e, v = (c2 - OMEGA * (c1 + c2 * dt)) * e;
            if (x < 5e-4 && x > -5e-4 && v < 5e-3 && v > -5e-3) { x = 0; v = 0; }
            a[b] = tl + x; a[b + 1] = v;
            c1 = m - tm; c2 = (a[b + 3] as number) + OMEGA * c1; x = (c1 + c2 * dt) * e; v = (c2 - OMEGA * (c1 + c2 * dt)) * e;
            if (x < 5e-4 && x > -5e-4 && v < 5e-3 && v > -5e-3) { x = 0; v = 0; }
            a[b + 2] = tm + x; a[b + 3] = v;
            this.packTone(slot);
            if (a[b] !== tl || a[b + 2] !== tm) busy = true;
        }
        return busy;
    }

    protected growLuma(m: number): void {
        const gl = this.gl;
        let c = this.lumaCap;
        if (this.sync !== null) {
            // Drop the open reading before replacing the pixel buffer; measure those shapes again later.
            gl.deleteSync(this.sync); this.sync = null;
            for (let i = 0; i < this.pendCount; i++) this.lumaDirty[this.pend[i] as number] = 1;
            this.pendCount = 0;
        }
        while (c < m) c <<= 1;
        this.lumaCap = c;
        this.lumaData = new Float32Array(c * 4);
        this.lumaBytes = new Uint8Array(c * 4);
        gl.activeTexture(0x84c0);
        gl.bindTexture(0x0de1, this.lumaTex);
        gl.texImage2D(0x0de1, 0, 0x8058, c, 1, 0, 0x1908, 0x1401, null);
        gl.bindBuffer(0x88eb, this.pbo); gl.bufferData(0x88eb, c * 4, 0x88e1); gl.bindBuffer(0x88eb, null);
    }
}
