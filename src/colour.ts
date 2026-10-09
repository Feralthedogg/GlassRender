/**
 * @file colour.ts
 * @brief Color matrices for backdrop compositing and vibrant layers.
 * @details Preserve the specified Float32 accumulation order at the CPU/GPU boundary.
 */

import { fma32 } from "./precision.js";

type Matrix = Float32Array | Float64Array;
const f = Math.fround;
const ID = new Float32Array([1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0]);
const TO = new Float32Array([.2126, .7152, .0722, 0, 0, -.1146, -.3854, .5, 0, .5, .5, -.4542, -.0458, 0, .5, 0, 0, 0, 1, 0]);
const CA = new Float32Array([1, 0, 1.5748, 0, -.7874, 1, -.187324, -.468124, 0, .327724, 1, 1.8556, 0, 0, -.9278, 0, 0, 0, 1, 0]);
const DL = new Float32Array([1, 0, 1.5748, 0, -.7874, 1, -.1873, -.4681, 0, .3277, 1, 1.8556, 0, 0, -.9278, 0, 0, 0, 1, 0]);
const A = new Float32Array(20), B = new Float32Array(20), L = new Float32Array(20), S = new Float32Array(20);
const ORDER = new Uint8Array([3, 2, 1, 0, 3, 2, 1, 0, 3, 2, 1, 0, 3, 2, 1, 0,
    3, 2, 1, 0, 3, 2, 1, 0, 3, 2, 1, 0, 3, 1, 2, 0,
    3, 2, 1, 0, 3, 2, 1, 0, 3, 2, 0, 1, 3, 0, 2, 1,
    3, 2, 1, 0, 3, 1, 2, 0, 3, 0, 2, 1, 3, 0, 1, 2]);
const BIAS = new Uint8Array([3, 2, 1, 0, 2, 1, 3, 0, 2, 0, 3, 1, 0, 1, 3, 2]);

/**
 * @brief Unfused affine product, accumulated in 3,2,1,0 order.
 * @internal
 */
export function product32(out: Matrix, left: Matrix, right: Matrix): void {
    for (let row = 0; row < 4; row++) for (let col = 0; col < 5; col++) {
        const r = row * 5;
        let v = f((left[r + 3] as number) * (right[15 + col] as number));
        for (let k = 2; k >= 0; k--) v = f(v + f((left[r + k] as number) * (right[k * 5 + col] as number)));
        out[r + col] = col === 4 ? f(v + (left[r + 4] as number)) : v;
    }
}

function fusedProduct(out: Matrix, left: Matrix, right: Matrix): void {
    for (let row = 0; row < 4; row++) for (let col = 0; col < 5; col++) {
        const r = row * 5, at = (row * 4 + col) * 4;
        let v: number;
        if (col === 4) {
            v = left[r + 4] as number;
            for (let j = 0; j < 4; j++) { const k = BIAS[row * 4 + j] as number; v = fma32(right[k * 5 + col] as number, left[r + k] as number, v); }
        } else {
            const k = ORDER[at] as number;
            v = f((left[r + k] as number) * (right[k * 5 + col] as number));
            for (let j = 1; j < 4; j++) { const k = ORDER[at + j] as number; v = fma32(right[k * 5 + col] as number, left[r + k] as number, v); }
        }
        out[r + col] = v;
    }
}

/**
 * @brief Background YCC composite with premultiplied binary32 fill.
 * @internal
 */
export function composite32(out: Matrix, white: number, black: number, saturation: number, r: number, g: number, b: number, a: number): void {
    white = f(white); black = f(black); saturation = f(saturation); a = f(a);
    L.set(ID); S.set(ID); L[0] = f(white - black); L[4] = black;
    S[6] = saturation; S[12] = saturation; S[9] = S[14] = f(.5 - saturation * .5);
    fusedProduct(A, L, TO); fusedProduct(B, S, A); fusedProduct(out, CA, B);
    const keep = f(1 - a);
    for (let i = 0; i < 20; i++) out[i] = f((out[i] as number) * keep);
    out[4] = f((out[4] as number) + f(r)); out[9] = f((out[9] as number) + f(g));
    out[14] = f((out[14] as number) + f(b)); out[18] = f((out[18] as number) + a);
}

/**
 * @brief YCC transform used by vibrant layers.
 * @internal
 */
