// Mask fields: a coverage mask becomes a signed distance field with a direction by jump flooding (for mask shapes and
// for mask members of a union).
import { MAX_MEMBERS, MEMBER_FIELD } from "../layout.js";
import { FIELD_DISTANCE_FRAGMENT, FIELD_JUMP_FRAGMENT, FIELD_NORMAL_FRAGMENT, FIELD_SEED_FRAGMENT, FULL_VERTEX } from "../kernels.js";
import { F, G, GEOM_FIELD, GEOM_UNION, MB, MMF, RGBA16F, RGBA8 } from "./lanes.js";
import { link } from "./shared.js";
import { Shapes } from "./shapes.js";

/** Distance fields of mask outlines. */
export abstract class Fields extends Shapes {
    // Programs of the mask distance field, linked on first use.
    protected openKit(): boolean {
        const gl = this.gl, k = this.kit, l = this.kitLoc;
        if (k[0] !== null) return true;
        const seed = link(gl, FULL_VERTEX, FIELD_SEED_FRAGMENT), jump = link(gl, FULL_VERTEX, FIELD_JUMP_FRAGMENT);
        const dist = link(gl, FULL_VERTEX, FIELD_DISTANCE_FRAGMENT), normal = link(gl, FULL_VERTEX, FIELD_NORMAL_FRAGMENT);
        if (seed === null || jump === null || dist === null || normal === null) {
            gl.deleteProgram(seed); gl.deleteProgram(jump); gl.deleteProgram(dist); gl.deleteProgram(normal);
            return false;
        }
        gl.useProgram(seed); gl.uniform1i(gl.getUniformLocation(seed, "uM"), 0);
        gl.useProgram(jump); gl.uniform1i(gl.getUniformLocation(jump, "uS"), 1);
        gl.useProgram(dist); gl.uniform1i(gl.getUniformLocation(dist, "uM"), 0); gl.uniform1i(gl.getUniformLocation(dist, "uS"), 1);
        gl.useProgram(normal); gl.uniform1i(gl.getUniformLocation(normal, "uS"), 1);
        k[0] = seed; k[1] = jump; k[2] = dist; k[3] = normal;
        l[0] = gl.getUniformLocation(seed, "uX"); l[1] = gl.getUniformLocation(jump, "uJ");
        l[2] = gl.getUniformLocation(dist, "uX"); l[3] = gl.getUniformLocation(dist, "uK");
        l[4] = gl.getUniformLocation(seed, "uL"); l[5] = gl.getUniformLocation(dist, "uL");
        return true;
    }

    // Upload a mask with its mip chain (finer masks are averaged down to coverage) and note its size in fd[f + 4..5].
    protected loadMask(fd: Int32Array, f: number, t: WebGLTexture, source: TexImageSource): void {
        const gl = this.gl;
        gl.activeTexture(0x84c0);
        gl.bindTexture(0x0de1, t);
        gl.texImage2D(0x0de1, 0, RGBA8, 0x1908, 0x1401, source);
        gl.generateMipmap(0x0de1);
        gl.texParameteri(0x0de1, 0x2801, 0x2703); gl.texParameteri(0x0de1, 0x2800, 0x2601);
        gl.texParameteri(0x0de1, 0x2802, 0x812f); gl.texParameteri(0x0de1, 0x2803, 0x812f);
        fd[f + 4] = "videoWidth" in source ? source.videoWidth : "naturalWidth" in source ? source.naturalWidth
            : "displayWidth" in source ? source.displayWidth : source.width;
        fd[f + 5] = "videoHeight" in source ? source.videoHeight : "naturalHeight" in source ? source.naturalHeight
            : "displayHeight" in source ? source.displayHeight : source.height;
    }

