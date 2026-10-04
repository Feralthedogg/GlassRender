// Uploads, layered and partial redraws, and frame output.
import { BLOCK_BYTES, FEATURE_FIELD, UNION_BYTES } from "../layout.js";
import { headroomShare } from "../material.js";
import { A, ADAPT_LIVE, B, DRAW_BOTH, FLAG_READ, GEOM_FIELD, GEOM_UNION, MATERIAL_CUSTOM, R, RGBA16F, RGBA8 } from "./lanes.js";
import { Tone } from "./tone.js";

/** One frame: uploads, depth batches, the kept scene and the output range. */
export abstract class Frame extends Tone {
    // Upload the stale parts of the shape and union blocks.
    protected upload(): void {
        const gl = this.gl;
        let bytes = this.blocks.length << 2;
        if (bytes !== this.uboBytes) {
            gl.bindBuffer(0x8a11, this.ubo);
            gl.bufferData(0x8a11, this.blocks, 0x88e8);
            this.uboBytes = bytes; this.dirtyLo = this.blocks.length; this.dirtyHi = 0;
        } else if (this.dirtyHi > this.dirtyLo) {
            gl.bindBuffer(0x8a11, this.ubo);
            gl.bufferSubData(0x8a11, this.dirtyLo << 2, this.blocks, this.dirtyLo, this.dirtyHi - this.dirtyLo);
            this.dirtyLo = this.blocks.length; this.dirtyHi = 0;
        }
        bytes = this.ublocks.length << 2;
        if (bytes !== this.uuboBytes) {
            gl.bindBuffer(0x8a11, this.unionUbo);
            gl.bufferData(0x8a11, this.ublocks, 0x88e8);
            this.uuboBytes = bytes; this.udirtyLo = this.ublocks.length; this.udirtyHi = 0;
        } else if (this.udirtyHi > this.udirtyLo) {
            gl.bindBuffer(0x8a11, this.unionUbo);
            gl.bufferSubData(0x8a11, this.udirtyLo << 2, this.ublocks, this.udirtyLo, this.udirtyHi - this.udirtyLo);
            this.udirtyLo = this.ublocks.length; this.udirtyHi = 0;
        }
    }

    // Layered frame start: the backdrop goes into the scene and into the copy the shapes read. Backdrop on unit 1.
    protected begin(): void {
        const gl = this.gl, w = this.width, h = this.height;
        if (this.sceneTex === null || this.sceneW !== w || this.sceneH !== h) this.openScene(w, h);
        gl.bindVertexArray(this.vao);
        gl.bindFramebuffer(0x8d40, this.bothFbo);
        gl.viewport(0, 0, w, h);
        gl.useProgram(this.split);
        gl.uniform1f(this.splitT, this.topDown ? 1 : 0);
        gl.drawArrays(4, 0, 3);
        gl.bindTexture(0x0de1, this.copyTex);
    }

    // Copy the pixels the READ shapes of seq[start..end) cover, inside the clip box, into the texture later shapes read:
    // one blit of the box around them (the scene holds only this depth and the ones below it yet, so the extra
    // pixels in that box are right as well, and one copy is far cheaper than one per shape).
    protected keepDepth(start: number, end: number): void {
        const gl = this.gl, bd = this.bounds, sq = this.seq, fl = this.flags, c = this.clip;
        let x0 = 1e30, y0 = 1e30, x1 = -1e30, y1 = -1e30;
        for (let i = start; i < end; i++) {
            const slot = sq[i] as number, b = slot * B;
            if (((fl[slot] as number) & FLAG_READ) === 0) continue;
            if ((bd[b] as number) < x0) x0 = bd[b] as number; if ((bd[b + 1] as number) < y0) y0 = bd[b + 1] as number;
            if ((bd[b + 2] as number) > x1) x1 = bd[b + 2] as number; if ((bd[b + 3] as number) > y1) y1 = bd[b + 3] as number;
        }
        let bx0 = Math.floor(x0), by0 = Math.floor(y0), bx1 = Math.ceil(x1), by1 = Math.ceil(y1);
        if (bx0 < (c[0] as number)) bx0 = c[0] as number; if (by0 < (c[1] as number)) by0 = c[1] as number;
        if (bx1 > (c[2] as number)) bx1 = c[2] as number; if (by1 > (c[3] as number)) by1 = c[3] as number;
        if (bx1 <= bx0 || by1 <= by0) return;
        gl.bindFramebuffer(0x8ca8, this.sceneFbo);
        gl.bindFramebuffer(0x8ca9, this.copyFbo);
        gl.blitFramebuffer(bx0, by0, bx1, by1, bx0, by0, bx1, by1, 0x4000, 0x2600);
        gl.bindFramebuffer(0x8d40, this.sceneFbo);
    }

