/** Native Float/half SDF mask table and Double timing solver. Internal renderer primitives. */
import {fma32, fma64, half} from "./precision.js";

export type TimingCurve = readonly [number, number, number, number];

/** The measured regular tint effect; callers receive an independent upload buffer. */
export function tintGradientMask(): Float32Array {
    return gradientMask([-1, 0, 10], [1, 1, 0], [
        [0, 0, 1, 1],
        [.6093800067901611, .006630000192672014, .47124001383781433, .9911500215530396]
    ]);
}

/** The native colormap solver uses eight Newton steps, then a bounded binary search. */
export function timingValue(curve: TimingCurve, input: number, tolerance = 1e-5): number {
    const [x1, y1, x2, y2] = curve;
    const ax = x1 * 3, termX = (x2 - x1) * 3, bx = termX - ax, cx = 1 - termX;
    const error = (t: number): number => fma64(fma64(fma64(t, cx, bx), t, ax), t, -input);
    let t = input, solved = false;
    for (let i = 0; i < 8; i++) {
        const e = error(t);
        if (Math.abs(e) < tolerance) { solved = true; break; }
        const derivative = fma64(fma64(cx * 3, t, bx + bx), t, ax);
        if (Math.abs(derivative) < 1e-6) break;
        t -= e / derivative;
    }
    if (!solved) {
        if (input < 0) t = 0;
        else if (input > 1) t = 1;
        else {
            let low = 0, high = 1; t = input;
            for (let i = 0; i < 1024; i++) {
                const e = error(t);
                if (Math.abs(e) < tolerance) break;
                if (e < 0) low = t; else high = t;
                t = fma64(high - low, .5, low);
                if (!(low < high)) break;
            }
        }
    }
    const ay = y1 * 3, termY = (y2 - y1) * 3, by = termY - ay, cy = 1 - termY;
    return fma64(fma64(t, cy, by), t, ay) * t;
}

/**
 * Generate the measured 256-texel floating mask path with white RGB stops.
 * Values are rounded half numbers in a Float32Array, suitable for an RGBA16F upload.
 * Colour-space conversion and the separate 512-texel byte path are outside this primitive.
 */
export function gradientMask(stops: readonly number[], alphas: readonly number[], curves: readonly TimingCurve[]): Float32Array {
    const count = stops.length;
    if (count < 2 || alphas.length !== count || curves.length !== count - 1) throw new RangeError("Gradient stop counts differ");
    const locations = stops.map(Math.fround), colours = alphas.map(Math.fround);
    const points = curves.map(c => c.map(Math.fround) as unknown as TimingCurve);
    if (locations.some((v, i) => !Number.isFinite(v) || (i > 0 && v <= (locations[i - 1] as number)))
        || colours.some(v => !Number.isFinite(v)) || points.some(c => c.some(v => !Number.isFinite(v)))) throw new RangeError("Invalid gradient mask inputs");
    const step = Math.fround(Math.fround((locations[count - 1] as number) - (locations[0] as number)) / 256);
    if (!(step > 0) || !Number.isFinite(step)) throw new RangeError("Invalid gradient mask extent");
    let position = Math.fround(fma64(step, .5, locations[0] as number)), segment = 0;
    const table = new Float32Array(256 * 4);
    for (let i = 0; i < 256; i++) {
        while (segment + 1 < count - 1 && (locations[segment + 1] as number) <= position) segment++;
        const start = locations[segment] as number, end = locations[segment + 1] as number;
        const inverse = Math.fround(1 / Math.fround(end - start));
        const u = Math.fround(Math.fround(position - start) * inverse);
        const weight = Math.fround(timingValue(points[segment] as TimingCurve, u));
        const a = colours[segment] as number, b = colours[segment + 1] as number;
        // White stops give the same premultiplied output for either interpolation mode.
        const alpha = half(fma32(Math.fround(b - a), weight, a)), rgb = alpha;
        table[i * 4] = rgb; table[i * 4 + 1] = rgb; table[i * 4 + 2] = rgb; table[i * 4 + 3] = alpha;
        position = Math.fround(position + step);
    }
    return table;
}
