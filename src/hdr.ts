/**
 * @file hdr.ts
 * @brief Surface and context scales for extended-range output.
 * @details Context scaling remains separate from the material's display-headroom share.
 */

import { half } from "./precision.js";
import { err, ok, type Result } from "./result.js";

/**
 * @brief Host-supplied display brightness state; brightness values use the same units.
 * @details These are current values, not a browser capability query. Bounds and brightness
 * arithmetic are resolved in Float32 before the material's separate headroom share is selected.
 */
export interface DisplayBrightness {
    readonly panelMax: number;
    readonly brightnessCap: number;
    readonly sdrBrightness: number;
    /** @brief Lower headroom bound (default 1). */
    readonly minHeadroom?: number;
    readonly maxHeadroom: number;
    /** @brief Requested multiplier; omission selects the available headroom. */
    readonly requestedHeadroom?: number;
}

/**
 * @brief Resolve available or requested headroom from explicit display brightness values.
 * @details Uses the verified CBEDR sanity, available and capped arithmetic. Physical state
 * discovery, modulators and ramp scheduling remain the host's responsibility.
 */
export function resolveDisplayHeadroom(state: DisplayBrightness): Result<number> {
    if (state === null || typeof state !== "object") return err("display brightness state required");
    const { panelMax, brightnessCap, sdrBrightness, minHeadroom, maxHeadroom, requestedHeadroom: requested } = state;
    const f = Math.fround, minimum = minHeadroom ?? 1;
    const supplied = [panelMax, brightnessCap, sdrBrightness, minimum, maxHeadroom];
    if (supplied.some(value => !Number.isFinite(value) || !Number.isFinite(f(value)) || value < 0)
        || f(minimum) < 1 || f(maxHeadroom) < f(minimum)) {
        return err("nonnegative finite Float32 brightness and headroom bounds of at least 1 required");
    }
    if (requested !== undefined && (!Number.isFinite(requested) || !Number.isFinite(f(requested)) || requested < 0)) {
        return err("nonnegative finite Float32 requested headroom required");
    }
    const lo = f(minimum), hi = f(maxHeadroom), panel = f(panelMax);
    const peak = Math.min(f(brightnessCap), panel), sdr = Math.min(f(sdrBrightness), panel);
    const clamp = (value: number): number => Math.min(hi, Math.max(lo, value));
    let value = requested === undefined ? (sdr > 0 ? f(peak / sdr) : 1) : clamp(f(requested));
    if (requested !== undefined && sdr > 0 && peak < f(value * sdr)) value = f(peak / sdr);
    return ok(clamp(value));
}

const MINIMUM = 9.999999974752427e-7;
/** @brief Resolve supplied display headroom without guessing a device capability. @internal */
export function displayHeadroom(value: number | undefined, fallback = 1): number {
    const v = Math.fround(value ?? fallback);
    return Number.isFinite(v) && v >= 1 ? v : fallback;
}
/**
 * @brief Half coefficients for context scaling; identity scales preserve the defaults.
 * @internal
 */
export function hdrScale(out: Float32Array, o: number, scale: number, gamma = 2.2): void {
    const f = Math.fround, s = Number.isNaN(scale) ? MINIMUM : Math.max(f(scale), MINIMUM), exponent = f(1 / f(gamma));
    out[o] = half(f(Math.pow(s, exponent))); out[o + 1] = half(f(Math.pow(f(1 / s), exponent)));
}

/**
 * @brief Stored surface factor: zero means the default, while negative and above-one values are
 * bounded.
 * @internal
 */
export function surfaceFactor(value: number): number {
    const v = Math.fround(value);
    return v === 0 ? 1 : v < 0 ? 0 : v > 1 ? 1 : v;
}

/**
 * @brief Enable scaling only when Float32 coefficients differ from identity.
 * @internal
 */
export function hdrScaleEnabled(kind: number, present: boolean, factor: number, scale: number): boolean {
    return kind === 0 && present && Math.fround(factor) !== 0 && Math.fround(factor) !== 1 && Math.fround(scale) !== 1;
}

/**
 * @brief EDR resolve factor, including the selected state exposure.
 * @internal
 */
export function edrFactor(surface: number, state: number, active: boolean, gamma = 2.2): number {
    const f = Math.fround, product = f(f(surface) * (active ? f(state) : 1));
    return half(f(Math.pow(product, f(1 / f(gamma)))));
}

/** Native vibrant filter clamp, encoded for the current nonlinear context. @internal */
export function vibrantClamp(value: number, gamma = 2.2): number {
    const f = Math.fround;
    return half(f(Math.pow(f(value), f(1 / f(gamma)))));
}

const CHECK = new Float32Array(2);
/**
 * @brief A public surface configuration must not introduce infinite shader coefficients.
 * @internal
 */
export function hdrScaleFits(scale: number): boolean {
    const value = Math.fround(scale);
    if (!Number.isFinite(value) || value <= 0) return false;
    hdrScale(CHECK, 0, scale);
    return Number.isFinite(CHECK[0]) && Number.isFinite(CHECK[1]);
}