    // Draw the shapes of seq[start..end) into the bound target (with `clipped`, only those that reach the clip box).
    protected drawDepth(start: number, end: number, clipped: boolean): void {
        const gl = this.gl, progs = this.progs, ubo = this.ubo, sb = this.strideBytes, reg = this.reg, geoms = this.geoms;
        const pt = this.pageTex, sq = this.seq, bd = this.bounds, c = this.clip;
        const cx0 = c[0] as number, cy0 = c[1] as number, cx1 = c[2] as number, cy1 = c[3] as number;
        this.upload();
        // the shadow around a shape blends over what is there; its body replaces it
        gl.enable(0x0be2); gl.blendFunc(1, 0x0303);
        let cur: WebGLProgram | null = null, page = -1;
        for (let i = start; i < end; i++) {
            const slot = sq[i] as number, p = progs[slot] as WebGLProgram | null, rb = slot * R, b = slot * B;
            if (p === null || reg[rb + 14] === 0) continue;
            if (clipped && ((bd[b] as number) >= cx1 || (bd[b + 2] as number) <= cx0 || (bd[b + 1] as number) >= cy1 || (bd[b + 3] as number) <= cy0)) continue;
            if (p !== cur) { gl.useProgram(p); cur = p; }
            const pg = reg[rb] as number;
            if (pg !== page) { gl.bindTexture(0x0de1, pt[pg] as WebGLTexture | null); page = pg; }
            const gk = geoms[slot] as number;
            if (gk === GEOM_UNION) {
                gl.bindBufferRange(0x8a11, 2, this.unionUbo, slot * this.ustrideBytes, UNION_BYTES);
                if (((this.keys[slot] as number) & FEATURE_FIELD) !== 0 && !this.bindMemberFields(slot)) continue;
            } else if (gk === GEOM_FIELD) {
                const ft = this.fields[slot] as WebGLTexture | null;
                if (ft === null) continue;
                gl.activeTexture(0x84c2); gl.bindTexture(0x0de1, ft); gl.activeTexture(0x84c0);
            }
            gl.bindBufferRange(0x8a11, 0, ubo, slot * sb, BLOCK_BYTES);
            gl.drawArrays(5, 0, 4);
        }
        gl.disable(0x0be2);
    }

