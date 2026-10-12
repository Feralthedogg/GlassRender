/**
 * @file shared.ts
 * @brief Shared GPU resources, program linking and resource creation errors.
 */

import {
    BUILD_VERTEX, CAPTURE_FRAGMENT, DOWNSAMPLE_FRAGMENT, DOWNSAMPLE_FRAGMENT_8, FIRST_MIP_FRAGMENT, FIRST_MIP_FRAGMENT_8, FULL_VERTEX, LUMA_FRAGMENT, LUMA_VERTEX, PRESENT_FRAGMENT,
    SPLIT_FRAGMENT
} from "../kernels.js";
import { RGBA8 } from "./lanes.js";

/** @brief Info log of the last program that failed to link. */
export const LAST_ERROR: string[] = [""];

/**
 * @brief Pass programs, their uniform locations and the buffers, vertex arrays and textures shared
 * by all shapes.
 */
export interface Shared {
    readonly vao: WebGLVertexArrayObject;
    readonly buildVao: WebGLVertexArrayObject;
    readonly lumaVao: WebGLVertexArrayObject;
    readonly ubo: WebGLBuffer;
    readonly frameUbo: WebGLBuffer;
    readonly unionUbo: WebGLBuffer;
    readonly instBuf: WebGLBuffer;
    readonly lumaBuf: WebGLBuffer;
    readonly pbo: WebGLBuffer;
    readonly backdrop: WebGLTexture;
    readonly present: WebGLProgram;
    readonly split: WebGLProgram;
    readonly splitT: WebGLUniformLocation;
    readonly capture: WebGLProgram;
    readonly captureS: WebGLUniformLocation;
    readonly first: WebGLProgram;
    readonly firstS: WebGLUniformLocation;
    readonly first8: WebGLProgram;
    readonly first8S: WebGLUniformLocation;
    readonly down8: WebGLProgram;
    readonly down8S: WebGLUniformLocation;
    readonly down: WebGLProgram;
    readonly downS: WebGLUniformLocation;
    readonly luma: WebGLProgram;
    readonly lumaW: WebGLUniformLocation;
    readonly lumaTex: WebGLTexture;
    readonly lumaFbo: WebGLFramebuffer;
    /**
     * @brief Float render targets can be used (blur pyramids in half floats, mask fields,
     * extended-range output).
     */
    readonly halfFloat: boolean;
    /** @brief Programs link in the background and report when they are done (no wait to start one). */
    readonly parallel: boolean;
}

/**
 * @brief A program whose link was started and not yet checked, with its shaders for the error log.
 * @internal
 */
export class LinkJob {
    readonly program: WebGLProgram;
    readonly vertex: WebGLShader;
    readonly fragment: WebGLShader;

    constructor(program: WebGLProgram, vertex: WebGLShader, fragment: WebGLShader) {
        this.program = program;
        this.vertex = vertex;
        this.fragment = fragment;
    }
}

/**
 * @brief Compile the pass programs and create the shared objects of a context.
 * @param lumaCap Width of the luminance reading target in pixels.
 * @returns The objects, or why they cannot be made.
 */
