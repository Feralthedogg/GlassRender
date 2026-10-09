/**
 * @file sdf.ts
 * @brief Material distance ranges used to build and encode mask fields.
 */

import { extentFactor } from "./material.js";
import {
    P_BLEED_AMOUNT, P_BLEED_D0, P_BLEED_D1, P_BLEED_HEIGHT, P_BLEED_OPACITY, P_BLUR_D0, P_BLUR_D1, P_BLUR_D3,
    P_BLUR, P_BLUR_OP0, P_BLUR_OP1, P_DARK_HEIGHT, P_DARK_OFFSET, P_FACE_OPACITY, P_IN_AMOUNT, P_IN_HEIGHT,
    P_OUT_AMOUNT, P_OUT_D0, P_OUT_D1, P_OUT_HEIGHT, P_OUT_OPACITY, P_RING_BLUR, P_RING_OPACITY, P_RING_WIDTH,
    P_SHADOW_HEIGHT, P_SHADOW_INSET, P_SHADOW_OPACITY, P_SHADOW_RADIUS
} from "./params.js";

/**
 * @brief Shadow distance band and the Gaussian tail, without its geometric offset.
 * @internal
 */
export function shadowRange(out: Float64Array, o: number, height: number, offset: number, radius: number, opacity: number): void {
    let high = -offset, low = high - Math.abs(height);
    if (radius > 0) {
        const extent = radius * extentFactor(opacity);
        low = low > 0 ? 0 : low;
        if (extent >= high) high = extent + 0;
    }
    out[o] = low; out[o + 1] = high;
}

/**
 * @brief A ramp omits its constant first segment; an empty range returns false.
 * @internal
 */
export function rampRange(out: Float64Array, o: number, first: number, second: number, end: number, opacity0: number, opacity1: number): boolean {
    const f = Math.fround;
    first = f(first); second = f(second); end = f(end); opacity0 = f(opacity0); opacity1 = f(opacity1);
    const candidate = first < second && opacity0 === opacity1 ? second : first;
    const low = end <= candidate ? first : candidate;
    if (low >= end) return false;
    out[o] = low; out[o + 1] = f(end + 1); return true;
}

/**
 * @brief Refraction heights and its active outside transition.
 * @internal
 */
export function refractionRange(out: Float64Array, o: number, inside: number, outside: number, start: number, end: number, opacity: number): void {
    let low = -Math.max(Math.abs(inside), Math.abs(outside)), high = 0;
    if (Math.fround(opacity) !== 0 && start <= end) {
        const endpoint = end + 1;
        if (start < low) low = start;
        high = endpoint >= 0 ? endpoint : 0;
    }
    out[o] = low; out[o + 1] = high;
}

/**
 * @brief Bleed height, with Float endpoints of its transition.
 * @internal
 */
export function bleedRange(out: Float64Array, o: number, height: number, start: number, end: number): void {
    let low = -Math.abs(height), high = 0;
    start = Math.fround(start); end = Math.fround(end);
    if (start < end) {
        const endpoint = Math.fround(end + 1);
        if (start < low) low = start;
        high = endpoint >= 0 ? endpoint : 0;
    }
    out[o] = low; out[o + 1] = high;
}

/**
 * @brief Ring width plus blur radius; the vertical ring offset is a separate geometric input.
 * @internal
 */
export function ringRange(out: Float64Array, o: number, width: number, radius: number, opacity: number): void {
    const extent = radius > 0 ? extentFactor(opacity) * (radius + width) : 0;
    out[o] = -1; out[o + 1] = extent > 1 ? extent + 0 : 1;
}

const RANGE = new Float64Array(2);

/**
 * @brief Resolve the standard distance range; the caller selects eligible profiles.
 * @internal
 */
export function standardRange(out: Float32Array, o: number, p: Float64Array, scale: number): void {
    const activeFace = Math.fround(p[P_FACE_OPACITY] as number) !== 0;
    let low = activeFace ? -1 : 0, high = activeFace ? 1 : 0;
    if (Math.fround(p[P_SHADOW_OPACITY] as number) !== 0) {
        shadowRange(RANGE, 0, p[P_SHADOW_HEIGHT] as number, p[P_SHADOW_INSET] as number,
            p[P_SHADOW_RADIUS] as number, p[P_SHADOW_OPACITY] as number);
        if ((RANGE[0] as number) < low) low = RANGE[0] as number;
        if ((RANGE[1] as number) > high) high = RANGE[1] as number;
    }
    // The resolved standard vector has unit total blur opacity; radius is the
    // remaining activation input before the native optional ramp is evaluated.
    if (Math.fround(p[P_BLUR] as number) !== 0 && rampRange(RANGE, 0, p[P_BLUR_D0] as number, p[P_BLUR_D1] as number, p[P_BLUR_D3] as number,
        p[P_BLUR_OP0] as number, p[P_BLUR_OP1] as number)) {
        if ((RANGE[0] as number) < low) low = RANGE[0] as number;
        if ((RANGE[1] as number) > high) high = RANGE[1] as number;
    }
    const outer = (p[P_OUT_AMOUNT] as number) !== 0 && (p[P_OUT_HEIGHT] as number) !== 0 && Math.fround(p[P_OUT_OPACITY] as number) !== 0;
    if (((p[P_IN_AMOUNT] as number) !== 0 && (p[P_IN_HEIGHT] as number) !== 0) || outer) {
        refractionRange(RANGE, 0, p[P_IN_HEIGHT] as number, p[P_OUT_HEIGHT] as number,
            p[P_OUT_D0] as number, p[P_OUT_D1] as number, p[P_OUT_OPACITY] as number);
        if ((RANGE[0] as number) < low) low = RANGE[0] as number;
        if ((RANGE[1] as number) > high) high = RANGE[1] as number;
    }
    if (Math.fround(p[P_BLEED_OPACITY] as number) !== 0 && (p[P_BLEED_AMOUNT] as number) !== 0 && (p[P_BLEED_HEIGHT] as number) !== 0) {
        bleedRange(RANGE, 0, p[P_BLEED_HEIGHT] as number, p[P_BLEED_D0] as number, p[P_BLEED_D1] as number);
        if ((RANGE[0] as number) < low) low = RANGE[0] as number;
        if ((RANGE[1] as number) > high) high = RANGE[1] as number;
    }
    if (Math.fround(p[P_RING_OPACITY] as number) !== 0) {
        ringRange(RANGE, 0, p[P_RING_WIDTH] as number, p[P_RING_BLUR] as number, p[P_RING_OPACITY] as number);
        if ((RANGE[1] as number) > high) high = RANGE[1] as number;
    }
    const height = (p[P_DARK_HEIGHT] as number) / scale, offset = (p[P_DARK_OFFSET] as number) / scale;
    if (height > 0) {
        const lower = -height - offset - 1, upper = 1 - offset;
        if (lower < low) low = lower;
        if (upper > high) high = upper;
    }
    out[o] = low; out[o + 1] = high;
}
