/**
 * @file lanes.ts
 * @brief Typed-array lane layouts for renderer slots.
 * @details Each slot uses fixed offsets so frame traversal does not allocate per-shape objects.
 */

import { MAX_MEMBER_FIELDS, MEMBER_ROWS, SMOOTH_REACH } from "../layout.js";

// Geometry lanes per slot: x y w h radius corner | shadow spread, largest lookup radius, margin, backdrop scale, shadow offset.
// Union lanes: x y | radii tl tr br bl | spacing side least | veil level, veil strength, opacity.
export const G = 24;
// Region lanes per slot: page ax ay aw ah | pw ph levels | dirty | capture texels ix0 iy0 ix1 iy1 | grid placed.
export const R = 16;
// Capture lanes per slot: capture origin px (y up), texel px, - | position of the region's first texel in the capture
// (texels), capture size (texels).
export const C = 8;
// Bounds lanes per slot (px, y up): draw rect | read rect (captured backdrop and the body, whose edge blends by hand).
export const B = 8;
// Animation lanes per slot: level, level velocity, mix, mix velocity, target level, target mix, -, - |
// presence, presence velocity, target presence.
export const A = 12;
// A handle stores the slot in its low 20 bits and the slot generation above them.
export const SLOT_MASK = 0xfffff, GEN_SHIFT = 20, GEN_MASK = 0x7ff;
// Distance beyond its frame where a shape starts when it appears, in points.
export const GROW = 8;
// Member lanes: x y w h radius corner | kind, field index | radii tl tr br bl.
export const MB = 12;
// Union-block floats per member.
export const MF = MEMBER_ROWS * 4;
// Mask members of a union: field storage index is slot * MMF + field index.
export const MMF = MAX_MEMBER_FIELDS;
// Field lanes per slot: wanted size, built size, mask size, and the encoding range as Float bits.
export const F = 8;
export const FIELD_RANGE = new Float32Array(2), FIELD_BITS = new Int32Array(FIELD_RANGE.buffer);
export const MAXL = 12;
export const MAXP = 8;
export const INST = 12;
// Material kinds: 0 free; a preset (its number in the presets lane) for dark or light surroundings, or a description.
export const MATERIAL_DARK = 1, MATERIAL_LIGHT = 2;
export const GEOM_BOX = 0, GEOM_UNEVEN = 1, GEOM_UNION = 2, GEOM_FIELD = 3;
export const ADAPT_OFF = 0, ADAPT_FIRST = 1, ADAPT_LIVE = 2;
export const FLAG_READS = 1, FLAG_READ = 2;
// Critically damped spring for adaptive tone: angular frequency for a 0.5-second response.
export const OMEGA = 12.566370614359172;
// Drawing-buffer formats.
export const RGBA8 = 0x8058, RGBA16F = 0x881a;
export const DRAW_BOTH = [0x8ce0, 0x8ce1];

// Roundness of an edge with half-length h whose corners have mean radius r.
export function edge(h: number, r: number, smooth: boolean): number {
    if (!smooth || r <= 0) return 1;
    const k = (SMOOTH_REACH - h / r) / (SMOOTH_REACH - 1);
    return k < 0 ? 0 : k > 1 ? 1 : k;
}