export function openShared(gl: WebGL2RenderingContext, lumaCap: number): Shared | string {
    const halfFloat = gl.getExtension("EXT_color_buffer_float") !== null || gl.getExtension("EXT_color_buffer_half_float") !== null;
    const parallel = gl.getExtension("KHR_parallel_shader_compile") !== null;
    // Start every link before checking any, so the driver can compile them side by side.
    const jobs = [startLink(gl, FULL_VERTEX, PRESENT_FRAGMENT), startLink(gl, FULL_VERTEX, SPLIT_FRAGMENT),
        startLink(gl, BUILD_VERTEX, CAPTURE_FRAGMENT), startLink(gl, BUILD_VERTEX, DOWNSAMPLE_FRAGMENT),
        startLink(gl, BUILD_VERTEX, FIRST_MIP_FRAGMENT), startLink(gl, LUMA_VERTEX, LUMA_FRAGMENT),
        startLink(gl, BUILD_VERTEX, FIRST_MIP_FRAGMENT_8), startLink(gl, BUILD_VERTEX, DOWNSAMPLE_FRAGMENT_8)];
    const present = finishLink(gl, jobs[0] ?? null), split = finishLink(gl, jobs[1] ?? null);
    const capture = finishLink(gl, jobs[2] ?? null), down = finishLink(gl, jobs[3] ?? null);
    const first = finishLink(gl, jobs[4] ?? null), luma = finishLink(gl, jobs[5] ?? null);
    const first8 = finishLink(gl, jobs[6] ?? null), down8 = finishLink(gl, jobs[7] ?? null);
    if (present === null || split === null || capture === null || down === null || first === null || luma === null || first8 === null || down8 === null) {
        gl.deleteProgram(present); gl.deleteProgram(split); gl.deleteProgram(capture); gl.deleteProgram(down);
        gl.deleteProgram(first); gl.deleteProgram(luma); gl.deleteProgram(first8); gl.deleteProgram(down8);
        return "pass program failed to compile: " + (LAST_ERROR[0] as string);
    }
    const splitT = gl.getUniformLocation(split, "uT"), captureS = gl.getUniformLocation(capture, "uS");
    const downS = gl.getUniformLocation(down, "uS"), lumaW = gl.getUniformLocation(luma, "uW");
    const firstS = gl.getUniformLocation(first, "uS");
    const first8S = gl.getUniformLocation(first8, "uS"), down8S = gl.getUniformLocation(down8, "uS");
    if (splitT === null || captureS === null || downS === null || lumaW === null || firstS === null || first8S === null || down8S === null) return "pass uniforms missing";
    const vao = gl.createVertexArray() as WebGLVertexArrayObject | null, buildVao = gl.createVertexArray() as WebGLVertexArrayObject | null;
    const lumaVao = gl.createVertexArray() as WebGLVertexArrayObject | null;
    const ubo = gl.createBuffer() as WebGLBuffer | null, frameUbo = gl.createBuffer() as WebGLBuffer | null;
    const unionUbo = gl.createBuffer() as WebGLBuffer | null, instBuf = gl.createBuffer() as WebGLBuffer | null;
    const lumaBuf = gl.createBuffer() as WebGLBuffer | null, pbo = gl.createBuffer() as WebGLBuffer | null;
    const backdrop = gl.createTexture() as WebGLTexture | null, lumaTex = gl.createTexture() as WebGLTexture | null;
    const lumaFbo = gl.createFramebuffer() as WebGLFramebuffer | null;
    if (vao === null || buildVao === null || lumaVao === null || ubo === null || frameUbo === null || unionUbo === null
        || instBuf === null || lumaBuf === null || pbo === null || backdrop === null || lumaTex === null || lumaFbo === null) {
        return "context cannot create objects (lost?)";
    }
    gl.uniformBlockBinding(present, gl.getUniformBlockIndex(present, "F"), 1);
    gl.uniformBlockBinding(split, gl.getUniformBlockIndex(split, "F"), 1);
    gl.uniformBlockBinding(capture, gl.getUniformBlockIndex(capture, "F"), 1);
    gl.useProgram(present); gl.uniform1i(gl.getUniformLocation(present, "uB"), 1);
    gl.useProgram(split); gl.uniform1i(gl.getUniformLocation(split, "uB"), 1);
    gl.useProgram(capture); gl.uniform1i(gl.getUniformLocation(capture, "uB"), 1);
    gl.useProgram(down); gl.uniform1i(gl.getUniformLocation(down, "uP"), 0);
    gl.useProgram(first); gl.uniform1i(gl.getUniformLocation(first, "uP"), 0);
    gl.useProgram(luma); gl.uniform1i(gl.getUniformLocation(luma, "uP"), 0);
    gl.bindVertexArray(buildVao);
    gl.bindBuffer(0x8892, instBuf);
    for (let i = 0; i < 3; i++) { gl.enableVertexAttribArray(i); gl.vertexAttribPointer(i, 4, 0x1406, false, 48, i * 16); gl.vertexAttribDivisor(i, 1); }
    gl.bindVertexArray(lumaVao);
    gl.bindBuffer(0x8892, lumaBuf);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 4, 0x1406, false, 16, 0); gl.vertexAttribDivisor(0, 1);
    gl.bindVertexArray(null);
    gl.activeTexture(0x84c0);
    gl.bindTexture(0x0de1, lumaTex);
    gl.texParameteri(0x0de1, 0x2801, 0x2600); gl.texParameteri(0x0de1, 0x2800, 0x2600);
    gl.texParameteri(0x0de1, 0x2802, 0x812f); gl.texParameteri(0x0de1, 0x2803, 0x812f);
    gl.texImage2D(0x0de1, 0, RGBA8, lumaCap, 1, 0, 0x1908, 0x1401, null);
    gl.bindFramebuffer(0x8d40, lumaFbo);
    gl.framebufferTexture2D(0x8d40, 0x8ce0, 0x0de1, lumaTex, 0);
    gl.bindFramebuffer(0x8d40, null);
    gl.bindBuffer(0x88eb, pbo); gl.bufferData(0x88eb, lumaCap * 4, 0x88e1); gl.bindBuffer(0x88eb, null);
    gl.activeTexture(0x84c1);
    gl.bindTexture(0x0de1, backdrop);
    gl.texParameteri(0x0de1, 0x2801, 0x2601); gl.texParameteri(0x0de1, 0x2800, 0x2601);
    gl.texParameteri(0x0de1, 0x2802, 0x812f); gl.texParameteri(0x0de1, 0x2803, 0x812f);
    gl.texImage2D(0x0de1, 0, RGBA8, 1, 1, 0, 0x1908, 0x1401, null);
    return {
        vao, buildVao, lumaVao, ubo, frameUbo, unionUbo, instBuf, lumaBuf, pbo, backdrop, present, split, splitT, capture, captureS, first,
        firstS, first8, first8S, down8, down8S, down, downS, luma, lumaW, lumaTex, lumaFbo, halfFloat, parallel
    };
}

