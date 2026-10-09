/**
 * @file preset.ts
 * @brief Material resolution by size, scheme, presence and surroundings.
 * @details Piecewise-linear size knots preserve duplicate-x steps; packing reuses storage.
 */

import {
    ENV_BUTTON_SHAPES, ENV_INACTIVE, ENV_INCREASE_CONTRAST, ENV_REDUCE_MOTION, ENV_REDUCE_TRANSPARENCY, ENV_TINTED, SCHEME_DARK,
    type Scheme
} from "./layout.js";
import { ADAPTIVE_SIDE, adapts, clearVector, type MaterialSpec, packParams, specOf, VECTOR } from "./material.js";
import { P_COUNT, P_NEAR } from "./params.js";
import { standardRange } from "./sdf.js";
import {
    KNOT_X, KNOT_Y, LAW_AT, PARAM_COUNT, PRESET_COUNT, PRESET_FLAGS, PRESET_NAMES, PRESET_SIDE, ROW_ESTIMATE, ROW_OF, ROWS, SCENARIO_COUNT
} from "./presets.js";

// Numeric identifiers follow PRESET_NAMES order.
export const PRESET_STANDARD = 0;
export const PRESET_CLEAR = 1;
/** @brief Glass with no effect at all (the backdrop as it is). */
export const PRESET_IDENTITY = 2;
export const PRESET_MENU = 3;
export const PRESET_NOTIFICATION = 4;
export const PRESET_POPOVER = 5;
export const PRESET_SIDEBAR = 6;
export const PRESET_ATTACHED_SIDEBAR = 7;
export const PRESET_INSPECTOR = 8;
export const PRESET_DOCK = 9;
export const PRESET_CONTROL_PANEL = 10;
export const PRESET_KEYBOARD = 11;
export const PRESET_WIDGET = 12;
export const PRESET_ICON = 13;
export const PRESET_PLAYER = 14;
export const PRESET_CALL = 15;
export const PRESET_CAMERA = 16;
export const PRESET_CONTROL = 17;
export const PRESET_LOUPE = 18;
export const PRESET_SLIDER = 19;
export const PRESET_MONOGRAM = 20;
export const PRESET_BUBBLE = 21;
export const PRESET_TEXT = 22;
export const PRESET_ASSISTANT = 23;
export const PRESET_ASSISTANT_CARD = 24;
export const PRESET_FOCUS_RING = 25;
export const PRESET_FOCUS_BACKGROUND = 26;
export const PRESET_VEHICLE = 27;
export { PRESET_COUNT, PRESET_NAMES };

// Reused vectors for dark, light, and blended rows.
const VD = new Float64Array(VECTOR), VL = new Float64Array(VECTOR), VM = new Float64Array(VECTOR);
// Cache immutable numeric packets by context; direct mapping keeps lookup cost constant.
const CACHE_COUNT = 128, CACHE_KEY = 8, CACHE_PACKET = 180;
const packetKeys = new Float64Array(CACHE_COUNT * CACHE_KEY), packetData = new Float32Array(CACHE_COUNT * CACHE_PACKET);
const packetInfo = new Float32Array(CACHE_COUNT * 6), packetFlags = new Int32Array(CACHE_COUNT), packetValid = new Uint8Array(CACHE_COUNT);
const packetHead = Array.from({ length: CACHE_COUNT }, (_, i) => packetData.subarray(i * CACHE_PACKET, i * CACHE_PACKET + 168));
const packetTail = Array.from({ length: CACHE_COUNT }, (_, i) => packetData.subarray(i * CACHE_PACKET + 168, (i + 1) * CACHE_PACKET));
const packetAux = Array.from({ length: CACHE_COUNT }, (_, i) => packetInfo.subarray(i * 6, (i + 1) * 6));
// Reuse distance-range scratch on cache hits; other profiles retain a conservative range.
export const PRESET_RANGE = new Float32Array(2);
const packetRanges = new Float32Array(CACHE_COUNT * 2);

function law(i: number, x: number): number {
    const a = LAW_AT[i] as number, n = (LAW_AT[i + 1] as number) - a;
    if (n === 1) return KNOT_Y[a] as number;
    let k = a;
    const last = a + n - 2;
    while (k < last && (KNOT_X[k + 1] as number) < x) k++;
    const x0 = KNOT_X[k] as number, y0 = KNOT_Y[k] as number, x1 = KNOT_X[k + 1] as number, y1 = KNOT_Y[k + 1] as number;
    return x1 === x0 ? (x <= x0 ? y0 : y1) : y0 + (y1 - y0) * (x - x0) / (x1 - x0);
}

/**
 * @brief Resolve environment flags to a supported preset-table row.
 * @details Rows cover default, inactive, contrast, reduced transparency, reduced motion, combined
 * accessibility, inactive with contrast, tinted and button outlines. Other combinations select
 * their strongest supported setting.
 */
