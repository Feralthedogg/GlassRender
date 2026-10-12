// Shared helpers of the browser suites: the painted backdrop, frames read from a glass or a low-level renderer, small
// assertions, and the runner that the test pages install (window.__run, driven by test/browser/run.mjs).
import { createGlass, createRenderer } from "../../dist/index.js";

export const W = 640, H = 420, RATIO = 2;

// a painted backdrop, the same on every run
export function paint(white = false) {
    const c = document.createElement("canvas");
    c.width = W * RATIO; c.height = H * RATIO;
    const g = c.getContext("2d");
    let seed = 11;
    const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
    if (white) { g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); return c; }
    const bg = g.createLinearGradient(0, 0, c.width, c.height);
    bg.addColorStop(0, "#16324f"); bg.addColorStop(0.5, "#7a3a8a"); bg.addColorStop(1, "#d8663c");
    g.fillStyle = bg; g.fillRect(0, 0, c.width, c.height);
    for (let i = 0; i < 40; i++) {
        g.fillStyle = `hsla(${rnd() * 360}, 80%, ${25 + rnd() * 60}%, 0.9)`;
        g.beginPath(); g.arc(rnd() * c.width, rnd() * c.height, 20 + rnd() * 160, 0, 7); g.fill();
    }
    g.fillStyle = "#fff"; g.font = "600 44px sans-serif";
    for (let i = 0; i < 9; i++) g.fillText("glass 0123456789 glass 0123456789", 30 + (i % 2) * 80, 90 + i * 92);
    return c;
}

export function star(size) {
    const c = document.createElement("canvas");
    c.width = c.height = size * RATIO * 4;
    const g = c.getContext("2d");
    g.beginPath();
    for (let i = 0; i < 10; i++) {
        const r = c.width / 2 * (i % 2 ? 0.45 : 1), a = Math.PI * i / 5 - Math.PI / 2;
        g.lineTo(c.width / 2 + r * Math.cos(a), c.width / 2 + r * Math.sin(a));
    }
    g.closePath(); g.fillStyle = "#fff"; g.fill();
    return c;
}

export function fail(message) { throw new Error(message); }
export function equal(a, b, label) { if (a !== b) fail(`${label}: ${JSON.stringify(a)} is not ${JSON.stringify(b)}`); }
export function truthy(v, label) { if (!v) fail(label); }

// largest channel difference of two frames, in levels
export function distance(a, b) {
    if (a.length !== b.length) fail("frames of different sizes");
    let worst = 0;
    for (let i = 0; i < a.length; i++) { const d = Math.abs(a[i] - b[i]); if (d > worst) worst = d; }
    return worst;
}

// A glass on a new canvas (not sized by the page) with the painted backdrop.
export function makeGlass(options = {}, backdrop = paint()) {
    const canvas = document.createElement("canvas");
    const made = createGlass(canvas, { autoResize: false, appearance: "dark", ...options });
    if (!made.ok) fail(made.error);
    const glass = made.value;
    glass.resize(W, H, RATIO);
    glass.setBackdrop(backdrop);
    return glass;
}

// The settled frame of a glass: transitions and luminance readings finished, then drawn and read at once.
export function frameOf(glass, float = false) {
    const gl = glass.canvas.getContext("webgl2"), w = glass.canvas.width, h = glass.canvas.height;
    glass.renderer.settle();
    glass.render();
    const px = float ? new Float32Array(w * h * 4) : new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, float ? gl.FLOAT : gl.UNSIGNED_BYTE, px);
    if (gl.getError() !== 0) fail("GL error while drawing");
    return px;
}

// The same through the low-level renderer: `build(renderer)` adds the shapes.
export function lowFrame(build, backdrop = paint()) {
    const canvas = document.createElement("canvas");
    canvas.width = W * RATIO; canvas.height = H * RATIO;
    const gl = canvas.getContext("webgl2", { antialias: false, alpha: false });
    const made = createRenderer(gl);
    if (!made.ok) fail(made.error);
    const r = made.value;
    r.resize(canvas.width, canvas.height, RATIO);
    r.setBackdropSource(backdrop);
    build(r);
    r.settle();
    r.render(0);
    const px = new Uint8Array(canvas.width * canvas.height * 4);
    gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, px);
    if (gl.getError() !== 0) fail("GL error while drawing");
    r.dispose();
    return px;
}

export const tick = (ms = 0) => new Promise((done) => setTimeout(done, ms));

/**
 * Install `tests` ({ name: function }) as the page's suite: window.__run(only) runs every test whose name contains `only`
 * (or one of its parts separated by "|")
 * and returns [{ name, ok, note }], showing the same on the page. With ?run the page runs at once; with ?report as well it
 * posts the results back to the server that serves it, for browsers opened by hand.
 */
export function install(tests) {
    window.__run = async (only) => {
        const out = [], parts = only ? only.split("|") : [];
        for (const [name, test] of Object.entries(tests)) {
            if (parts.length > 0 && !parts.some((part) => name.includes(part))) continue;
            let ok = true, note = "";
            try { note = (await test()) || ""; } catch (e) { ok = false; note = String(e && e.message || e); }
            out.push({ name, ok, note });
            const line = document.createElement("div");
            line.textContent = (ok ? (note ? "- " : "ok ") : "FAIL ") + name + (note ? " (" + note + ")" : "");
            line.style.color = ok ? "" : "#c00";
            document.body.append(line);
        }
        return out;
    };
    window.__ready = true;
    const params = new URLSearchParams(location.search);
    if (params.has("run")) {
        window.__run(params.get("only") || "").then((results) => {
            if (!params.has("report")) return;
            const gl = document.createElement("canvas").getContext("webgl2"), dbg = gl && gl.getExtension("WEBGL_debug_renderer_info");
            const body = JSON.stringify({ kind: "test", agent: navigator.userAgent, gpu: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : "unknown", results });
            fetch("/__report", { method: "POST", body }).then(() => window.close(), () => {});
        });
    }
}