    // Rebuild the distance field of every mask (shape or union member) whose field is stale.
    protected bake(): void {
        const n = this.count, o = this.order, fd = this.fdim, md = this.mfdim, g = this.geo, m = this.members;
        // the field programs are gone with a lost context
        if (!this.openKit()) { this.maskDirty = false; return; }
        for (let i = 0; i < n; i++) {
            const slot = o[i] as number, f = slot * F, gk = this.geoms[slot];
            if (gk === GEOM_FIELD) {
                if ((fd[f] !== fd[f + 2] || fd[f + 1] !== fd[f + 3]) && (fd[f] as number) > 0) {
                    const t = this.fieldOf(this.masks[slot] as WebGLTexture | null, fd, f, g[slot * G + 2] as number, g[slot * G + 3] as number);
                    if (t !== null) { this.gl.deleteTexture(this.fields[slot] as WebGLTexture | null); this.fields[slot] = t; this.changed[slot] = 1; }
                }
            } else if (gk === GEOM_UNION) {
                const c = this.ucount[slot] as number, mo = slot * MAX_MEMBERS * MB;
                for (let k = 0; k < c; k++) {
                    const q = mo + k * MB;
                    if (m[q + 6] !== MEMBER_FIELD) continue;
                    const at = slot * MMF + (m[q + 7] as number), a = at * F;
                    if ((md[a] === md[a + 2] && md[a + 1] === md[a + 3]) || (md[a] as number) <= 0) continue;
                    const t = this.fieldOf(this.mmasks[at] as WebGLTexture | null, md, a, m[q + 2] as number, m[q + 3] as number);
                    if (t !== null) { this.gl.deleteTexture(this.mfields[at] as WebGLTexture | null); this.mfields[at] = t; this.changed[slot] = 1; }
                }
            }
        }
        this.maskDirty = false;
    }

    // Jump flooding over the coverage of a mask stretched over a w x h frame: seeds on the outline, the nearest seed for
    // every texel, then the signed distance and the direction away from the outline. Field size and mask size come from
    // lanes fd[f..f+5]; the built size is noted there. Uses texture units 0 and 1. Returns the field texture.
    protected fieldOf(mask: WebGLTexture | null, fd: Int32Array, f: number, w: number, h: number): WebGLTexture | null {
        const gl = this.gl, fw = fd[f] as number, fh = fd[f + 1] as number, k = this.kit, l = this.kitLoc, s = this.scale;
        if (mask === null || k[0] === null) return null;
        const ta = gl.createTexture() as WebGLTexture | null, tb = gl.createTexture() as WebGLTexture | null;
        const tf = gl.createTexture() as WebGLTexture | null, fbo = gl.createFramebuffer() as WebGLFramebuffer | null;
        if (ta === null || tb === null || tf === null || fbo === null) {
            gl.deleteTexture(ta); gl.deleteTexture(tb); gl.deleteTexture(tf); gl.deleteFramebuffer(fbo);
            return null;
        }
        gl.activeTexture(0x84c1);
        for (let i = 0; i < 3; i++) {
            gl.bindTexture(0x0de1, i === 0 ? ta : i === 1 ? tb : tf);
            gl.texStorage2D(0x0de1, 1, RGBA16F, fw, fh);
            gl.texParameteri(0x0de1, 0x2801, i === 2 ? 0x2601 : 0x2600); gl.texParameteri(0x0de1, 0x2800, i === 2 ? 0x2601 : 0x2600);
            gl.texParameteri(0x0de1, 0x2802, 0x812f); gl.texParameteri(0x0de1, 0x2803, 0x812f);
        }
        // field pixel (y up) -> mask uv (rows top-down)
        const sx = 1 / (s * w), sy = -1 / (s * h), ox = 0.5 - fw * 0.5 * sx, oy = 0.5 - fh * 0.5 * sy;
        // mask level whose texels are as large as the field texels
        const rx = (fd[f + 4] as number) * sx, ry = -(fd[f + 5] as number) * sy, lod = Math.log2(rx > ry ? rx : ry);
        gl.bindVertexArray(this.vao);
        gl.bindFramebuffer(0x8d40, fbo);
        gl.viewport(0, 0, fw, fh);
        gl.activeTexture(0x84c0);
        gl.bindTexture(0x0de1, mask);
        gl.activeTexture(0x84c1);
        gl.framebufferTexture2D(0x8d40, 0x8ce0, 0x0de1, ta, 0);
        gl.useProgram(k[0] as WebGLProgram | null);
        gl.uniform4f(l[0] as WebGLUniformLocation | null, sx, sy, ox, oy);
        gl.uniform1f(l[4] as WebGLUniformLocation | null, lod > 0 ? lod : 0);
        gl.drawArrays(4, 0, 3);
        let src = ta, dst = tb, step = 1;
        while (step * 2 < (fw > fh ? fw : fh)) step <<= 1;
        gl.useProgram(k[1] as WebGLProgram | null);
        for (; step >= 1; step >>= 1) {
            gl.framebufferTexture2D(0x8d40, 0x8ce0, 0x0de1, dst, 0);
            gl.bindTexture(0x0de1, src);
            gl.uniform1i(l[1] as WebGLUniformLocation | null, step);
            gl.drawArrays(4, 0, 3);
            const t = src; src = dst; dst = t;
        }
        gl.framebufferTexture2D(0x8d40, 0x8ce0, 0x0de1, dst, 0);
        gl.bindTexture(0x0de1, src);
        gl.useProgram(k[2] as WebGLProgram | null);
        gl.uniform4f(l[2] as WebGLUniformLocation | null, sx, sy, ox, oy);
        gl.uniform1f(l[5] as WebGLUniformLocation | null, lod > 0 ? lod : 0);
        gl.uniform1f(l[3] as WebGLUniformLocation | null, 1 / s);
        gl.drawArrays(4, 0, 3);
        gl.framebufferTexture2D(0x8d40, 0x8ce0, 0x0de1, tf, 0);
        gl.bindTexture(0x0de1, dst);
        gl.useProgram(k[3] as WebGLProgram | null);
        gl.drawArrays(4, 0, 3);
        gl.bindFramebuffer(0x8d40, null);
        gl.bindTexture(0x0de1, null);
        gl.deleteFramebuffer(fbo); gl.deleteTexture(ta); gl.deleteTexture(tb);
        fd[f + 2] = fw; fd[f + 3] = fh;
        this.stale = true;
        return tf;
    }