    // A partial frame of a kept layered scene. The pixels that change are the old and new bounds of the shapes whose
    // output changed, and the bounds of every shape that reads such pixels: in drawing order, since a shape only reads
    // the shapes drawn before it. Those readers rebuild their pyramids. The box around all of them and around the
    // regions the rebuilt shapes capture is drawn again from the backdrop up, every shape that reaches it clipped to it;
    // depths without such shapes are skipped and the rest of the scene stays as it was.
    protected partial(): void {
        const gl = this.gl, n = this.count, o = this.order, bd = this.bounds, sh = this.shown, ch = this.changed, rf = this.rebuild;
        const rg = this.reg, dw = this.draws;
        let dl = this.drect, nr = 0, x0 = 1e30, y0 = 1e30, x1 = -1e30, y1 = -1e30;
        for (let i = 0; i < n; i++) {
            const s = o[i] as number, b = s * B, q = s * 4, drawn = dw[s] !== 0 && rg[s * R + 14] !== 0, changed = ch[s] !== 0;
            rf[s] = 0;
            if (!drawn && !changed) continue;
            if (nr * 4 + 8 > dl.length) { const g = new Float32Array(dl.length * 2); g.set(dl); dl = g; this.drect = g; }
            // the shapes drawn before it decide what it captures (its own change does not)
            const reads = drawn && nr > 0 && this.reads(s, nr);
            if (drawn && (reads || rg[s * R + 8] !== 0)) {
                // its pyramid is built again (also when only its atlas region moved): that capture reads the copy
                // texture over its whole region, so the region is composed again too
                rf[s] = 1;
                if ((bd[b + 4] as number) < x0) x0 = bd[b + 4] as number; if ((bd[b + 5] as number) < y0) y0 = bd[b + 5] as number;
                if ((bd[b + 6] as number) > x1) x1 = bd[b + 6] as number; if ((bd[b + 7] as number) > y1) y1 = bd[b + 7] as number;
            }
            if (changed) {
                // its pixels as last drawn
                const sx0 = sh[q] as number, sy0 = sh[q + 1] as number, sx1 = sh[q + 2] as number, sy1 = sh[q + 3] as number;
                if (sx1 > sx0) {
                    const r = nr++ * 4;
                    dl[r] = sx0; dl[r + 1] = sy0; dl[r + 2] = sx1; dl[r + 3] = sy1;
                    if (sx0 < x0) x0 = sx0; if (sy0 < y0) y0 = sy0; if (sx1 > x1) x1 = sx1; if (sy1 > y1) y1 = sy1;
                }
            }
            if (drawn && (changed || reads)) {
                // its pixels as drawn now
                const r = nr++ * 4, dx0 = bd[b] as number, dy0 = bd[b + 1] as number, dx1 = bd[b + 2] as number, dy1 = bd[b + 3] as number;
                dl[r] = dx0; dl[r + 1] = dy0; dl[r + 2] = dx1; dl[r + 3] = dy1;
                if (dx0 < x0) x0 = dx0; if (dy0 < y0) y0 = dy0; if (dx1 > x1) x1 = dx1; if (dy1 > y1) y1 = dy1;
            }
        }
        const W = this.width, H = this.height, c = this.clip;
        let bx0 = Math.floor(x0), by0 = Math.floor(y0), bx1 = Math.ceil(x1), by1 = Math.ceil(y1);
        if (bx0 < 0) bx0 = 0; if (by0 < 0) by0 = 0; if (bx1 > W) bx1 = W; if (by1 > H) by1 = H;
        if (bx1 <= bx0 || by1 <= by0) return;
        c[0] = bx0; c[1] = by0; c[2] = bx1; c[3] = by1;
        gl.activeTexture(0x84c1);
        gl.bindTexture(0x0de1, this.source);
        gl.enable(0x0c11); gl.scissor(bx0, by0, bx1 - bx0, by1 - by0);
        this.begin();
        gl.disable(0x0c11);
        gl.activeTexture(0x84c0);
        const sq = this.seq, ds = this.dstart, nd = this.depths;
        for (let d = 0; d < nd; d++) {
            const start = ds[d] as number, end = ds[d + 1] as number;
            let any = false;
            for (let i = start; i < end; i++) {
                const b = (sq[i] as number) * B;
                if ((bd[b] as number) < bx1 && (bd[b + 2] as number) > bx0 && (bd[b + 1] as number) < by1 && (bd[b + 3] as number) > by0) { any = true; break; }
            }
            if (!any) continue;
            this.build(2, start, end);
            this.measure(0, start, end);
            gl.bindVertexArray(this.vao);
            gl.bindFramebuffer(0x8d40, this.sceneFbo);
            gl.viewport(0, 0, W, H);
            gl.enable(0x0c11); gl.scissor(bx0, by0, bx1 - bx0, by1 - by0);
            this.drawDepth(start, end, true);
            gl.disable(0x0c11);
            if (d + 1 < nd) this.keepDepth(start, end);
        }
    }

    // Whether the read rect of a slot meets one of the first nr changed rects.
    protected reads(slot: number, nr: number): boolean {
        const bd = this.bounds, b = slot * B, dl = this.drect;
        const rx0 = bd[b + 4] as number, ry0 = bd[b + 5] as number, rx1 = bd[b + 6] as number, ry1 = bd[b + 7] as number;
        for (let k = 0; k < nr; k++) {
            const r = k * 4;
            if ((dl[r] as number) < rx1 && (dl[r + 2] as number) > rx0 && (dl[r + 1] as number) < ry1 && (dl[r + 3] as number) > ry0) return true;
        }
        return false;
    }

    // After a frame: what every slot covers now, and no slot has changed since.
    protected settleShown(): void {
        const n = this.capacity, bd = this.bounds, sh = this.shown, ch = this.changed, dw = this.draws, rg = this.reg, progs = this.progs;
        for (let s = 0; s < n; s++) {
            const q = s * 4, b = s * B;
            if (dw[s] !== 0 && rg[s * R + 14] !== 0 && progs[s] !== null) {
                sh[q] = bd[b] as number; sh[q + 1] = bd[b + 1] as number; sh[q + 2] = bd[b + 2] as number; sh[q + 3] = bd[b + 3] as number;
            } else { sh[q] = 0; sh[q + 1] = 0; sh[q + 2] = 0; sh[q + 3] = 0; }
            ch[s] = 0;
        }
    }

