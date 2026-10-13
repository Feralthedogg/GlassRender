// Frame cost of the built package (dist/) in the browser that runs it. Every scene is drawn `frames` times; after each
// frame a one-pixel target is cleared, which ends the render pass of the canvas as presenting the frame would (without
// it the GPU drops the draws of all frames but the last and the numbers come out far too low). The time is the wall
// clock from the first frame to a blocking read after the last one, per frame.
import {
    CORNER_SMOOTH, ENV_INCREASE_CONTRAST, SCHEME_DARK, SCHEME_LIGHT, STACKING_FLAT, STACKING_OVERLAP, createRenderer
} from "../dist/index.js";

const W = 2000, H = 1400, SCALE = 2;

function paint() {
    const c = document.createElement("canvas");
    c.width = W; c.height = H;
    const g = c.getContext("2d");
    let seed = 5;
    const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
    const bg = g.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, "#16324f"); bg.addColorStop(0.5, "#7a3a8a"); bg.addColorStop(1, "#d8663c");
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 70; i++) {
        g.fillStyle = `hsla(${rnd() * 360}, 80%, ${25 + rnd() * 60}%, 0.9)`;
        g.beginPath(); g.arc(rnd() * W, rnd() * H, 20 + rnd() * 220, 0, 7); g.fill();
    }
    g.fillStyle = "#fff"; g.font = "600 52px sans-serif";
    for (let i = 0; i < 12; i++) g.fillText("glass 0123456789 glass 0123456789 glass 0123456789", 40 + (i % 2) * 100, 110 + i * 112);
    return c;
}

function star(size) {
    const c = document.createElement("canvas");
    c.width = c.height = size * SCALE * 4;
    const g = c.getContext("2d");
    g.beginPath();
    for (let i = 0; i < 10; i++) {
        const r = c.width / 2 * (i % 2 ? 0.45 : 1), a = Math.PI * i / 5 - Math.PI / 2;
        g.lineTo(c.width / 2 + r * Math.cos(a), c.width / 2 + r * Math.sin(a));
    }
    g.closePath(); g.fillStyle = "#fff"; g.fill();
    return c;
}

// shape records: [x, y, w, h, radius, dark]
const BIG = [[250, 200, 500, 300, 32, true]];
const GRID = Array.from({ length: 24 }, (_, i) => {
    const col = i % 6, row = Math.floor(i / 6);
    return i % 3 === 0 ? [40 + col * 150, 40 + row * 150, 120, 120, 60, true] : i % 3 === 1 ? [40 + col * 150, 60 + row * 150, 130, 44, 22, true]
        : [40 + col * 150, 40 + row * 150, 130, 100, 24, false];
});
const ROW = Array.from({ length: 10 }, (_, i) => [200 + i * 56, 200, 44, 44, 22, true]);
const PANEL = [[150, 150, 700, 400, 40, true]];
let seed = 3;
const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
const MANY = Array.from({ length: 300 }, () => [rnd() * 940, rnd() * 640, 30 + rnd() * 50, 30 + rnd() * 50, 12, rnd() > 0.5]);

function add(r, s) {
    return r.addShape(s[0], s[1], s[2], s[3], s[4], CORNER_SMOOTH, s[5] ? SCHEME_DARK : SCHEME_LIGHT);
}

// name -> { shapes, change: "none" | "move" | "backdrop", setup? }
const SCENES = {
    "1 large glass, nothing changes": { shapes: BIG, change: "none" },
    "1 large glass, moved every frame": { shapes: BIG, change: "move" },
    "1 large glass, backdrop changes every frame": { shapes: BIG, change: "backdrop" },
    "24 shapes in one layer (flat), nothing changes": { shapes: GRID, change: "none", flat: true },
    "24 shapes in one layer (flat), all moved every frame": { shapes: GRID, change: "move", flat: true },
    "24 shapes in one layer (flat), backdrop changes every frame": { shapes: GRID, change: "backdrop", flat: true },
    "24 shapes in one layer (flat), one moved every frame": { shapes: GRID, change: "one", flat: true },
    "24 shapes touching by their shadows (exact), backdrop changes": { shapes: GRID, change: "backdrop" },
    "24 shapes touching by their shadows (exact), nothing changes": { shapes: GRID, change: "none" },
    "panel with a row of 10 small shapes on it, backdrop changes": { shapes: PANEL.concat(ROW), change: "backdrop" },
    "the same row as one group, backdrop changes": {
        shapes: PANEL, change: "backdrop",
        setup: (r) => { const u = r.addUnion(0, SCHEME_DARK); for (const s of ROW) r.addMember(u, s[0], s[1], s[2], s[3], s[4], CORNER_SMOOTH); }
    },
    "24 shapes with a denser face (increase contrast), backdrop changes": {
        shapes: GRID, change: "backdrop", flat: true, setup: (r) => r.setEnvironment(ENV_INCREASE_CONTRAST)
    },
    "a mask shape and a group with a mask member, backdrop changes": {
        shapes: [], change: "backdrop",
        setup: (r) => {
            r.addMask(star(240), 380, 230, 240, 240, SCHEME_DARK);
            const u = r.addUnion(30, SCHEME_DARK);
            r.addMember(u, 60, 60, 160, 160, 80, CORNER_SMOOTH);
            r.addMemberMask(u, star(160), 200, 60, 160, 160);
        }
    },
    "300 small shapes scattered (flat), all moved every frame": { shapes: MANY, change: "move", flat: true },
    "300 small shapes scattered (exact), the first one drawn moved every frame": { shapes: MANY, change: "one" },
    "300 small shapes scattered (exact), the last one drawn moved every frame": { shapes: MANY, change: "one", moved: 299 },
    "24 shapes touching by their shadows (exact), one moved every frame": { shapes: GRID, change: "one" },
    "panel with a row of 10 small shapes on it, one small shape moved": { shapes: ROW.concat(PANEL), change: "one", panelFirst: true },
    "24 shapes touching by their shadows (overlap), backdrop changes": { shapes: GRID, change: "backdrop", overlap: true },
    "24 shapes touching by their shadows (overlap), one moved every frame": { shapes: GRID, change: "one", overlap: true },
    "panel with a row of 10 small shapes on it (overlap), backdrop changes": { shapes: PANEL.concat(ROW), change: "backdrop", overlap: true },
    "panel with a row of 10 small shapes on it (overlap), one small shape moved": { shapes: ROW.concat(PANEL), change: "one", panelFirst: true, overlap: true },
    "300 small shapes scattered (overlap), the first one drawn moved every frame": { shapes: MANY, change: "one", overlap: true },
};