    protected dropField(slot: number): void {
        const gl = this.gl;
        gl.deleteTexture(this.fields[slot] as WebGLTexture | null); gl.deleteTexture(this.masks[slot] as WebGLTexture | null);
        this.fields[slot] = null; this.masks[slot] = null; this.sources[slot] = null;
        this.fdim.fill(0, slot * F, slot * F + F);
    }

    protected dropMemberField(at: number): void {
        const gl = this.gl;
        gl.deleteTexture(this.mfields[at] as WebGLTexture | null); gl.deleteTexture(this.mmasks[at] as WebGLTexture | null);
        this.mfields[at] = null; this.mmasks[at] = null; this.msources[at] = null;
        this.mfdim.fill(0, at * F, at * F + F);
    }

    // Unused field index of a union, or -1 when all are taken.
    protected freeField(slot: number): number {
        const m = this.members, n = this.ucount[slot] as number, mo = slot * MAX_MEMBERS * MB;
        let used = 0;
        for (let i = 0; i < n; i++) { const q = mo + i * MB; if (m[q + 6] === MEMBER_FIELD) used |= 1 << (m[q + 7] as number); }
        for (let k = 0; k < MMF; k++) if ((used & (1 << k)) === 0) return k;
        return -1;
    }

    // Field textures of the mask members of a union on units 2..5 (an unused unit gets one of them). False while one is
    // not built.
    protected bindMemberFields(slot: number): boolean {
        const gl = this.gl, mf = this.mfields, m = this.members, n = this.ucount[slot] as number, mo = slot * MAX_MEMBERS * MB;
        let any: WebGLTexture | null = null;
        for (let i = 0; i < n; i++) {
            const q = mo + i * MB;
            if (m[q + 6] !== MEMBER_FIELD) continue;
            const t = mf[slot * MMF + (m[q + 7] as number)] as WebGLTexture | null;
            if (t === null) return false;
            any = t;
        }
        for (let k = 0; k < MMF; k++) {
            const t = mf[slot * MMF + k] as WebGLTexture | null;
            gl.activeTexture(0x84c2 + k); gl.bindTexture(0x0de1, t !== null ? t : any);
        }
        gl.activeTexture(0x84c0);
        return true;
    }
}