    // Layered frame end: the scene goes to the default framebuffer.
    protected show(): void {
        const gl = this.gl;
        gl.bindVertexArray(this.vao);
        gl.bindFramebuffer(0x8d40, null);
        gl.viewport(0, 0, this.width, this.height);
        gl.activeTexture(0x84c1);
        gl.bindTexture(0x0de1, this.sceneTex);
        gl.useProgram(this.present);
        gl.drawArrays(4, 0, 3);
        gl.activeTexture(0x84c0);
    }

    protected openScene(w: number, h: number): void {
        const gl = this.gl;
        this.dropScene();
        const a = gl.createTexture() as WebGLTexture | null, b = gl.createTexture() as WebGLTexture | null;
        const fa = gl.createFramebuffer() as WebGLFramebuffer | null, fb = gl.createFramebuffer() as WebGLFramebuffer | null;
        const fc = gl.createFramebuffer() as WebGLFramebuffer | null;
        if (a === null || b === null || fa === null || fb === null || fc === null) {
            gl.deleteTexture(a); gl.deleteTexture(b); gl.deleteFramebuffer(fa); gl.deleteFramebuffer(fb); gl.deleteFramebuffer(fc);
            return;
        }
        gl.activeTexture(0x84c2);
        for (let i = 0; i < 2; i++) {
            gl.bindTexture(0x0de1, i === 0 ? a : b);
            gl.texStorage2D(0x0de1, 1, this.extended ? RGBA16F : RGBA8, w, h);
            gl.texParameteri(0x0de1, 0x2801, 0x2601); gl.texParameteri(0x0de1, 0x2800, 0x2601);
            gl.texParameteri(0x0de1, 0x2802, 0x812f); gl.texParameteri(0x0de1, 0x2803, 0x812f);
        }
        gl.bindTexture(0x0de1, null);
        gl.activeTexture(0x84c1);
        gl.bindFramebuffer(0x8d40, fa); gl.framebufferTexture2D(0x8d40, 0x8ce0, 0x0de1, a, 0);
        gl.bindFramebuffer(0x8d40, fb); gl.framebufferTexture2D(0x8d40, 0x8ce0, 0x0de1, b, 0);
        gl.bindFramebuffer(0x8d40, fc);
        gl.framebufferTexture2D(0x8d40, 0x8ce0, 0x0de1, a, 0); gl.framebufferTexture2D(0x8d40, 0x8ce1, 0x0de1, b, 0);
        gl.drawBuffers(DRAW_BOTH);
        this.sceneTex = a; this.copyTex = b; this.sceneFbo = fa; this.copyFbo = fb; this.bothFbo = fc;
        this.sceneW = w; this.sceneH = h;
    }

    protected dropScene(): void {
        const gl = this.gl;
        if (this.sceneTex === null) return;
        gl.deleteFramebuffer(this.sceneFbo); gl.deleteFramebuffer(this.copyFbo); gl.deleteFramebuffer(this.bothFbo);
        gl.deleteTexture(this.sceneTex); gl.deleteTexture(this.copyTex);
        this.sceneTex = null; this.copyTex = null; this.sceneFbo = null; this.copyFbo = null; this.bothFbo = null;
        this.sceneW = 0; this.sceneH = 0;
    }

    // Drawing buffer format and extended-range share for the wanted range.
    protected applyRange(): void {
        const gl = this.gl as WebGL2RenderingContext & { drawingBufferStorage?: (format: number, w: number, h: number) => void;
            readonly drawingBufferFormat?: number };
        let ext = false;
        if (typeof gl.drawingBufferStorage === "function") {
            // browsers give a half-float buffer only to a context with an alpha channel (asking without one is an error)
            const attributes = gl.getContextAttributes();
            if (this.wantExtended && this.halfFloat && attributes !== null && attributes.alpha === true) {
                gl.drawingBufferStorage(RGBA16F, this.width, this.height);
                ext = gl.drawingBufferFormat === RGBA16F;
            }
            if (!ext && this.extended) gl.drawingBufferStorage(RGBA8, this.width, this.height);
        }
        const share = ext ? headroomShare(this.headroom) : 0;
        if (ext !== this.extended) { this.extended = ext; this.dropScene(); this.backdropDirty = true; this.frame[2] = ext ? 0 : 1; this.frameDirty = true; }
        if (share !== this.share) {
            this.share = share;
            const n = this.capacity, kinds = this.kinds;
            for (let i = 0; i < n; i++) {
                const k = kinds[i] as number;
                if (k === 0) continue;
                if (k === MATERIAL_CUSTOM) this.packed[i] = -1;
                this.refresh(i);
            }
        }
        this.stale = true;
    }

