// Shared std140 layout: block M has 60 vec4 rows per draw; block U has 5 rows per union member.
export const CORNER_CIRCULAR = 0;
export const CORNER_SMOOTH = 1;
export type CornerKind = 0 | 1;
/** Surroundings a built-in material is tuned for. */
export const SCHEME_DARK = 0;
export const SCHEME_LIGHT = 1;
export type Scheme = 0 | 1;
/** Row order of a backdrop texture: bottom row first (framebuffer renders) or top row first (DOM uploads). */
export const ROWS_BOTTOM_UP = 0;
export const ROWS_TOP_DOWN = 1;
export type RowOrder = 0 | 1;
/** How shapes over other shapes are drawn: every shape sees the backdrop only, or the glass below it as well. */
export const STACKING_FLAT = 0;
export const STACKING_EXACT = 1;
export type Stacking = 0 | 1;
/**
 * Surroundings that change the built-in materials, as bits: the window is not the active one, the more opaque
 * "tinted" setting, the reduce-transparency and increase-contrast accessibility settings (these three also stop small
 * glass from following the backdrop luminance), the reduce-motion setting and the button-shapes setting.
 */
export const ENV_INACTIVE = 1;
export const ENV_TINTED = 2;
export const ENV_REDUCE_TRANSPARENCY = 4;
export const ENV_INCREASE_CONTRAST = 8;
export const ENV_REDUCE_MOTION = 16;
export const ENV_BUTTON_SHAPES = 32;

// Feature bits in the glass-program key.
export const FEATURE_OUTER = 1;          // outer refraction band mixed in near the rim
export const FEATURE_FILL = 2;           // blur fill: the undisplaced backdrop at its own blur
export const FEATURE_FACE = 4;           // face colour matrix
export const FEATURE_LUMA = 8;           // maximum luminance before the face matrix
export const FEATURE_BLEED = 16;         // edge bleed
export const FEATURE_SHADOW = 32;        // drop shadow
export const FEATURE_SHADOW_SAMPLE = 64; // the shadow takes colour from the backdrop
export const FEATURE_RING = 128;         // ring shadow: blurred inner stroke of the shape moved down
export const FEATURE_EDGE = 256;         // edge shade: two lobes in a thin band at the rim, darken or lighten
export const FEATURE_HOLD = 512;         // standard-range holding tone
export const FEATURE_CLAMP = 1024;
export const FEATURE_CLAMP_HUE = 2048;
export const FEATURE_ABERRATION = 4096;  // colour fringes of the face lookup (seven taps)
export const FEATURE_LIGHTS = 8192;      // bright rim lights with their wide diffuse bands
export const FEATURE_RIM_SPLIT = 16384;  // the two lights through colour matrices of their own
export const FEATURE_RIM_HUE = 32768;
export const FEATURE_TINT = 65536;       // colour layer over the glass
export const FEATURE_LENS = 131072;      // lens layer: the backdrop with colour fringes over the glass
export const FEATURE_ROUND_NORMAL = 262144;
export const FEATURE_SHARP = 524288;
export const FEATURE_UNEVEN = 1048576;
export const FEATURE_FIELD = 2097152;
export const FEATURE_VEIL = 4194304;
export const FEATURE_FADE = 8388608;
export const FEATURE_BITS = 24;
// A union's member count sits above the feature bits.
export const MEMBER_SHIFT = 24;
export const MAX_MEMBERS = 16;

