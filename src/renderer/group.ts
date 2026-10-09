/** Transparent glass groups retain RGBA until one final layer-opacity composite. */
import { GROUP_VERTEX, groupCompositeFragment } from "../kernels.js";
import { ROW_GRID, ROW_TOP } from "../layout.js";
import { B, GEOM_BOX } from "./lanes.js";
import { Rim } from "./rim.js";
import { link } from "./shared.js";

export abstract class Group extends Rim {
    protected abstract drawTint(slot: number, premultiplied?: boolean): void;
    protected groupTex: WebGLTexture | null = null;
    protected groupFbo: WebGLFramebuffer | null = null;
    private groupW = 0;
    private groupH = 0;
    private groupProgram: WebGLProgram | null = null;
    private groupOpacity: WebGLUniformLocation | null = null;

    protected dropGroup(deleteObjects: boolean, program = true): void {
        if (deleteObjects) {
            this.gl.deleteTexture(this.groupTex); this.gl.deleteFramebuffer(this.groupFbo);
            if (program) this.gl.deleteProgram(this.groupProgram);
        }
        this.groupTex = null; this.groupFbo = null; this.groupW = 0; this.groupH = 0;
        if (program) { this.groupProgram = null; this.groupOpacity = null; }
    }

    private openGroup(): boolean {
        const gl = this.gl;
        if (this.groupProgram === null) {
            const p = link(gl, GROUP_VERTEX, groupCompositeFragment());
            if (p === null) return false;
            for (const [name, binding] of [["M", 0], ["F", 1]] as const) {
                const index = gl.getUniformBlockIndex(p, name);
                if (index !== gl.INVALID_INDEX) gl.uniformBlockBinding(p, index, binding);
            }
            gl.useProgram(p); gl.uniform1ui(gl.getUniformLocation(p, "uHalfBarrier"), 0);
            gl.uniform1i(gl.getUniformLocation(p, "uG"), 7); gl.uniform1i(gl.getUniformLocation(p, "uD"), 6);
            this.groupProgram = p; this.groupOpacity = gl.getUniformLocation(p, "uOpacity");
        }
        if (this.groupTex !== null && this.groupW === this.width && this.groupH === this.height) return true;
        this.dropGroup(true, false);
        const texture = gl.createTexture(), fbo = gl.createFramebuffer();
        if (texture === null || fbo === null) { gl.deleteTexture(texture); gl.deleteFramebuffer(fbo); return false; }
        gl.activeTexture(gl.TEXTURE7); gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA16F, this.width, this.height);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
        const complete = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
        gl.activeTexture(gl.TEXTURE0);
        if (!complete) { gl.deleteTexture(texture); gl.deleteFramebuffer(fbo); return false; }
        this.groupTex = texture; this.groupFbo = fbo; this.groupW = this.width; this.groupH = this.height;
        return true;
    }

    protected drawGroup(slot: number, body: WebGLProgram): void {
        const gl = this.gl, scene = this.sceneFbo;
        if (!this.openGroup()) { gl.bindFramebuffer(gl.FRAMEBUFFER, scene); return; }
        const b = slot * B, bd = this.bounds, clip = this.clip;
        let x0 = bd[b] as number, y0 = bd[b + 1] as number, x1 = bd[b + 2] as number, y1 = bd[b + 3] as number;
        if (this.geoms[slot] === GEOM_BOX) {
            const at = slot * this.stride + ROW_GRID * 4, d = this.blocks;
            x0 = Math.min(x0, ((d[at] as number) + 1) * this.width * .5);
            x1 = Math.max(x1, ((d[at + 5] as number) + 1) * this.width * .5);
            y0 = Math.min(y0, ((d[at + 6] as number) + 1) * this.height * .5);
            y1 = Math.max(y1, ((d[at + 11] as number) + 1) * this.height * .5);
        }
        const bx0 = Math.max(0, clip[0] as number, Math.floor(x0)), by0 = Math.max(0, clip[1] as number, Math.floor(y0));
        const bx1 = Math.min(this.width, clip[2] as number, Math.ceil(x1)), by1 = Math.min(this.height, clip[3] as number, Math.ceil(y1));
        if (bx1 <= bx0 || by1 <= by0) { gl.bindFramebuffer(gl.FRAMEBUFFER, scene); return; }
        const scissored = gl.isEnabled(gl.SCISSOR_TEST), prior = gl.getParameter(gl.SCISSOR_BOX) as Int32Array;
        gl.enable(gl.SCISSOR_TEST); gl.scissor(bx0, this.height - by1, bx1 - bx0, by1 - by0);
        try {
            gl.bindFramebuffer(gl.FRAMEBUFFER, this.groupFbo); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
            gl.bindVertexArray(this.vao); gl.useProgram(body);
            if (this.geoms[slot] === GEOM_BOX) { if (!this.drawWorldBody(slot, body)) gl.drawArrays(gl.TRIANGLES, 0, 150); }
            else gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
            this.sceneFbo = this.groupFbo;
            try { this.drawTint(slot, true); this.drawRim(slot, true); } finally { this.sceneFbo = scene; }
            // The actual lower scene has not changed; capture it after completing the group.
            this.keepDestination(slot);
            gl.activeTexture(gl.TEXTURE6); gl.bindTexture(gl.TEXTURE_2D, this.destinationTex);
            gl.activeTexture(gl.TEXTURE7); gl.bindTexture(gl.TEXTURE_2D, this.groupTex);
            gl.activeTexture(gl.TEXTURE0); gl.bindFramebuffer(gl.FRAMEBUFFER, scene); gl.bindVertexArray(this.vao);
            gl.useProgram(this.groupProgram); gl.uniform1f(this.groupOpacity, this.blocks[slot * this.stride + ROW_TOP * 4 + 2] as number);
            gl.drawArrays(gl.TRIANGLES, 0, 3);
        } finally {
            this.sceneFbo = scene; gl.bindFramebuffer(gl.FRAMEBUFFER, scene);
            if (scissored) gl.scissor(prior[0] as number, prior[1] as number, prior[2] as number, prior[3] as number);
            else gl.disable(gl.SCISSOR_TEST);
            gl.activeTexture(gl.TEXTURE0);
        }
    }
}
