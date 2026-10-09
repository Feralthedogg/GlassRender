/** Direct world interpolation through one shared half surface, preserving the full viewport. */
import { ROW_GRID } from "../layout.js";
import { G } from "./lanes.js";
import { Tone } from "./tone.js";

const CELLS = new Uint8Array([1,1,3,1,3,3,1,3,2,0,2,4,0,2,4,2,0,0,1,0,0,1,4,0,3,0,4,1,4,4,3,4,4,3,0,4,1,4,0,3,2,2,2,1,2,3,1,2,3,2]);
const STEPS = new Uint8Array([0,0,1,0,1,1,1,1,0,1,0,0]);

export abstract class World extends Tone {
    private worldTex: WebGLTexture | null = null;
    private worldFbo: WebGLFramebuffer | null = null;
    private worldW = 0;
    private worldH = 0;
    private worldVao: WebGLVertexArrayObject | null = null;
    private worldVbo: WebGLBuffer | null = null;
    private readonly worldVertices = new Float32Array(150 * 8);
    private readonly worldMatrix = new Float32Array([0,0,0,0,0,0,0,0,0,0,0,0,-1,1,0,1]);
    private readonly worldLocations = new Map<WebGLProgram, WebGLUniformLocation | null>();

    protected worldLocation(program: WebGLProgram): WebGLUniformLocation | null {
        let location = this.worldLocations.get(program);
        if (location === undefined) { location = this.gl.getUniformLocation(program, "uWorldMVP"); this.worldLocations.set(program, location); }
        return location;
    }

    protected dropWorldSurface(deleteObjects: boolean): void {
        if (deleteObjects) { this.gl.deleteTexture(this.worldTex); this.gl.deleteFramebuffer(this.worldFbo); }
        this.worldTex = null; this.worldFbo = null; this.worldW = 0; this.worldH = 0;
    }

    protected dropWorld(deleteObjects: boolean): void {
        this.dropWorldSurface(deleteObjects);
        if (deleteObjects) { this.gl.deleteVertexArray(this.worldVao); this.gl.deleteBuffer(this.worldVbo); }
        this.worldVao = null; this.worldVbo = null; this.worldLocations.clear();
    }