/** @brief Compile and link a program, waiting for the result. */
export function link(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram | null {
    return finishLink(gl, startLink(gl, vs, fs));
}

/**
 * @brief Compile and link a program without asking for the result, so nothing waits for the
 * driver yet.
 */
export function startLink(gl: WebGL2RenderingContext, vs: string, fs: string): LinkJob | null {
    const v = gl.createShader(0x8b31), f = gl.createShader(0x8b30), p = gl.createProgram() as WebGLProgram | null;
    if (v === null || f === null || p === null) { gl.deleteShader(v); gl.deleteShader(f); gl.deleteProgram(p); return null; }
    gl.shaderSource(v, vs); gl.compileShader(v);
    gl.shaderSource(f, fs); gl.compileShader(f);
    gl.attachShader(p, v); gl.attachShader(p, f); gl.linkProgram(p);
    return new LinkJob(p, v, f);
}

/** @brief Whether a started link is done (always true without background linking). */
export function linkDone(gl: WebGL2RenderingContext, job: LinkJob, parallel: boolean): boolean {
    return !parallel || gl.getProgramParameter(job.program, 0x91b1) === true;
}

/**
 * @brief The program of a started link once it is done (waiting for it if needed), or null with the
 * log in `LAST_ERROR` when it failed.
 */
export function finishLink(gl: WebGL2RenderingContext, job: LinkJob | null): WebGLProgram | null {
    if (job === null) return null;
    const p = job.program, v = job.vertex, f = job.fragment;
    const linked = gl.getProgramParameter(p, 0x8b82) === true;
    if (!linked) LAST_ERROR[0] = (gl.getShaderInfoLog(f) ?? "") + (gl.getShaderInfoLog(v) ?? "") + (gl.getProgramInfoLog(p) ?? "");
    gl.detachShader(p, v); gl.detachShader(p, f); gl.deleteShader(v); gl.deleteShader(f);
    if (!linked) { gl.deleteProgram(p); return null; }
    return p;
}

/** @brief Drop a started link without waiting for it. */
export function dropLink(gl: WebGL2RenderingContext, job: LinkJob): void {
    gl.deleteShader(job.vertex); gl.deleteShader(job.fragment); gl.deleteProgram(job.program);
}