// Background rows. Lengths use points, with y up; blur radii are scaled by 1.6 in the shader.
export const ROW_BLUR = 0;          // face, shadow sample, bleed, blur fill radius
export const ROW_LENS = 1;          // inner A, inner 1/H, outer A, outer 1/H
export const ROW_KNOT = 2;          // blur distances d0 d1 d2 d3
export const ROW_SLOPE = 3;         // 1/(d1-d0) 1/(d2-d1) 1/(d3-d2), blur weight at d0
export const ROW_DROP = 4;          // weight drops w0-w1 w1-w2 w2-w3, outer opacity
export const ROW_MIX = 5;           // outer start, 1/span, roundness, face opacity
export const ROW_FACE = 6;          // 3 rows: r g b gains + constant
export const ROW_FACE_MORE = 9;     // luminance complement, blur fill lighten, darken, normal
export const ROW_BLEED_MATRIX = 10; // 3 rows
export const ROW_BLEED = 13;        // A, 1/H, start, 1/span
export const ROW_BLEED_MORE = 14;   // opacity, weight gain, weight offset, -
export const ROW_SHADOW = 15;       // offset x, y (y up), 1/radius, opacity
export const ROW_SHADOW_LENS = 16;  // A, 1/H, distance offset, backdrop share
export const ROW_SHADOW_MATRIX = 17;// 3 rows
export const ROW_SHADOW_MORE = 20;  // alpha without backdrop, -, -, -
export const ROW_RING = 21;         // offset x, y (y up), 1/blur, width/blur
export const ROW_RING_MORE = 22;    // opacity, mask, edge shade direction x, y
export const ROW_EDGE = 23;         // height, cos spread, strength k, offset
export const ROW_EDGE_MORE = 24;    // colour bias, stroke, extension, bias correction
export const ROW_HOLD = 25;         // weight, start, 1/span, white
export const ROW_CLAMP = 26;        // limit, -, fringe amount, fringe 1/H
export const ROW_FRINGE = 27;       // fringe offset, direction cos, sin, -
// Bright-rim rows.
export const ROW_RIM_KEY = 28;      // key direction x, y, height, cos spread
export const ROW_RIM_KEY_MORE = 29; // key k, diffuse height, diffuse cos spread, diffuse k
export const ROW_RIM_FILL = 30;     // fill height, cos spread, k, diffuse height
export const ROW_RIM_FILL_MORE = 31;// fill diffuse cos spread, diffuse k, curvature, offset
export const ROW_RIM_ALPHA = 32;    // key alpha, fill alpha, limit, -
export const ROW_RIM = 33;          // 4 rows: r g b a gains + constant (key light, or both)
export const ROW_RIM_FILL_MATRIX = 37; // 4 rows: the fill light's own matrix
export const ROW_EXTENT = 41;       // for the renderer: smallest lookup radius (points), blur fill on, -, -
export const ROW_TINT = 42;         // 4 rows: colour layer matrix
export const ROW_TINT_MORE = 46;    // limit, -, -, -
export const ROW_LENS_LAYER = 47;   // fringe amount, 1/H, inset, opacity
export const ROW_LENS_DIR = 48;     // direction cos, sin, fade start, 1/span
export const ROW_LENS_FADE = 49;    // opacity at start, at end, -, -
// Shape rows.
export const ROW_FRAME = 50;        // centre pt (y up), half extents pt
export const ROW_CORNER = 51;       // r, reach0, reach, base texels per point
export const ROW_ROUND = 52;        // kx, ky, hx/hy, top level
export const ROW_BOUNDS = 53;       // draw bounds px (y up)
export const ROW_REGION = 54;       // pyramid uv per px, uv offset
export const ROW_CLAMP_RECT = 55;   // pyramid uv rect of the region: lo, hi
export const ROW_TEXEL = 56;        // texel px, region aspect (width / height), union spacing, low level
export const ROW_RADII = 57;        // uneven: radii of +x+y, -x+y, -x-y, +x-y (y up) | field: uv per pt, uv at centre
export const ROW_EDGE_ROUND = 58;   // uneven: roundness of top, bottom, right, left edge
export const ROW_TOP = 59;          // veil grey level, veil strength, opacity
export const BLOCK_ROWS = 60;
/** Floats of the material rows (written by the material packers). */
export const MATERIAL_FLOATS = 200;
export const BLOCK_FLOATS = 240;
export const BLOCK_BYTES = 960;
// Union-member rows.
export const MEMBER_ROWS = 5;       // centre + half extents | r, reach0, reach, hx/hy | kx, ky, kind, field | radii or field uv | edges
export const UNION_ROWS = 80;
export const UNION_FLOATS = 320;
export const UNION_BYTES = 1280;
// Union-member kinds.
export const MEMBER_BOX = 0;
export const MEMBER_UNEVEN = 1;
export const MEMBER_FIELD = 2;
export const MAX_MEMBER_FIELDS = 4;

export const SMOOTH_REACH = 1.528665;