    private openWorldSurface(): boolean {
        if (this.worldTex !== null && this.worldW === this.width && this.worldH === this.height) return true;
        this.dropWorldSurface(true);
        const gl = this.gl, texture = gl.createTexture(), fbo = gl.createFramebuffer();
        if (texture === null || fbo === null) { gl.deleteTexture(texture); gl.deleteFramebuffer(fbo); return false; }
        gl.activeTexture(gl.TEXTURE8); gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA16F, this.width, this.height);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
        const complete = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
        gl.activeTexture(gl.TEXTURE0);
        if (!complete) { gl.deleteTexture(texture); gl.deleteFramebuffer(fbo); return false; }
        this.worldTex = texture; this.worldFbo = fbo; this.worldW = this.width; this.worldH = this.height;
        return true;
    }

    private openWorldMesh(): boolean {
        if (this.worldVao !== null) return true;
        const gl = this.gl, vao = gl.createVertexArray(), vbo = gl.createBuffer();
        if (vao === null || vbo === null) { gl.deleteVertexArray(vao); gl.deleteBuffer(vbo); return false; }
        gl.bindVertexArray(vao); gl.bindBuffer(gl.ARRAY_BUFFER, vbo); gl.bufferData(gl.ARRAY_BUFFER, this.worldVertices.byteLength, gl.STREAM_DRAW);
        for (let i = 0; i < 3; i++) { gl.enableVertexAttribArray(i); gl.vertexAttribPointer(i, i === 0 ? 4 : 2, gl.FLOAT, false, 32, i === 0 ? 0 : i === 1 ? 16 : 24); }
        this.worldVao = vao; this.worldVbo = vbo;
        return true;
    }

    protected drawWorldBody(slot: number, program: WebGLProgram): boolean {
        const gl = this.gl;
        if (this.worldLocation(program) === null) return false;
        const prior = gl.getParameter(gl.VERTEX_ARRAY_BINDING) as WebGLVertexArrayObject | null;
        if (!this.openWorldMesh()) return true;
        const d = this.blocks, o = slot * this.stride + ROW_GRID * 4, g = slot * G, geo = this.geo, s = this.scale;
        const cx = (geo[g] as number) + (geo[g + 2] as number) * .5;
        const cy = this.height / s - (geo[g + 1] as number) - (geo[g + 3] as number) * .5;
        const v = this.worldVertices;
        for (let cell = 0; cell < 25; cell++) for (let corner = 0; corner < 6; corner++) {
            const x = (CELLS[cell * 2] as number) + (STEPS[corner * 2] as number), y = (CELLS[cell * 2 + 1] as number) + (STEPS[corner * 2 + 1] as number);
            const qx = d[o + 12 + x] as number, qy = d[o + 18 + y] as number, at = (cell * 6 + corner) * 8;
            v[at] = (qx + cx) * s; v[at + 1] = (qy + cy) * s; v[at + 2] = 0; v[at + 3] = 1;
            v[at + 4] = qx; v[at + 5] = qy; v[at + 6] = d[o + 24 + x] as number; v[at + 7] = d[o + 30 + y] as number;
        }
        gl.bindVertexArray(this.worldVao); gl.bindBuffer(gl.ARRAY_BUFFER, this.worldVbo); gl.bufferSubData(gl.ARRAY_BUFFER, 0, v);
        this.drawWorld(program, this.worldVao, v, 8);
        gl.bindVertexArray(prior);
        return true;
    }

    protected drawWorld(program: WebGLProgram, vao: WebGLVertexArrayObject | null, vertices: Float32Array, stride: number, indexOffset = -1, rimMode?: WebGLUniformLocation | null): void {
        const gl = this.gl, w = this.width, h = this.height;
        const location = this.worldLocation(program);
        if (location === null) return;
        const read = gl.getParameter(gl.READ_FRAMEBUFFER_BINDING) as WebGLFramebuffer | null;
        const draw = gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING) as WebGLFramebuffer | null;
        const viewport = gl.getParameter(gl.VIEWPORT) as Int32Array, priorVao = gl.getParameter(gl.VERTEX_ARRAY_BINDING) as WebGLVertexArrayObject | null;
        const scissored = gl.isEnabled(gl.SCISSOR_TEST), scissor = gl.getParameter(gl.SCISSOR_BOX) as Int32Array;
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (let i = 0; i < vertices.length; i += stride) {
            const x = vertices[i] as number, y = vertices[i + 1] as number;
            x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
        }
        x0 = Math.max(0, Math.floor(x0) - 1); y0 = Math.max(0, Math.floor(y0) - 1);
        x1 = Math.min(w, Math.ceil(x1) + 1); y1 = Math.min(h, Math.ceil(y1) + 1);
        if (scissored) {
            x0 = Math.max(x0, scissor[0] as number); x1 = Math.min(x1, (scissor[0] as number) + (scissor[2] as number));
            y0 = Math.max(y0, h - (scissor[1] as number) - (scissor[3] as number)); y1 = Math.min(y1, h - (scissor[1] as number));
        }
        try {
            if (!(x1 > x0 && y1 > y0) || !this.openWorldSurface()) return;
            gl.disable(gl.SCISSOR_TEST); gl.bindFramebuffer(gl.READ_FRAMEBUFFER, draw); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, this.worldFbo);
            gl.blitFramebuffer(x0, h-y1, x1, h-y0, x0, y1, x1, y0, gl.COLOR_BUFFER_BIT, gl.NEAREST);
            gl.bindFramebuffer(gl.FRAMEBUFFER, this.worldFbo); gl.viewport(0, 0, w, h);
            gl.enable(gl.SCISSOR_TEST); gl.scissor(x0, y0, x1-x0, y1-y0); gl.bindVertexArray(vao); gl.useProgram(program);
            this.worldMatrix[0] = 2 / w; this.worldMatrix[5] = -2 / h; gl.uniformMatrix4fv(location, false, this.worldMatrix);
            if (indexOffset < 0) gl.drawArrays(gl.TRIANGLES, 0, 150);
            else if (rimMode === undefined) gl.drawElements(gl.TRIANGLES, 24, gl.UNSIGNED_SHORT, indexOffset);
            else {
                // Corner and side cells have disjoint raster coverage; their SDF modes stay separate.
                gl.uniform1i(rimMode, 4); gl.drawElements(gl.TRIANGLES, 24, gl.UNSIGNED_SHORT, indexOffset);
                gl.uniform1i(rimMode, 0); gl.drawElements(gl.TRIANGLES, 24, gl.UNSIGNED_SHORT, indexOffset + 48);
            }
            gl.disable(gl.SCISSOR_TEST); gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.worldFbo); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, draw);
            gl.blitFramebuffer(x0, y0, x1, y1, x0, h-y0, x1, h-y1, gl.COLOR_BUFFER_BIT, gl.NEAREST);
        } finally {
            gl.bindFramebuffer(gl.READ_FRAMEBUFFER, read); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, draw);
            gl.viewport(viewport[0] as number, viewport[1] as number, viewport[2] as number, viewport[3] as number); gl.bindVertexArray(priorVao);
            if (scissored) { gl.enable(gl.SCISSOR_TEST); gl.scissor(scissor[0] as number, scissor[1] as number, scissor[2] as number, scissor[3] as number); }
            else gl.disable(gl.SCISSOR_TEST);
        }
    }
}