    /**
     * Finish every transition now: renders once, reads the backdrop luminance under each adaptive shape (a blocking
     * read) and jumps to the settled tone; shapes that are appearing or disappearing jump to their end state. Use it
     * before `render` when a single frame must be final.
     */
    settle(): void {
        this.render(this.lastTime < 0 ? 0 : this.lastTime);
        this.measure(2, 0, this.dstart[this.depths] as number);
        const n = this.count, o = this.order, a = this.ad;
        for (let i = 0; i < n; i++) {
            const slot = o[i] as number, b = slot * A, moving = a[b + 8] !== a[b + 10];
            if (this.st[slot] === ADAPT_LIVE) { a[b] = a[b + 4] as number; a[b + 1] = 0; a[b + 2] = a[b + 5] as number; a[b + 3] = 0; }
            a[b + 8] = a[b + 10] as number; a[b + 9] = 0;
            if (moving) this.refresh(slot);
            else if (this.st[slot] === ADAPT_LIVE) this.packTone(slot);
        }
    }

    /**
     * Draw the backdrop and every shape into the default framebuffer.
     * @param now Time in milliseconds (the animation frame timestamp); it drives tone transitions. Default: the clock.
     * @returns True while another frame is needed: a tone transition is running or a luminance reading is pending.
     */
    render(now?: number): boolean {
        const gl = this.gl, t = now === undefined ? performance.now() : now;
        let dt = this.lastTime < 0 ? 0 : (t - this.lastTime) * 0.001;
        dt = dt < 0 ? 0 : dt > 0.1 ? 0.1 : dt;
        this.lastTime = t;
        gl.bindBufferBase(0x8a11, 1, this.frameUbo);
        gl.disable(0x0be2); gl.disable(0x0b71); gl.disable(0x0c11); gl.disable(0x0b44);
        // readings and transitions first: they change materials and frames, and the layout follows the frames
        let busy = this.poll();
        if (this.animate(dt)) busy = true;
        if (this.layoutDirty) this.layout();
        if (this.maskDirty) this.bake();
        const layered = this.layered, all = this.backdropDirty;
        const flip = layered ? 0 : this.topDown ? 1 : 0;
        if (this.frame[3] !== flip) { this.frame[3] = flip; this.frameDirty = true; }
        // a new frame block (light turn, row order) changes every shape
        const turned = this.frameDirty;
        if (this.frameDirty) { gl.bufferData(0x8a11, this.frame, 0x88e8); this.frameDirty = false; }
        if (all) this.stale = true;
        if (layered && !this.stale) {
            // nothing changed: the kept scene is the frame (readings that had to wait are taken now)
            if (this.measure(1, 0, this.dstart[this.depths] as number)) busy = true;
            this.show();
            return busy;
        }
        if (layered && !all && !turned && !this.full && this.sceneTex !== null) {
            // some shapes changed over a kept scene: only their pixels and the shapes that read them are drawn again
            this.partial();
            if (this.measure(1, 0, this.dstart[this.depths] as number)) busy = true;
            this.show();
            this.settleShown();
            this.stale = false;
            return busy;
        }
        gl.activeTexture(0x84c1);
        gl.bindTexture(0x0de1, this.source);
        if (layered) this.begin();
        gl.activeTexture(0x84c0);
        const ds = this.dstart, nd = this.depths, c = this.clip;
        c[0] = 0; c[1] = 0; c[2] = this.width; c[3] = this.height;
        const target = layered ? this.sceneFbo : null;
        // one batch per depth: shapes of a batch do not touch each other and see only the batches before them
        for (let d = 0; d < nd; d++) {
            const start = ds[d] as number, end = ds[d + 1] as number;
            this.build(all ? 1 : 0, start, end);
            this.measure(0, start, end);
            gl.bindVertexArray(this.vao);
            gl.bindFramebuffer(0x8d40, target);
            gl.viewport(0, 0, this.width, this.height);
            if (d === 0 && !layered) { gl.useProgram(this.present); gl.drawArrays(4, 0, 3); }
            if (end === start) continue;
            this.drawDepth(start, end, false);
            if (layered && d + 1 < nd) this.keepDepth(start, end);
        }
        this.backdropDirty = false;
        if (this.measure(1, 0, ds[nd] as number)) busy = true;
        if (layered) this.show();
        this.settleShown();
        this.full = false;
        this.stale = false;
        return busy;
    }
}