export function surroundings(environment: number): number {
    const rt = (environment & ENV_REDUCE_TRANSPARENCY) !== 0, ic = (environment & ENV_INCREASE_CONTRAST) !== 0;
    const ia = (environment & ENV_INACTIVE) !== 0;
    if (rt && ic) return 5;
    if (ia && ic) return 6;
    if (rt) return 3;
    if (ic) return 2;
    if (ia) return 1;
    if ((environment & ENV_REDUCE_MOTION) !== 0) return 4;
    if ((environment & ENV_TINTED) !== 0) return 7;
    if ((environment & ENV_BUTTON_SHAPES) !== 0) return 8;
    return 0;
}

/**
 * @brief The material vector of a preset row.
 * @param p Receives `VECTOR` values.
 * @param preset Preset number.
 * @param scheme 0 dark, 1 light.
 * @param environment `ENV_*` bits.
 * @param least Short side of the smallest member (points).
 * @param side Short side of the largest member (points).
 * @returns The table row (whose backdrop scale may come from the blur, see `packPreset`).
 */
export function presetVector(p: Float64Array, preset: number, scheme: number, environment: number, least: number, side: number): number {
    const P = preset > 0 && preset < PRESET_COUNT ? preset | 0 : 0, fixed = PRESET_SIDE[P] as number;
    const L = fixed > 0 ? fixed : side > 0 ? side : 0, n = fixed > 0 ? fixed : least > 0 ? least : 0;
    const row = ROW_OF[(P * 2 + (scheme === SCHEME_DARK ? 0 : 1)) * SCENARIO_COUNT + surroundings(environment)] as number;
    const base = row * PARAM_COUNT;
    clearVector(p);
    for (let i = 0; i < P_COUNT; i++) {
        const near = ((P_NEAR[i >> 5] as number) >>> (i & 31) & 1) !== 0;
        p[i] = law(ROWS[base + i] as number, near ? n : L);
    }
    return row;
}

/** @brief Number of the preset with a name of `PRESET_NAMES`, or -1. */
export function presetNumber(name: string): number {
    for (let i = 0; i < PRESET_COUNT; i++) if (PRESET_NAMES[i] === name) return i;
    return -1;
}

/**
 * @brief The short side a preset is always evaluated at, or 0 when it follows the short side of the
 * shape.
 * @details The dock is drawn at the largest size class (160) whatever the height of its bar.
 */
export function presetSide(preset: number): number {
    return preset >= 0 && preset < PRESET_COUNT ? PRESET_SIDE[preset | 0] as number : 0;
}

/**
 * @brief Check whether a preset is eligible for backdrop luminance adaptation.
 * @details Tinted, reduced-transparency and increased-contrast settings keep the selected scheme
 * fixed, including for otherwise eligible small glass.
 */
export function presetFollows(preset: number, environment: number): boolean {
    return preset >= 0 && preset < PRESET_COUNT && ((PRESET_FLAGS[preset | 0] as number) & 1) !== 0 && adapts(environment)
        && (PRESET_SIDE[preset | 0] as number) <= ADAPTIVE_SIDE;
}

/**
 * @brief Pack a preset for the current size, scheme, presence, and surroundings.
 * @details At `mix` 0 or 1 with presence 1, the result matches packing the corresponding
 * `presetMaterial` on a 2× screen. On other screens, rows whose blur determines the backdrop scale
 * use the scale estimated for that screen.
 * @param d Block storage; the material rows (`MATERIAL_FLOATS` at `o`, without the color layer) are
 * written.
 * @param o Float offset of the block.
 * @param info Receives six values at `io` (see `packParams`).
 * @param io Float offset into `info`.
 * @param preset Preset number (`PRESET_*`).
 * @param side Short side of the shape in points (of the largest member for a union).
 * @param least Smallest short side in points (equal to `side` for a single shape).
 * @param mix Scheme: 0 dark, 1 light; values between blend the two (transitions of adaptive glass).
 * @param presence 1 for the material itself; below 1 it is blended in from plain glass, as
 * `packMaterial` does.
 * @param environment `ENV_*` bits.
 * @param headroom Extended-range share in [0, 1].
 * @param scale Device pixels per point.
 * @returns Feature bits of the packed material.
 */
