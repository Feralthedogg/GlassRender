/** Analytic HDR tint: independently rasterized fill mask and premultiplied foreground.
 * The recovered regular effect uses margin 8, fill support 1.5 and 64-pixel allocation tiles.
 * Layer-opacity groups retain alpha until their final generic composite.
 * Other effect combinations retain the existing path until their ordering is validated.
 */
import { GROUP_VERTEX, RIM_VERTEX, sdfFillMaskFragment, tintForegroundFragment, tintCompositeFragment } from "../kernels.js";
import { FEATURE_FADE, FEATURE_VEIL, ROW_CORNER, SMOOTH_REACH } from "../layout.js";
import { fma32 } from "../precision.js";
import { boxEffectMesh, BOX_CORNER_INDICES, BOX_FILL_INDICES, BOX_QUAD_INDICES } from "./effect-mesh.js";
import { A, G } from "./lanes.js";
import { Group } from "./group.js";
import { link } from "./shared.js";

// An offscreen target of the tint passes. It only grows; a pass draws into its lower-left part.
type Surface = { texture: WebGLTexture; fbo: WebGLFramebuffer; width: number; height: number };

// Uniform locations of the fill (0) and foreground (1) programs, at program * TL.
const TL = 6, T_PROJECTION = 0, T_OFFSET = 1, T_ORIGIN = 2, T_FILL_ORIGIN = 3, T_FILL_SIZE = 4, T_MODE = 5;
const TINT_UNIFORMS = ["uProjection", "uOffset", "uTintOrigin", "uTintFillOrigin", "uTintFillSize", "uMode"];
// Extent lanes: x, y, width and height rounded up to 64, right, bottom (pixels); the fill at 0, the foreground at FG.
const X = 0, Y = 1, W = 2, H = 3, RIGHT = 4, BOTTOM = 5, FG = 6;

/** The fill and foreground programs of one tint source, with their uniform locations. */
class TintPass {
    readonly fill: WebGLProgram;
    readonly foreground: WebGLProgram;
    readonly locations: (WebGLUniformLocation | null)[];

    constructor(gl: WebGL2RenderingContext, fill: WebGLProgram, foreground: WebGLProgram) {
        this.fill = fill;
        this.foreground = foreground;
        this.locations = new Array<WebGLUniformLocation | null>(2 * TL).fill(null);
        for (let i = 0; i < TL; i++) {
            this.locations[i] = gl.getUniformLocation(fill, TINT_UNIFORMS[i] as string);
            this.locations[TL + i] = gl.getUniformLocation(foreground, TINT_UNIFORMS[i] as string);
        }
    }
}

export abstract class Tint extends Group {
    private tintFill: Surface | null = null;
    private tintForeground: Surface | null = null;
    private tintVao: WebGLVertexArrayObject | null = null;
    private tintVbo: WebGLBuffer | null = null;
    private tintIbo: WebGLBuffer | null = null;
    private readonly tintPrograms = new Map<number, TintPass>();
    private tintComposite: WebGLProgram | null = null;
    private tintCompositeOrigin: WebGLUniformLocation | null = null;
    private tintGroupComposite: WebGLProgram | null = null;
    private tintGroupCompositeOrigin: WebGLUniformLocation | null = null;
    private readonly tintVertices = new Float32Array(96);
    private readonly tintExtent = new Int32Array(12);

    protected dropTint(deleteObjects: boolean): void {
        const gl = this.gl;
        if (deleteObjects) {
            for (const s of [this.tintFill, this.tintForeground]) if (s) { gl.deleteTexture(s.texture); gl.deleteFramebuffer(s.fbo); }
            gl.deleteVertexArray(this.tintVao); gl.deleteBuffer(this.tintVbo); gl.deleteBuffer(this.tintIbo);
            for (const pass of this.tintPrograms.values()) { gl.deleteProgram(pass.fill); gl.deleteProgram(pass.foreground); }
            gl.deleteProgram(this.tintComposite); gl.deleteProgram(this.tintGroupComposite);
        }
        this.tintFill = null; this.tintForeground = null; this.tintVao = null; this.tintVbo = null; this.tintIbo = null;
        this.tintPrograms.clear(); this.tintComposite = null; this.tintCompositeOrigin = null;
        this.tintGroupComposite = null; this.tintGroupCompositeOrigin = null;
    }

