function difference(a, b) {
    let maximum = 0;
    for (let i = 0; i < a.length; i++) maximum = Math.max(maximum, Math.abs(a[i] - b[i]));
    return maximum;
}

export async function displayBrightness(truthy, equal, makeGlass, frameOf) {
    const numeric = makeGlass({ extendedRange: true, displayHeadroom: 1.25 });
    const derived = makeGlass({ extendedRange: true });
    try {
        const shape = { x: 80, y: 70, width: 270, height: 190, radius: 24, appearance: "light", adaptive: false };
        numeric.add(shape); derived.add(shape);
        if (!derived.extendedRange) return "skipped: no half-float drawing buffer";
        for (const glass of [numeric, derived]) truthy(glass.renderer.setSurfaceScale(4, .25, 2).ok, "independent surface scales accepted");
        const state = { panelMax: 600, brightnessCap: 500, sdrBrightness: 400, maxHeadroom: 2 };
        const result = derived.setDisplayBrightness(state);
        truthy(result.ok, "supplied display state accepted"); equal(result.value, 1.25, "brightness cap resolves current headroom");
        equal(derived.displayHeadroom, 1.25, "public headroom reflects resolved state");
        equal(difference(frameOf(derived, true), frameOf(numeric, true)), 0, "derived headroom matches explicit numeric HDR pixels");
        const coefficients = [...derived.renderer.frame.slice(12, 16)];
        derived.setDisplayBrightness({ ...state, requestedHeadroom: 1.1 }); numeric.setExtendedRange(true, 1.1);
        equal(derived.displayHeadroom, Math.fround(1.1), "requested headroom is bounded before rendering");
        const requested = frameOf(derived, true);
        equal(difference(requested, frameOf(numeric, true)), 0, "requested headroom uses the existing HDR material path");
        equal(JSON.stringify([...derived.renderer.frame.slice(12, 16)]), JSON.stringify(coefficients), "headroom does not change context/surface coefficients");
        for (const invalid of [{ ...state, brightnessCap: NaN }, { ...state, minHeadroom: 3 }, { ...state, maxHeadroom: Infinity }]) {
            truthy(!derived.setDisplayBrightness(invalid).ok, "invalid high-level state rejected");
            truthy(!derived.renderer.setDisplayBrightness(invalid).ok, "invalid low-level state rejected");
        }
        equal(derived.displayHeadroom, Math.fround(1.1), "invalid state preserves headroom");
        equal(difference(requested, frameOf(derived, true)), 0, "invalid state preserves HDR pixels");
        truthy(derived.renderer.setDisplayBrightness({ ...state, requestedHeadroom: 1.1 }).ok, "low-level brightness entry point accepted");
        equal(difference(requested, frameOf(derived, true)), 0, "low-level brightness resolution uses the same material path");
        state.brightnessCap = NaN;
        derived.setExtendedRange(false); frameOf(derived);
        equal(derived.extendedRange, false, "explicit SDR selection retained");
        truthy(derived.setDisplayBrightness({ panelMax: 600, brightnessCap: 500, sdrBrightness: 400, maxHeadroom: 2, requestedHeadroom: 1.1 }).ok, "state can update while SDR is selected");
        equal(derived.extendedRange, false, "brightness state does not enable HDR");
        derived.setExtendedRange(true);
        equal(difference(requested, frameOf(derived, true)), 0, "derived headroom survives SDR/HDR transitions");
        const extension = derived.canvas.getContext("webgl2").getExtension("WEBGL_lose_context");
        truthy(extension, "context loss control available");
        const lost = new Promise(resolve => derived.canvas.addEventListener("webglcontextlost", resolve, { once: true }));
        extension.loseContext(); await lost; await new Promise(resolve => setTimeout(resolve, 50));
        const restored = new Promise(resolve => derived.canvas.addEventListener("webglcontextrestored", resolve, { once: true }));
        extension.restoreContext(); await restored;
        equal(derived.displayHeadroom, Math.fround(1.1), "resolved headroom survives restoration without rereading the mutated caller state");
        equal(difference(requested, frameOf(derived, true)), 0, "resolved brightness state restores the same HDR pixels");
    } finally { numeric.destroy(); derived.destroy(); }
}