export function packPreset(d: Float32Array, o: number, info: Float32Array, io: number, preset: number, side: number, least: number,
    mix: number, presence: number, environment = 0, headroom = 0, scale = 2): number {
    const P = preset > 0 && preset < PRESET_COUNT ? preset | 0 : 0, m = mix < 0 ? 0 : mix > 1 ? 1 : mix;
    // Shared, overlapping outputs must keep packParams' write order and cannot become an immutable packet.
    const overlap = d.buffer === info.buffer && info.byteOffset + io * 4 < d.byteOffset + (o + 200) * 4
        && d.byteOffset + o * 4 < info.byteOffset + (io + 6) * 4;
    const index = ((P * 31) ^ (side * 16) ^ (least * 7) ^ (m * 127) ^ (presence * 113) ^ (environment * 8191)
        ^ (headroom * 47) ^ (scale * 4093)) & (CACHE_COUNT - 1), at = index * CACHE_KEY;
    if (!overlap && packetValid[index] !== 0 && Object.is(packetKeys[at], P) && Object.is(packetKeys[at + 1], side)
        && Object.is(packetKeys[at + 2], least) && Object.is(packetKeys[at + 3], m) && Object.is(packetKeys[at + 4], presence)
        && Object.is(packetKeys[at + 5], environment) && Object.is(packetKeys[at + 6], headroom) && Object.is(packetKeys[at + 7], scale)) {
        d.set(packetHead[index] as Float32Array, o); d.set(packetTail[index] as Float32Array, o + 188);
        PRESET_RANGE[0] = packetRanges[index * 2] as number; PRESET_RANGE[1] = packetRanges[index * 2 + 1] as number;
        info.set(packetAux[index] as Float32Array, io); return packetFlags[index] as number;
    }
    let v = VD, est = 0;
    if (m <= 0) est = ROW_ESTIMATE[presetVector(VD, P, 0, environment, least, side)] as number;
    else if (m >= 1) { est = ROW_ESTIMATE[presetVector(VL, P, 1, environment, least, side)] as number; v = VL; }
    else {
        est = (ROW_ESTIMATE[presetVector(VD, P, 0, environment, least, side)] as number)
            & (ROW_ESTIMATE[presetVector(VL, P, 1, environment, least, side)] as number);
        for (let i = 0; i < VECTOR; i++) { const a = VD[i] as number; VM[i] = a + ((VL[i] as number) - a) * m; }
        v = VM;
    }
    // Rows whose blur determines the backdrop scale use the screen-specific estimate; other rows keep their scale.
    const flags = packParams(d, o, info, io, v, presence, headroom, scale, est !== 0);
    if (environment === 0 && (m === 0 || m === 1) && presence === 1 && headroom === 0 && scale === 2) {
        if (P === PRESET_STANDARD) standardRange(PRESET_RANGE, 0, v, scale);
        else if (P === PRESET_CLEAR) { PRESET_RANGE[0] = -0.5 * least; PRESET_RANGE[1] = 8; }
        else { PRESET_RANGE[0] = -Infinity; PRESET_RANGE[1] = Infinity; }
    } else { PRESET_RANGE[0] = -Infinity; PRESET_RANGE[1] = Infinity; }
    if (overlap) return flags;
    packetKeys[at] = P; packetKeys[at + 1] = side; packetKeys[at + 2] = least; packetKeys[at + 3] = m;
    packetKeys[at + 4] = presence; packetKeys[at + 5] = environment; packetKeys[at + 6] = headroom; packetKeys[at + 7] = scale;
    const q = index * CACHE_PACKET;
    for (let i = 0; i < 168; i++) packetData[q + i] = d[o + i] as number;
    for (let i = 0; i < 12; i++) packetData[q + 168 + i] = d[o + 188 + i] as number;
    for (let i = 0; i < 6; i++) packetInfo[index * 6 + i] = info[io + i] as number;
    packetRanges[index * 2] = PRESET_RANGE[0] as number; packetRanges[index * 2 + 1] = PRESET_RANGE[1] as number;
    packetFlags[index] = flags; packetValid[index] = 1;
    return flags;
}

/**
 * @brief A preset as a description, a numerical snapshot of the built-in profile.
 * @details It keeps the scheme of its surroundings: a description does not follow the backdrop
 * luminance.
 * @param preset Preset number (`PRESET_*`, or `presetNumber(name)`).
 * @param side Short side of the shape in points (a preset with a size class of its own, see
 * `presetSide`, ignores it).
 * @param scheme Dark or light surroundings.
 * @param environment `ENV_*` bits of the surroundings (default none).
 * @param headroom Extended-range share in [0, 1] (default 0, standard dynamic range).
 * @param least Smallest short side of a union in points (default `side`).
 */
export function presetMaterial(preset: number, side: number, scheme: Scheme, environment = 0, headroom = 0, least = side): MaterialSpec {
    const p = new Float64Array(VECTOR);
    presetVector(p, preset, scheme, environment, least, side);
    const sp = specOf(p) as MaterialSpec & { headroom?: number };
    return { ...sp, headroom: headroom > 0 ? (headroom < 1 ? headroom : 1) : 0 };
}

/**
 * @brief The standard material as a description (`presetMaterial(PRESET_STANDARD, ...)`), a
 * numerical snapshot of the built-in profile.
 */
export function standardMaterial(side: number, scheme: Scheme, environment = 0, headroom = 0): MaterialSpec {
    return presetMaterial(PRESET_STANDARD, side, scheme, environment, headroom);
}

/** @brief The clear material as a description (`presetMaterial(PRESET_CLEAR, ...)`). */
export function clearMaterial(side: number, scheme: Scheme, environment = 0, headroom = 0): MaterialSpec {
    return presetMaterial(PRESET_CLEAR, side, scheme, environment, headroom);
}