    // A surface of at least width x height: the current one, or a larger one in its place.
    private tintSurface(current: Surface | null, width: number, height: number, unit: number): Surface | null {
        const gl = this.gl;
        if (current && current.width >= width && current.height >= height) return current;
        if (current) {
            if (current.width > width) width = current.width;
            if (current.height > height) height = current.height;
            gl.deleteTexture(current.texture); gl.deleteFramebuffer(current.fbo);
        }
        const texture = gl.createTexture(), fbo = gl.createFramebuffer();
        if (!texture || !fbo) { gl.deleteTexture(texture); gl.deleteFramebuffer(fbo); return null; }
        gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, texture); gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA16F, width, height);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
        if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) { gl.deleteTexture(texture); gl.deleteFramebuffer(fbo); return null; }
        return { texture, fbo, width, height };
    }

    // Native offscreen surfaces intersect the scene before their 64-pixel allocation rounding.
    private tintBounds(at: number, cx: number, cy: number, hx: number, hy: number, padding: number, s: number): void {
        const e = this.tintExtent;
        const x = Math.max(0, Math.floor((cx - hx - padding) * s)), y = Math.max(0, Math.floor((cy - hy - padding) * s));
        const right = Math.min(this.width, Math.ceil((cx + hx + padding) * s)), bottom = Math.min(this.height, Math.ceil((cy + hy + padding) * s));
        e[at + X] = x; e[at + Y] = y; e[at + W] = Math.ceil((right - x) / 64) * 64; e[at + H] = Math.ceil((bottom - y) / 64) * 64;
        e[at + RIGHT] = right; e[at + BOTTOM] = bottom;
    }

    // The fill and foreground programs of a tint source, made on first use.
    private tintPass(key: number): TintPass | null {
        // The veil and the layer opacity are not part of the tint sources; a group layer composites differently.
        const gl = this.gl, source = key & ~(FEATURE_VEIL | FEATURE_FADE), layer = this.groupLayer(key), cacheKey = source * 2 + (layer ? 1 : 0);
        const have = this.tintPrograms.get(cacheKey);
        if (have !== undefined) return have;
        const fill = link(gl, RIM_VERTEX, sdfFillMaskFragment(source)), foreground = link(gl, RIM_VERTEX, tintForegroundFragment(source, true, layer, true));
        if (!fill || !foreground) { gl.deleteProgram(fill); gl.deleteProgram(foreground); return null; }
        for (const p of [fill, foreground]) {
            for (const [name, binding] of [["M", 0], ["F", 1], ["U", 2]] as const) {
                const i = gl.getUniformBlockIndex(p, name);
                if (i !== gl.INVALID_INDEX) gl.uniformBlockBinding(p, i, binding);
            }
            gl.useProgram(p); gl.uniform1ui(gl.getUniformLocation(p, "uHalfBarrier"), 0); gl.uniform1f(gl.getUniformLocation(p, "uOffset"), -.5);
        }
        gl.useProgram(foreground);
        gl.uniform1i(gl.getUniformLocation(foreground, "uTintBackdrop"), 6); gl.uniform1i(gl.getUniformLocation(foreground, "uTintMask"), 7);
        gl.uniform1i(gl.getUniformLocation(foreground, "uTintFill"), 8); gl.uniform1i(gl.getUniformLocation(foreground, "uTintUnderlying"), 10);
        const pass = new TintPass(gl, fill, foreground);
        this.tintPrograms.set(cacheKey, pass);
        return pass;
    }

    // The composite program, made on first use, with its origin location beside it.
    private tintCompositeProgram(premultiplied: boolean): WebGLProgram | null {
        const have = premultiplied ? this.tintGroupComposite : this.tintComposite;
        if (have) return have;
        const gl = this.gl, composite = link(gl, GROUP_VERTEX, tintCompositeFragment(premultiplied));
        if (!composite) return null;
        gl.useProgram(composite); gl.uniform1ui(gl.getUniformLocation(composite, "uHalfBarrier"), 0);
        gl.uniform1i(gl.getUniformLocation(composite, "uD"), 6); gl.uniform1i(gl.getUniformLocation(composite, "uTintForeground"), 9);
        const origin = gl.getUniformLocation(composite, "uTintOrigin");
        if (premultiplied) { this.tintGroupComposite = composite; this.tintGroupCompositeOrigin = origin; }
        else { this.tintComposite = composite; this.tintCompositeOrigin = origin; }
        return composite;
    }

    // The effect mesh of the tint passes, made on first use; the base vertex array is bound again afterwards.
    private openTintMesh(): boolean {
        if (this.tintVao) return true;
        const gl = this.gl, vao = gl.createVertexArray(), vbo = gl.createBuffer(), ibo = gl.createBuffer();
        if (!vao || !vbo || !ibo) { gl.deleteVertexArray(vao); gl.deleteBuffer(vbo); gl.deleteBuffer(ibo); return false; }
        gl.bindVertexArray(vao); gl.bindBuffer(gl.ARRAY_BUFFER, vbo); gl.bufferData(gl.ARRAY_BUFFER, 384, gl.STREAM_DRAW);
        gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 24, 0);
        gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 24, 16);
        const index = new Uint16Array(60); index.set(BOX_CORNER_INDICES); index.set(BOX_FILL_INDICES, 24); index.set(BOX_QUAD_INDICES, 54);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, index, gl.STATIC_DRAW);
        gl.bindVertexArray(this.vao);
        this.tintVao = vao; this.tintVbo = vbo; this.tintIbo = ibo;
        return true;
    }

    /*
     * Draw the tint of a slot through its fill and foreground surfaces and composite it over the scene (`sceneFbo`, the
     * group surface while a group layer is drawn), which the caller has bound over the full viewport with the scissor
     * of clipTo/clipOff. Leaves that state, texture unit 0 and the base vertex array.
     */
    protected drawTint(slot: number, premultiplied = false): void {
        const key = this.keys[slot] as number;
        if (!this.separateTint(key)) return;
        const gl = this.gl, scene = this.sceneFbo;
        const pass = this.tintPass(key), composite = this.tintCompositeProgram(premultiplied);
        if (pass === null || composite === null || !this.openTintMesh()) return;
        const b = slot * G, g = this.geo, sw = this.swell(slot), s = this.scale;
        const hx = (g[b + 2] as number) * .5 + sw, hy = (g[b + 3] as number) * .5 + sw;
        const cx = (g[b] as number) + (g[b + 2] as number) * .5, cy = (g[b + 1] as number) + (g[b + 3] as number) * .5;
        const radius = this.blocks[slot * this.stride + ROW_CORNER * 4] as number;
        const fillOffset = -.5 * (this.ad[slot * A + 6] as number), fillPadding = 9 + Math.abs(fillOffset), e = this.tintExtent;
        this.tintBounds(0, cx, cy, hx, hy, fillPadding, s);
        this.tintBounds(FG, cx, cy, hx, hy, 18, s);
        if ((e[RIGHT] as number) <= (e[X] as number) || (e[BOTTOM] as number) <= (e[Y] as number)
            || (e[FG + RIGHT] as number) <= (e[FG + X] as number) || (e[FG + BOTTOM] as number) <= (e[FG + Y] as number)) return;
        // Fill keeps native scene rows. Mirror the exact valid bounds, excluding allocation padding.
        const fillY = this.height - (e[BOTTOM] as number);
        e[BOTTOM] = this.height - (e[Y] as number); e[Y] = fillY;
        if (Math.max(e[W] as number, e[H] as number, e[FG + W] as number, e[FG + H] as number) > this.maxTex) return;
        this.tintFill = this.tintSurface(this.tintFill, e[W] as number, e[H] as number, 8);
        this.tintForeground = this.tintSurface(this.tintForeground, e[FG + W] as number, e[FG + H] as number, 9);
        const fill = this.tintFill, foreground = this.tintForeground;
        if (!fill || !foreground) { gl.bindFramebuffer(gl.FRAMEBUFFER, scene); gl.activeTexture(gl.TEXTURE0); return; }
        const fx = e[FG + X] as number, fy = e[FG + Y] as number, fr = e[FG + RIGHT] as number, fb = e[FG + BOTTOM] as number;
        // Tint composites its whole foreground extent, including transparent support pixels.
        this.keepDestination(slot, fx, this.height - fb, fr, this.height - fy);
        gl.activeTexture(gl.TEXTURE6); gl.bindTexture(gl.TEXTURE_2D, this.destinationTex);
        if (!this.bindTintMask()) return;
        if (premultiplied) { gl.activeTexture(gl.TEXTURE10); gl.bindTexture(gl.TEXTURE_2D, this.sceneTex); }
        gl.disable(gl.BLEND);
        const loc = pass.locations, single = radius > 0 && radius * SMOOTH_REACH >= Math.max(hx, hy);
        for (let i = 0; i < 2; i++) {
            const at = i === 0 ? 0 : FG, l = i * TL, width = e[at + W] as number, height = e[at + H] as number;
            gl.bindFramebuffer(gl.FRAMEBUFFER, i === 0 ? fill.fbo : foreground.fbo);
            // Clear the part of the surface this pass uses; the rest is never read.
            gl.enable(gl.SCISSOR_TEST); gl.scissor(0, 0, width, height);
            gl.viewport(0, 0, width, height); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
            gl.disable(gl.SCISSOR_TEST);
            gl.useProgram(i === 0 ? pass.fill : pass.foreground);
            const sx = Math.fround(2 / width), sy = Math.fround(-2 / height), x = e[at + X] as number, y = e[at + Y] as number;
            gl.uniform4f(loc[l + T_PROJECTION] as WebGLUniformLocation | null, sx, sy, fma32(sx, -x, -1), fma32(-sy, y, 1));
            if (i === 0) gl.uniform1f(loc[T_OFFSET] as WebGLUniformLocation | null, fillOffset);
            gl.uniform2f(loc[l + T_ORIGIN] as WebGLUniformLocation | null, x, y);
            gl.uniform2f(loc[l + T_FILL_ORIGIN] as WebGLUniformLocation | null, e[X] as number, e[Y] as number);
            gl.uniform2f(loc[l + T_FILL_SIZE] as WebGLUniformLocation | null, e[W] as number, e[H] as number);
            if (i === 1) { gl.activeTexture(gl.TEXTURE8); gl.bindTexture(gl.TEXTURE_2D, fill.texture); }
            // The native zero-radius fill and foreground retain the .01 circular inner partition.
            boxEffectMesh(this.tintVertices, cx, i === 0 ? this.height / s - cy : cy, hx, hy, radius, i === 0 ? fillPadding : 18, s, false,
                radius <= 0 ? Math.fround(.01) : undefined);
            gl.bindVertexArray(this.tintVao); gl.bindBuffer(gl.ARRAY_BUFFER, this.tintVbo); gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.tintVertices);
            gl.uniform1i(loc[l + T_MODE] as WebGLUniformLocation | null, 4);
            if (single) gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 108);
            else {
                gl.drawElements(gl.TRIANGLES, 24, gl.UNSIGNED_SHORT, 0);
                gl.uniform1i(loc[l + T_MODE] as WebGLUniformLocation | null, 0); gl.drawElements(gl.TRIANGLES, 30, gl.UNSIGNED_SHORT, 48);
            }
        }
        gl.bindFramebuffer(gl.FRAMEBUFFER, scene); gl.viewport(0, 0, this.width, this.height);
        const sb = this.scissorBox, on = this.scissorOn;
        const x0 = Math.max(0, fx, on ? sb[0] as number : 0), y0 = Math.max(0, fy, on ? sb[1] as number : 0);
        const x1 = Math.min(this.width, fr, on ? (sb[0] as number) + (sb[2] as number) : this.width);
        const y1 = Math.min(this.height, fb, on ? (sb[1] as number) + (sb[3] as number) : this.height);
        if (x1 > x0 && y1 > y0) {
            gl.enable(gl.SCISSOR_TEST); gl.scissor(x0, y0, x1 - x0, y1 - y0);
            gl.activeTexture(gl.TEXTURE9); gl.bindTexture(gl.TEXTURE_2D, foreground.texture); gl.useProgram(composite);
            gl.uniform2f(premultiplied ? this.tintGroupCompositeOrigin : this.tintCompositeOrigin, fx, fy);
            gl.bindVertexArray(this.vao); gl.drawArrays(gl.TRIANGLES, 0, 3);
        }
        this.clipBack(); gl.activeTexture(gl.TEXTURE0); gl.bindVertexArray(this.vao);
    }
}
