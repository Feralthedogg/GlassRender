/** Fixed-image rim draw and its geometry/resource lifetime. */
import { RIM_VERTEX, groupRimFragment, rimFragment, shapeVertex, worldVertex } from "../kernels.js";
import {
    FEATURE_FIELD, MEMBER_SHIFT, ROW_CORNER, ROW_RIM_FILL, ROW_RIM_FILL_MORE, ROW_RIM_KEY, ROW_RIM_KEY_MORE,
} from "../layout.js";
import {boxEffectMesh} from "./effect-mesh.js";
import { G, GEOM_BOX, MMF } from "./lanes.js";
import { link } from "./shared.js";
import { World } from "./world.js";

const INDICES = new Uint16Array([
    0, 1, 5, 5, 4, 0, 3, 7, 6, 6, 2, 3, 10, 11, 15, 15, 14, 10, 9, 13, 12, 12, 8, 9,
    1, 2, 6, 6, 5, 1, 4, 5, 9, 9, 8, 4, 6, 7, 11, 11, 10, 6, 9, 10, 14, 14, 13, 9
]);

export abstract class Rim extends World {
    protected abstract keepDestination(slot: number): void;

    protected dropRim(deleteObjects: boolean): void {
        this.dropWorld(deleteObjects);
        if (deleteObjects) {
            const gl = this.gl;
            gl.deleteVertexArray(this.rimVao); gl.deleteBuffer(this.rimVertexBuffer); gl.deleteBuffer(this.rimIndexBuffer);
            for (const value of this.rimPrograms.values()) gl.deleteProgram(value.program);
        }
        this.rimVao = null; this.rimVertexBuffer = null; this.rimIndexBuffer = null; this.rimPrograms.clear();
    }

    private openRimMesh(): boolean {
        if (this.rimVao !== null) return true;
        const gl = this.gl, vao = gl.createVertexArray(), vertices = gl.createBuffer(), indices = gl.createBuffer();
        if (vao === null || vertices === null || indices === null) {
            gl.deleteVertexArray(vao); gl.deleteBuffer(vertices); gl.deleteBuffer(indices); return false;
        }
        gl.bindVertexArray(vao); gl.bindBuffer(gl.ARRAY_BUFFER, vertices);
        gl.bufferData(gl.ARRAY_BUFFER, this.rimVertices.byteLength, gl.STREAM_DRAW);
        gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 24, 0);
        gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 24, 16);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indices); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, INDICES, gl.STATIC_DRAW);
        this.rimVao = vao; this.rimVertexBuffer = vertices; this.rimIndexBuffer = indices;
        return true;
    }

    protected drawRim(slot: number, premultiplied = false): void {
        const key = this.keys[slot] as number;
        if (!this.separateRim(key)) return;
        const box = this.geoms[slot] === GEOM_BOX, edr = this.frame[14] !== 1, hdr = this.frame[15] !== 0;
        const world = box && this.extended && !hdr;
        const cacheKey = key * 16 + (edr ? 1 : 0) + (hdr ? 2 : 0) + (box ? 4 : 0) + (premultiplied ? 8 : 0), gl = this.gl;
        let value = this.rimPrograms.get(cacheKey);
        if (value === undefined) {
            const program = link(gl, box ? world ? worldVertex(true) : RIM_VERTEX : shapeVertex(false, true), premultiplied ? groupRimFragment(key, edr, hdr, world) : rimFragment(key, edr, hdr, world));
            if (program === null) return;
            for (const [name, binding] of [["M", 0], ["F", 1], ["U", 2]] as const) {
                const index = gl.getUniformBlockIndex(program, name);
                if (index !== gl.INVALID_INDEX) gl.uniformBlockBinding(program, index, binding);
            }
            gl.useProgram(program); gl.uniform1ui(gl.getUniformLocation(program, "uHalfBarrier"), 0);
            gl.uniform1i(gl.getUniformLocation(program, "uD"), 6);
            gl.uniform1i(gl.getUniformLocation(program, "uP"), 0); gl.uniform1i(gl.getUniformLocation(program, "uB"), 1);
            if ((key & FEATURE_FIELD) !== 0) {
                if ((key >>> MEMBER_SHIFT) === 0) gl.uniform1i(gl.getUniformLocation(program, "uF"), 2);
                else for (let i = 0; i < MMF; i++) gl.uniform1i(gl.getUniformLocation(program, "uF" + i), 2 + i);
            }
            value = { program, mode: gl.getUniformLocation(program, "uMode"), projection: gl.getUniformLocation(program, "uProjection") };
            this.rimPrograms.set(cacheKey, value);
        }
        if (box && !this.openRimMesh()) return;
        gl.useProgram(value.program);
        if (box) {
            const b = slot * G, g = this.geo, e = this.swell(slot), s = this.scale;
            const hx = (g[b + 2] as number) * .5 + e, hy = (g[b + 3] as number) * .5 + e;
            // Direct HDR draws use the logical scene centre and down-oriented local rows.
            const cx = (g[b] as number) + (g[b + 2] as number) * .5, topCy = (g[b + 1] as number) + (g[b + 3] as number) * .5;
            const cy = world ? this.height / s - topCy : topCy;
            const o = slot * this.stride, d = this.blocks, radius = d[o + ROW_CORNER * 4] as number;
            const padding = Math.max(d[o + ROW_RIM_KEY * 4 + 2] as number, d[o + ROW_RIM_KEY_MORE * 4 + 1] as number,
                d[o + ROW_RIM_FILL * 4] as number, d[o + ROW_RIM_FILL * 4 + 3] as number) + Math.abs(d[o + ROW_RIM_FILL_MORE * 4 + 3] as number) + 1;
            const v = this.rimVertices;
            boxEffectMesh(v, cx, cy, hx, hy, radius, padding, s, !world);
            gl.bindVertexArray(this.rimVao); gl.bindBuffer(gl.ARRAY_BUFFER, this.rimVertexBuffer); gl.bufferSubData(gl.ARRAY_BUFFER, 0, v);
            gl.uniform4f(value.projection, Math.fround(2 / this.width), Math.fround(-2 / this.height), -1, 1);
        } else gl.bindVertexArray(this.vao);
        if (world && this.worldLocation(value.program) !== null) {
            this.keepDestination(slot);
            gl.activeTexture(gl.TEXTURE6); gl.bindTexture(gl.TEXTURE_2D, this.destinationTex); gl.activeTexture(gl.TEXTURE0);
            gl.useProgram(value.program);
            this.drawWorld(value.program, this.rimVao, this.rimVertices, 6, 0, value.mode);
            return;
        }
        const passes = box ? 2 : 1;
        for (let i = 0; i < passes; i++) {
            this.keepDestination(slot);
            gl.activeTexture(gl.TEXTURE6); gl.bindTexture(gl.TEXTURE_2D, this.destinationTex); gl.activeTexture(gl.TEXTURE0);
            gl.useProgram(value.program);
            if (box) {
                gl.uniform1i(value.mode, i === 0 ? 4 : 0);
                if (this.extended && this.worldLocation(value.program) !== null) this.drawWorld(value.program, this.rimVao, this.rimVertices, 6, i * 48);
                else gl.drawElements(gl.TRIANGLES, 24, gl.UNSIGNED_SHORT, i * 48);
            }
            else gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        }
    }
}