export function vibrantYcc32(out: Matrix, input: Matrix, black: number, white: number, saturation: number, hue = 0, forward = true): void {
    black = f(black); white = f(white); saturation = f(saturation);
    if (black === 0 && white === 1 && saturation === 1 && hue === 0) { out.set(input); return; }
    product32(A, TO, input); L.set(ID); S.set(ID);
    const delta = f(white - black);
    L[0] = forward ? delta : delta === 0 ? 2 ** -23 : f(1 / delta);
    L[4] = forward ? black : -f((L[0] as number) * black);
    S[6] = saturation; S[12] = saturation; S[9] = S[14] = f(.5 - f(saturation * .5));
    if (forward) { product32(B, L, A); if (saturation !== 1) product32(A, S, B); else A.set(B); }
    else { if (saturation !== 1) { product32(B, S, A); product32(A, L, B); } else { product32(B, L, A); A.set(B); } }
    if (hue !== 0) { hue32(B, A, hue); A.set(B); }
    product32(out, DL, A);
}

/**
 * @brief Rotation in encoded YCC, with a Double input angle.
 * @internal
 */
export function hue32(out: Matrix, input: Matrix, angle: number): void {
    if (angle === 0) { out.set(input); return; }
    const sn = f(Math.sin(angle)), delta = f(Math.cos(angle) - 1), halfDelta = f(delta * .5);
    S.set(ID); S[6] = S[12] = f(delta + 1); S[7] = -sn; S[11] = sn;
    S[9] = f(f(sn * .5) - halfDelta); S[14] = f(f(sn * -.5) - halfDelta);
    product32(out, S, input);
}

/**
 * @brief Signed linear-to-encoded color conversion.
 * @internal
 */
export function encode32(x: number): number {
    x = f(x); const v = x > 0 ? x : -x;
    const y = v <= f(.0031308) ? f(v * f(12.92)) : v === 1 ? 1 : f(f(f(Math.pow(v, f(5 / 12))) * f(1.055)) + f(-.055));
    return x > 0 ? y : -y;
}

/**
 * @brief Signed encoded-to-linear color conversion.
 * @internal
 */
export function decode32(x: number): number {
    x = f(x); const v = x > 0 ? x : -x;
    const y = v <= f(.04045) ? f(v * f(1 / 12.92)) : v === 1 ? 1 : f(Math.pow(f(f(v * 0.9478673338890076) + 0.052132703363895416), f(2.4)));
    return x > 0 ? y : -y;
}

/**
 * @brief Blend a straight encoded color into an affine matrix.
 * @internal
 */
export function fill32(out: Matrix, input: Matrix, r: number, g: number, b: number, alpha: number, kind: "normal" | "dodge" | "burn"): void {
    const a = f(alpha), keep = f(1 - a);
    if (kind === "normal") {
        for (let i = 0; i < 20; i++) { const v = f((input[i] as number) * keep); out[i] = i === 4 || i === 9 || i === 14 || i === 18 ? v : f(v + 0); }
        out[4] = f((out[4] as number) + f(a * f(r))); out[9] = f((out[9] as number) + f(a * f(g)));
        out[14] = f((out[14] as number) + f(a * f(b))); out[18] = f((out[18] as number) + a);
        return;
    }
    L.set(ID);
    for (let i = 0; i < 3; i++) {
        const c = f(i === 0 ? r : i === 1 ? g : b);
        if (kind === "dodge") { const z = Math.min(f(a * c), f(255 / 256)); L[i * 6] = f(f(z / f(1 - z)) + 1); }
        else { const denominator = f(keep + f(f(1 - keep) * c)), gain = denominator < f(1 / 256) ? 9999 : f(1 / denominator); L[i * 6] = gain; L[i * 5 + 4] = f(1 - gain); }
    }
    product32(out, L, input);
}

/**
 * @brief Float division, ties away from zero, Float multiplication.
 * @internal
 */
export function tidy32(out: Matrix, input: Matrix, epsilon = 1e-12, step = 1e-4): void {
    epsilon = f(epsilon); step = f(step);
    for (let i = 0; i < 20; i++) {
        let v = f(input[i] as number); if (v > -epsilon && v < epsilon) v = 0;
        const q = f(v / step), rounded = (q < 0 || Object.is(q, -0) ? -1 : 1) * Math.floor(Math.abs(q) + .5);
        out[i] = f(rounded * step);
    }
}

/**
 * @brief Build a vibrant matrix from encoded profile colors.
 * @internal
 */
export function vibrant32(out: Matrix, white: number, black: number, saturation: number, r: number, g: number, b: number, a: number,
    dr: number, dg: number, db: number, da: number): void {
    a = f(a); da = f(da);
    vibrantYcc32(out, ID, black, white, saturation);
    if (a > 0) { B.set(out); fill32(out, B, r, g, b, a, "normal"); }
    if (da > 0) { B.set(out); fill32(out, B, dr, dg, db, da, "dodge"); }
    tidy32(out, out);
}