async function measure(name, scene, frames, backdrop) {
    const canvas = document.createElement("canvas");
    canvas.width = W; canvas.height = H;
    const gl = canvas.getContext("webgl2", { antialias: false, alpha: false });
    const made = createRenderer(gl);
    if (!made.ok) return { name, error: made.error };
    const r = made.value;
    r.resize(W, H, SCALE);
    r.setBackdropSource(backdrop);
    if (scene.flat) r.setStacking(STACKING_FLAT);
    if (scene.overlap) r.setStacking(STACKING_OVERLAP);
    // the panel is drawn first, the row over it; the moved shape is the first of the row
    const shapes = scene.panelFirst ? PANEL.concat(ROW) : scene.shapes;
    const handles = shapes.map((s) => add(r, s));
    const moved = scene.panelFirst ? 1 : scene.moved ?? 0;
    if (scene.setup) scene.setup(r);
    const one = new Uint8Array(4);
    r.settle();
    r.render(0); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, one);          // warm-up: programs and pyramids
    const endTex = gl.createTexture(), endFbo = gl.createFramebuffer();
    gl.activeTexture(gl.TEXTURE7);
    gl.bindTexture(gl.TEXTURE_2D, endTex);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, 1, 1);
    gl.bindFramebuffer(gl.FRAMEBUFFER, endFbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, endTex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.activeTexture(gl.TEXTURE0);
    let clock = 0, cpu = 0;
    const t0 = performance.now();
    for (let k = 0; k < frames; k++) {
        const c0 = performance.now();
        if (scene.change === "backdrop") r.markBackdropDirty();
        else if (scene.change === "move") for (let i = 0; i < handles.length; i++) { const s = shapes[i]; r.setShape(handles[i], s[0] + (k % 60), s[1] + (k % 40) * 0.5, s[2], s[3], s[4]); }
        else if (scene.change === "one") { const s = shapes[moved]; r.setShape(handles[moved], s[0] + (k % 60), s[1] + (k % 40) * 0.5, s[2], s[3], s[4]); }
        clock += 1000 / 60;
        r.render(clock);
        cpu += performance.now() - c0;
        gl.bindFramebuffer(gl.FRAMEBUFFER, endFbo); gl.clear(gl.COLOR_BUFFER_BIT); gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, one);                        // waits for every queued command
    const ms = (performance.now() - t0) / frames;
    const error = gl.getError();
    r.dispose();
    const lose = gl.getExtension("WEBGL_lose_context");
    if (lose) lose.loseContext();                                                     // free the context for the next scene
    return { name, ms, cpu: cpu / frames, error };
}

/** Run every scene (or those whose name contains `only`); returns [{ name, ms, cpu }]. */
window.__bench = async (only = "", frames = 300) => {
    const backdrop = paint(), out = [];
    const dbg = document.createElement("canvas").getContext("webgl2");
    const info = dbg && dbg.getExtension("WEBGL_debug_renderer_info");
    const gpu = info ? dbg.getParameter(info.UNMASKED_RENDERER_WEBGL) : "unknown";
    document.body.append(`${W} x ${H} target, ${frames} frames per scene, ${gpu}\n\n`);
    for (const [name, scene] of Object.entries(SCENES)) {
        if (only && !name.includes(only)) continue;
        const row = await measure(name, scene, frames, backdrop);
        out.push(row);
        document.body.append(row.error ? `${name}: error ${row.error}\n` : `${row.ms.toFixed(3).padStart(8)} ms  (calls ${row.cpu.toFixed(3)} ms)  ${name}\n`);
        await new Promise((done) => setTimeout(done, 30));
    }
    return { gpu, width: W, height: H, frames, rows: out };
};
window.__ready = true;
// ?run runs at once (&frames=, &only=); with ?report the result goes back to the server that serves this page
// (tools/report.mjs), for browsers that are opened by hand or cannot be driven remotely
const params = new URLSearchParams(location.search);
if (params.has("run")) {
    window.__bench(params.get("only") || "", Number(params.get("frames") || 300)).then((result) => {
        if (!params.has("report")) return;
        fetch("/__report", { method: "POST", body: JSON.stringify({ kind: "bench", agent: navigator.userAgent, ...result }) }).then(() => window.close(), () => {});
    });
}
