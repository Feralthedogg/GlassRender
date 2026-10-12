import { edrFactor } from "../../dist/hdr.js";

function distance(a, b) {
    let maximum = 0;
    for (let i = 0; i < a.length; i++) maximum = Math.max(maximum, Math.abs(a[i] - b[i]));
    return maximum;
}

export async function surfaceState(truthy, equal, makeGlass, frameOf) {
    const glass = makeGlass({ extendedRange: true, headroom: 2 });
    glass.add({ x: 60, y: 60, width: 280, height: 190, radius: 24 });
    if (!glass.extendedRange) { glass.destroy(); return "skipped: no half-float drawing buffer"; }
    try {
        const renderer = glass.renderer;
        truthy(renderer.setSurfaceScale(4, .25).value, "base HDR normalization active");
        const baseline = frameOf(glass, true);
        const active = renderer.setSurfaceScale(4, .25, 2);
        truthy(active.ok && active.value, "state factor preserves HDR selection");
        equal(renderer.frame[14], edrFactor(.25, 2, true), "state product coefficient");
        const adjusted = frameOf(glass, true);
        truthy(distance(baseline, adjusted) > .01, "state product changes rendered colors");
        equal(renderer.headroom, 2, "state product does not change display headroom");

        for (const state of [-1, NaN, Infinity, Number.MAX_VALUE, 1e20]) {
            truthy(!renderer.setSurfaceScale(1, 1, state).ok, "invalid state rejected: " + state);
        }
        truthy(!renderer.setSurfaceScale(1e-50, .25, 1).ok, "Float32-zero context rejected");
        equal(distance(adjusted, frameOf(glass, true)), 0, "failed configuration preserves the frame");

        glass.setExtendedRange(false); frameOf(glass);
        glass.setExtendedRange(true);
        equal(distance(adjusted, frameOf(glass, true)), 0, "state product survives output-range transitions");
        const extension = glass.canvas.getContext("webgl2").getExtension("WEBGL_lose_context");
        truthy(extension, "test context supports loss and restore");
        const lost = new Promise(resolve => glass.canvas.addEventListener("webglcontextlost", resolve, { once: true }));
        extension.loseContext(); await lost;
        equal(glass.contextLost, true, "context loss was observed");
        await new Promise(resolve => setTimeout(resolve, 50));
        const restored = new Promise(resolve => glass.canvas.addEventListener("webglcontextrestored", resolve, { once: true }));
        extension.restoreContext(); await restored;
        equal(glass.contextLost, false, "context was restored");
        equal(distance(adjusted, frameOf(glass, true)), 0, "state product survives resource restoration");

        truthy(renderer.setSurfaceScale(4, .25, 0).ok, "zero state accepted");
        equal(renderer.frame[14], 0, "zero state resolves to zero without metadata default substitution");
        const zero = frameOf(glass, true);
        truthy(distance(adjusted, zero) > .01, "zero state has a visible effect");
        for (const value of zero) truthy(Number.isFinite(value), "zero state produces finite pixels");
        renderer.setSurfaceScale(4, .25);
        equal(distance(baseline, frameOf(glass, true)), 0, "two-argument API restores unit state");
    } finally {
        glass.destroy();
    }
}
