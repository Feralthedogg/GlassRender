/**
 * @file precision.ts
 * @brief Numeric representations shared by CPU packing and GPU programs.
 * @details Shared typed-array views avoid allocations during conversion.
 */

const words = new Uint32Array(1), floats = new Float32Array(words.buffer);
const nativeHalf = (Math as Math & { f16round?: (x: number) => number }).f16round;

/** Opacity byte written by the native render-layer packet, represented as a half vertex weight. */
export function layerOpacity(value: number): number {
    const a = Math.fround(value);
    return half(Math.trunc(fma32(a < 0 ? 0 : a > 1 ? 1 : a, 255, .5)) / 255);
}

/**
 * @brief Round a number to binary16, with ties to even, and return its numeric value.
 * @internal
 */
export function half(x: number): number {
    if (nativeHalf !== undefined) return nativeHalf(Math.fround(x));
    return halfFallback(x);
}

/**
 * @brief Binary16 conversion for engines without Math.f16round.
 * @internal
 */
export function halfFallback(x: number): number {
    floats[0] = x;
    const w = words[0] as number, sign = w >>> 31, exponent = (w >>> 23) & 255, mantissa = w & 0x7fffff;
    if (exponent === 255) return mantissa === 0 ? sign === 0 ? Infinity : -Infinity : NaN;
    const e = exponent - 127;
    if (e > 15) return sign === 0 ? Infinity : -Infinity;
    if (e < -25) return sign === 0 ? 0 : -0;
    let value: number;
    if (e < -14) {
        const shift = -e - 1, significand = mantissa | 0x800000, unit = 2 ** shift;
        const q = Math.floor(significand / unit), rest = significand - q * unit;
        value = (q + (rest > unit * .5 || (rest === unit * .5 && (q & 1) !== 0) ? 1 : 0)) * 2 ** -24;
    } else {
        const q = mantissa >>> 13, rest = mantissa & 8191;
        const rounded = q + (rest > 4096 || (rest === 4096 && (q & 1) !== 0) ? 1 : 0);
        value = (1 + rounded / 1024) * 2 ** e;
        if (value > 65504) value = Infinity;
    }
    return sign === 0 ? value : -value;
}

/**
 * @brief A binary32 fused multiply/add, including double-rounding ties.
 * @internal
 */
export function fma32(a: number, b: number, c: number): number {
    a = Math.fround(a); b = Math.fround(b); c = Math.fround(c);
    const product = a * b, sum = product + c, rounded = Math.fround(sum);
    const error = Math.abs(product) >= Math.abs(c) ? (product - sum) + c : (c - sum) + product;
    if (error === 0 || !Number.isFinite(sum)) return rounded;
    if (!Number.isFinite(rounded)) {
        const boundary = (2 ** 128) - (2 ** 103);
        return Math.abs(sum) === boundary && Math.sign(error) !== Math.sign(sum) ? Math.sign(sum) * 3.4028234663852886e38 : rounded;
    }
    floats[0] = rounded;
    const direction = sum > rounded ? 1 : -1, bits = words[0] as number;
    words[0] = rounded === 0 ? (direction > 0 ? 1 : 0x80000001) : bits + (rounded > 0 ? direction : -direction);
    const adjacent = floats[0] as number;
    if (sum === rounded + (adjacent - rounded) * .5) return Math.sign(error) === direction ? adjacent : rounded;
    return rounded;
}

const doubleBits = new DataView(new ArrayBuffer(8));
function doubleParts(value: number): [bigint, number] {
    doubleBits.setFloat64(0, value, false);
    const bits = doubleBits.getBigUint64(0, false), exponent = Number((bits >> 52n) & 2047n);
    const significand = (bits & 0xfffffffffffffn) | (exponent === 0 ? 0n : 0x10000000000000n);
    return [(bits >> 63n) === 0n ? significand : -significand, exponent === 0 ? -1074 : exponent - 1075];
}
function roundedInteger(value: bigint, shift: number): bigint {
    if (shift <= 0) return value << BigInt(-shift);
    const n = BigInt(shift), q = value >> n, rest = value - (q << n), midpoint = 1n << (n - 1n);
    return q + (rest > midpoint || (rest === midpoint && (q & 1n) !== 0n) ? 1n : 0n);
}

/** Exact binary64 FMA for the CPU timing solver, outside the per-pixel shader path. */
export function fma64(a: number, b: number, c: number): number {
    if (Number.isNaN(a) || Number.isNaN(b) || Number.isNaN(c)) return NaN;
    if (!Number.isFinite(a) || !Number.isFinite(b)) return a * b + c;
    if (!Number.isFinite(c)) return c;
    if (a === 0 || b === 0) {
        if (c !== 0) return c;
        const negative = (a < 0 || Object.is(a, -0)) !== (b < 0 || Object.is(b, -0));
        return negative && Object.is(c, -0) ? -0 : 0;
    }
    if (c === 0) return a * b;
    const [ai, ae] = doubleParts(a), [bi, be] = doubleParts(b), [ci, ce] = doubleParts(c);
    const productExponent = ae + be, exponent = Math.min(productExponent, ce);
    let integer = (ai * bi << BigInt(productExponent - exponent)) + (ci << BigInt(ce - exponent));
    if (integer === 0n) return 0;
    const sign = integer < 0n ? 0x8000000000000000n : 0n;
    if (integer < 0n) integer = -integer;
    const length = integer.toString(2).length;
    let power = length - 1 + exponent, bits: bigint;
    if (power < -1022) bits = roundedInteger(integer, -1074 - exponent);
    else {
        let significand = roundedInteger(integer, length - 53);
        if (significand === 0x20000000000000n) { significand >>= 1n; power++; }
        if (power > 1023) return sign === 0n ? Infinity : -Infinity;
        bits = BigInt(power + 1023) << 52n | (significand & 0xfffffffffffffn);
    }
    doubleBits.setBigUint64(0, sign | bits, false);
    return doubleBits.getFloat64(0, false);
}
