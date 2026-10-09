/**
 * @file material.ts
 * @brief Material vectors and GPU block packing.
 * @details Packers write into caller-owned storage without allocating per shape.
 */

import {
    ENV_INCREASE_CONTRAST, ENV_REDUCE_TRANSPARENCY, ENV_TINTED, FEATURE_ABERRATION, FEATURE_BLEED, FEATURE_CLAMP, FEATURE_CLAMP_HUE,
    FEATURE_EDGE, FEATURE_FACE, FEATURE_FILL, FEATURE_HOLD, FEATURE_LENS, FEATURE_LIGHTS, FEATURE_LUMA, FEATURE_OUTER,
    FEATURE_RIM_SPLIT, FEATURE_RING, FEATURE_ROUND_NORMAL, FEATURE_SHADOW, FEATURE_SHADOW_SAMPLE, FEATURE_TINT, SCHEME_DARK,
    type Scheme
} from "./layout.js";
import {
    P_BLEED_AMOUNT, P_BLEED_BLACK, P_BLEED_BLUR, P_BLEED_D0, P_BLEED_D1, P_BLEED_DARKEN, P_BLEED_HEIGHT, P_BLEED_OPACITY, P_BLEED_SAT,
    P_BLEED_WHITE, P_BLUR, P_BLUR_D0, P_BLUR_D1, P_BLUR_D2, P_BLUR_D3, P_BLUR_OP0, P_BLUR_OP1, P_BLUR_OP2, P_BLUR_OP3, P_COUNT,
    P_DARK_AMOUNT, P_DARK_ANGLE, P_DARK_BIAS, P_DARK_HEIGHT, P_DARK_OFFSET, P_DARK_SPREAD, P_DARK_SPREAD_SDR, P_DIFFUSE_AMOUNT,
    P_DIFFUSE_HEIGHT, P_DIFFUSE_SPREAD, P_FACE_BLACK, P_FACE_FILL_A, P_FACE_FILL_B, P_FACE_FILL_G, P_FACE_FILL_R, P_FACE_LUMA,
    P_FACE_LUMA_SDR, P_FACE_OPACITY, P_FACE_SAT, P_FACE_WHITE, P_FILL_AMOUNT, P_FILL_BLACK, P_FILL_BLUR, P_FILL_CURVATURE,
    P_FILL_DARKEN, P_FILL_DODGE_A, P_FILL_DODGE_B, P_FILL_DODGE_G, P_FILL_DODGE_R, P_FILL_FILL_A, P_FILL_FILL_B, P_FILL_FILL_G,
    P_FILL_FILL_R, P_FILL_HEIGHT, P_FILL_LIGHTEN, P_FILL_NORMAL, P_FILL_OPACITY, P_FILL_SAT, P_FILL_SPREAD, P_FILL_WHITE, P_IN_AMOUNT,
    P_IN_HEIGHT, P_KEY_AMOUNT, P_KEY_BLACK, P_KEY_CURVATURE, P_KEY_DODGE_A, P_KEY_DODGE_B, P_KEY_DODGE_G, P_KEY_DODGE_R, P_KEY_FILL_A,
    P_KEY_FILL_B, P_KEY_FILL_G, P_KEY_FILL_R, P_KEY_HEIGHT, P_KEY_OFFSET, P_KEY_OPACITY, P_KEY_SAT, P_KEY_SPREAD, P_KEY_WHITE,
    P_LENS_AMOUNT, P_LENS_ANGLE, P_LENS_D0, P_LENS_D1, P_LENS_HEIGHT, P_LENS_INSET, P_LENS_OP0, P_LENS_OP1, P_MARGIN, P_OUT_AMOUNT,
    P_OUT_D0, P_OUT_D1, P_OUT_HEIGHT, P_OUT_OPACITY, P_RIM_INSET, P_RING_BLUR, P_RING_MASK, P_RING_OFFSET, P_RING_OPACITY,
    P_RING_WIDTH, P_SCALE, P_SHADOW_AMOUNT, P_SHADOW_BLACK, P_SHADOW_BLUR, P_SHADOW_FILL_A, P_SHADOW_FILL_B, P_SHADOW_FILL_G,
    P_SHADOW_FILL_R, P_SHADOW_HEIGHT, P_SHADOW_INSET, P_SHADOW_OPACITY, P_SHADOW_RADIUS, P_SHADOW_SAT, P_SHADOW_VIBRANCY,
    P_SHADOW_WHITE, P_SHADOW_X, P_SHADOW_Y
} from "./params.js";
import { rawMaterialIssue } from "./material-check.js";
import { composite32, vibrant32 } from "./colour.js";
import { half, fma32 } from "./precision.js";

/** @brief Straight-alpha color, channels in encoded (gamma-space) 0..1. */
export type Rgba = readonly [number, number, number, number];
/** @brief Opaque color, channels in encoded (gamma-space) 0..1. */
export type Rgb = readonly [number, number, number];

/** @brief Displacement of a backdrop lookup that grows towards the rim. */
export interface LensSpec {
    /**
     * @brief Displacement at the rim in points; negative reads from further inside (magnifies).
     */
    readonly amount: number;
    /**
     * @brief Depth inside the rim over which the displacement falls to zero, in points; 0 keeps the
     * lookup in place.
     */
    readonly height: number;
}

/**
 * @brief Luminance remap, chroma gain and a fill color laid over the result (a color matrix).
 */
export interface ToneSpec {
    /** @brief Output level for luminance 1 (default 1). */
    readonly white?: number;
    /** @brief Output level for luminance 0 (default 0). */
    readonly black?: number;
    /** @brief Chroma gain; 1 keeps the saturation (default 1). */
    readonly saturation?: number;
    /** @brief Color laid over the remapped color with its alpha. */
    readonly fill?: Rgba;
}

/** @brief Backdrop blur that changes with the distance from the rim. */
export interface BlurSpec {
    /** @brief Blur radius in points (twice the radius the lookup uses). */
    readonly radius: number;
    /** @brief Blur weights at the four distances (default 1 1 1 1). */
    readonly opacities?: readonly number[];
    /**
     * @brief Four non-decreasing distances in points, negative inside (default 0 0 0 0).
     * @details The weights hold beyond the ends.
     */
    readonly distances?: readonly number[];
}

/** @brief Second, undisplaced backdrop lookup at a blur of its own, blended into the face. */
export interface BlurFillSpec {
    /** @brief Blur radius in points (twice the radius the lookup uses). */
    readonly radius: number;
    /** @brief Share of the darker of face and fill, 0..1. */
    readonly darken?: number;
    /** @brief Share of the lighter of face and fill, 0..1. */
    readonly lighten?: number;
    /** @brief Mix towards the fill itself, 0..1. */
    readonly normal?: number;
}

/** @brief Refraction across the body and the band mixed in at the rim. */
export interface RefractionSpec {
    readonly inner?: LensSpec;
    readonly outer?: LensSpec;
    /** @brief Opacity of the outer refraction over the inner one, 0..1. */
    readonly outerOpacity?: number;
    /**
     * @brief Distances where the outer refraction starts and is fully shown (default -1, 0).
     */
    readonly outerDistances?: readonly number[];
}

/** @brief Face color: maximum luminance, then the color matrix. */
export interface FaceSpec extends ToneSpec {
    /** @brief Mix of the matrix result over the plain lookup, 0..1 (default 1). */
    readonly opacity?: number;
    /**
     * @brief Luminance that white is brought down to before the matrix, 0..1 (default 1: none), at
     * full extended range.
     */
    readonly maxLuminance?: number;
    /** @brief The same in standard dynamic range (default `maxLuminance`). */
    readonly maxLuminanceStandard?: number;
}

/** @brief Wide-blur color bled in from the rim, weighted by the luminance of the face. */
export interface BleedSpec extends ToneSpec {
    /** @brief Strength, 0..1; 0 disables it. */
    readonly opacity: number;
    /** @brief Lens of the lookup: displacement and depth in points. */
    readonly amount: number;
    readonly height: number;
    /** @brief Blur radius in points (twice the radius the lookup uses). */
    readonly radius: number;
    /** @brief Distances where the weight is 0 and 1 (default 1, 0). */
    readonly distances?: readonly number[];
    /**
     * @brief Weight by the luminance of the face (true: bright areas) instead of its inverse
     * (default false).
     */
    readonly darken?: boolean;
}

/** @brief Soft shadow of the shape moved by an offset; its color can come from the backdrop. */
export interface ShadowSpec extends ToneSpec {
    /** @brief Peak alpha, 0..1; 0 disables it. */
    readonly opacity: number;
    /** @brief Falloff radius in points; the shadow reaches twice this beyond its outline. */
    readonly radius: number;
    /** @brief Offset in points, y down (default 0, 0). */
    readonly offsetX?: number;
    readonly offsetY?: number;
    /**
     * @brief Lens of the backdrop lookup (default none) and the distance added before it is
     * evaluated.
     */
    readonly amount?: number;
    readonly height?: number;
    readonly inset?: number;
    /**
     * @brief Blur radius of the backdrop lookup in points (twice the radius the lookup uses).
     */
    readonly blur?: number;
    /** @brief Share of the color taken from the backdrop, 0..1 (default 0: the fill only). */
    readonly backdropMix?: number;
}

/** @brief Blurred stroke just inside the shape moved down, laid over the glass in black. */
export interface RingShadowSpec {
    readonly opacity: number;
    /** @brief Blur radius in points. */
    readonly radius: number;
    /** @brief Stroke width in points. */
    readonly width: number;
    /** @brief Downward offset in points. */
    readonly offset: number;
    /** @brief 1 keeps it inside the shape (default 1). */
    readonly mask?: number;
}

/**
 * @brief Thin band at the rim that darkens (negative bias) or lightens the glass, in two opposite
 * lobes.
 */
export interface EdgeShadeSpec {
    /** @brief Brightness bias in (0, 1); 0.5 is linear. */
    readonly amount: number;
    /**
     * @brief Direction of the lobes in radians: 0 points up, positive turns clockwise (default
     * pi/2).
     */
    readonly angle?: number;
    /** @brief Color bias: c (1 + bias h (3 - 2 c)). */
    readonly bias: number;
    /**
     * @brief Band height and offset in device pixels; an offset of minus the height draws a stroke
     * along the outline.
     */
    readonly height: number;
    readonly offset?: number;
    /**
     * @brief Half width of each lobe in radians, at full extended range and in standard range
     * (default the same).
     */
    readonly spread: number;
    readonly spreadStandard?: number;
}

/** @brief One bright rim light and the color matrix the glass under it is drawn through. */
export interface LightSpec extends ToneSpec {
    /** @brief Light alpha (default 1). */
    readonly opacity?: number;
    /** @brief Brightness bias in (0, 1); 0.5 is linear (default 0.5). */
    readonly amount?: number;
    /** @brief Width of the lit band inside the rim, in points. */
    readonly height: number;
    /** @brief Half width of the lit arc in radians. */
    readonly spread: number;
    /** @brief 0 keeps a flat band, 1 fades it linearly across its width (default 0). */
    readonly curvature?: number;
    /** @brief Color dodge fill of the matrix. */
    readonly dodge?: Rgba;
}

/** @brief Two rim lights: the key at its angle and the fill opposite to it. */
export interface RimSpec {
    readonly key: LightSpec;
    readonly fill: LightSpec;
    /**
     * @brief Direction of the key light in radians: 0 points up, positive turns clockwise (default
     * 0).
     */
    readonly angle?: number;
    /**
     * @brief Wide band of each light: its height, spread and amount times these (default none).
     */
    readonly diffuse?: { readonly amount: number; readonly height: number; readonly spread: number };
    /** @brief Added to the distance before the bands are evaluated, in points (default 0). */
    readonly inset?: number;
}

/**
 * @brief Color fringes of the face lookup: red pulled outward, blue inward, along the normal turned
 * by the angle.
 */
export interface AberrationSpec {
    /** @brief Separation at the rim in points. */
    readonly amount: number;
    readonly angle?: number;
    /** @brief Depth over which it falls to zero, in points (default 0: a constant band). */
    readonly height?: number;
    /** @brief Depth of the band at full separation, in points (default 0). */
    readonly offset?: number;
}

/**
 * @brief Lens layer over the glass: the unblurred backdrop with color fringes, faded towards the
 * rim.
 */
export interface LensLayerSpec {
    /** @brief Separation of the colors in points. */
    readonly amount: number;
    readonly angle?: number;
    /**
     * @brief Depth over which the separation falls to zero beyond the inset (default 0: constant
     * inside the inset).
     */
    readonly height?: number;
    /** @brief Depth of the band at full separation, in points. */
    readonly inset?: number;
    /**
     * @brief Two distances and the opacities at them; linear between, held beyond (default -1 0 / 1
     * 0).
     */
    readonly distances?: readonly number[];
    readonly opacities?: readonly number[];
}

/** @brief Color held just inside the rim in standard range. */
export interface HoldSpec {
    readonly start: number;
    readonly end: number;
    readonly white: number;
}

/**
 * @brief Full material description.
 * @details Distances are points; colors are encoded (gamma-space) values.
 */
export interface MaterialSpec {
    /** @brief Backdrop texels per device pixel: 0.125, 0.25 (default), 1/3, 0.5 or 1. */
    readonly backdropScale?: number;
    readonly blur?: BlurSpec;
    readonly blurFill?: BlurFillSpec;
    readonly refraction?: RefractionSpec;
    readonly face?: FaceSpec;
    readonly bleed?: BleedSpec;
    readonly shadow?: ShadowSpec;
    readonly ringShadow?: RingShadowSpec;
    readonly edgeShade?: EdgeShadeSpec;
    readonly rim?: RimSpec;
    readonly aberration?: AberrationSpec;
    readonly lens?: LensLayerSpec;
    readonly hold?: HoldSpec;
    /** @brief Output channel limit (default: from the face white); 0 disables it. */
    readonly limit?: number;
    /** @brief Scale all channels to the limit instead of clamping each. */
    readonly keepHue?: boolean;
    /**
     * @brief 0 keeps corner normals, 1 uses the ellipse direction of the shape (default 0.5 with a
     * bleed, else 0).
     */
    readonly roundness?: number;
    /** @brief Extended-range share in [0, 1]; 0 for standard dynamic range output. */
    readonly headroom?: number;
    /** @brief Extended-range share, 0..1; takes precedence over the legacy `headroom` name. */
    readonly rangeShare?: number;
    /**
     * @brief Backdrop capture margin beyond the shape in points (default: how far the lookups
     * reach).
     */
    readonly margin?: number;
}

// Extra values stored only in custom descriptions, after the preset vector.
export const X_FRINGE = P_COUNT;
export const X_FRINGE_ANGLE = P_COUNT + 1;
export const X_FRINGE_HEIGHT = P_COUNT + 2;
export const X_FRINGE_OFFSET = P_COUNT + 3;
export const X_HOLD_START = P_COUNT + 4;
export const X_HOLD_END = P_COUNT + 5;
export const X_HOLD_WHITE = P_COUNT + 6;
export const X_LIMIT = P_COUNT + 7;        // -1: from the face white
export const X_KEEP_HUE = P_COUNT + 8;
export const X_ROUNDNESS = P_COUNT + 9;    // -1: 0.5 with a bleed, else 0
export const X_HEADROOM = P_COUNT + 10;    // -1: the renderer's share
export const X_RIM_ANGLE = P_COUNT + 11;
/** @brief Length of a material vector. */
export const X_BLEED_FILL_R = P_COUNT + 12;
export const X_BLEED_FILL_A = P_COUNT + 15;
export const VECTOR = P_COUNT + 16;

/** @brief Largest short side (points) of glass that follows the backdrop luminance. */
export const ADAPTIVE_SIDE = 64;
const LR = 0.2126, LG = 0.7152, LB = 0.0722;
const INF = 1e9;
const NEG_PI_SQUARED = -9.869603157043457;
const SCALE_FEW = new Float64Array([0.125, 0.25, 0.5]);
const SCALE_MANY = new Float64Array([0.125, 0.25, Math.fround(1 / 3), 0.5]);
// Reused 4×5 row-major matrices.
const COLOUR = new Float32Array(20);
// Repeated profiles reuse their numeric matrices. The cache is bounded and allocates only at module load.
class ColourCache {
    readonly arguments: Float32Array;
    private readonly keys: Float32Array;
    private readonly values = new Float32Array(16 * 20);
    private count = 0;
    private next = 0;
    constructor(private readonly size: number) {
        this.arguments = new Float32Array(size); this.keys = new Float32Array(16 * size);
    }
    read(out: Float64Array, o: number): boolean {
        for (let i = 0; i < this.count; i++) {
            let same = true;
            for (let j = 0; j < this.size; j++) if (!Object.is(this.keys[i * this.size + j], this.arguments[j])) { same = false; break; }
            if (!same) continue;
            for (let j = 0; j < 20; j++) out[o + j] = this.values[i * 20 + j] as number;
            return true;
        }
        return false;
    }
    write(matrix: Float32Array): void {
        const i = this.next; this.next = (i + 1) & 15; if (this.count < 16) this.count++;
        this.keys.set(this.arguments, i * this.size); this.values.set(matrix, i * 20);
    }
}
const COMPOSITE_CACHE = new ColourCache(8), VIBRANT_CACHE = new ColourCache(12);
const MA = new Float64Array(20), MB = new Float64Array(20), MC = new Float64Array(20);
const REGION = new Int32Array(7);
const HALF_FIELDS = new Uint8Array([23, 37, 38, 39, 54, 55, 56, 57, 58, 63, 66, 84, 85, 86, 87, 88, 89,
    90, 91, 92, 93, 94, 95, 96, 100, 101, 102, 103, 106, 109, 110, 112, 113, 114, 115, 116, 117, 118, 119,
    120, 121, 122, 123, 124, 125, 126, 127, 128, 129, 130, 131]);

/**
 * @brief Blend of a and b by m in 0..1.
 * @internal
 */
export function mx(a: number, b: number, m: number): number {
    return m <= 0 ? a : m >= 1 ? b : a + (b - a) * m;
}

/** @brief Output limit for a face white above 1 (extended-range decode of the white level). */
export function limitOf(w: number): number {
    return w > 1 ? Math.pow((w + 0.055) / 1.055, 2.4) : 1;
}

/**
 * @brief YCC color matrix: luminance to (white - black) Y + black, chroma times the
 * saturation, then a fill of straight color (r, g, b) at alpha a laid over it.
 * @details Writes 20 values (4 x 5, row major: RGBA out, RGBA in + constant) at `o`; the alpha row
 * keeps the input alpha.
 */
export function yccMatrix(out: Float64Array, o: number, white: number, black: number, saturation: number, r: number, g: number,
    b: number, a: number): void {
    const f = Math.fround, alpha = f(a);
    const key = COMPOSITE_CACHE.arguments;
    key[0] = white; key[1] = black; key[2] = saturation; key[3] = f(f(r) * alpha);
    key[4] = f(f(g) * alpha); key[5] = f(f(b) * alpha); key[6] = alpha; key[7] = 0;
    if (COMPOSITE_CACHE.read(out, o)) return;
    composite32(COLOUR, white, black, saturation, f(f(r) * alpha), f(f(g) * alpha), f(f(b) * alpha), alpha);
    COMPOSITE_CACHE.write(COLOUR);
    out.set(COLOUR, o);
}

/**
 * @brief Resolve the vibrant color matrix used by rim lights.
 * @details Applies the YCC tone, color fill and dodge composition, then rounds coefficients to
 * four decimal places with the specified Float32 operations.
 */
export function vibrantMatrix(out: Float64Array, o: number, white: number, black: number, saturation: number, fr: number,
    fg: number, fb: number, fa: number, dr: number, dg: number, db: number, da: number): void {
    const key = VIBRANT_CACHE.arguments;
    key[0] = white; key[1] = black; key[2] = saturation; key[3] = fr; key[4] = fg; key[5] = fb;
    key[6] = fa; key[7] = dr; key[8] = dg; key[9] = db; key[10] = da; key[11] = 0;
    if (VIBRANT_CACHE.read(out, o)) return;
    vibrant32(COLOUR, white, black, saturation, fr, fg, fb, fa, dr, dg, db, da);
    VIBRANT_CACHE.write(COLOUR);
    out.set(COLOUR, o);
}

/**
 * @brief Backdrop scale the blur allows (perceptual estimator): the first of the candidate scales
 * at which the blurred backdrop aliases less than `epsilon`, else the last one.
 * @details Float32 steps throughout.
 * @param blur Face blur radius of the lookup in points, times its weight at the rim.
 * @param fill Blur fill radius of the lookup in points.
 * @param faceFill Alpha of the face fill.
 * @param fillShare Blur fill mix towards itself.
 * @param pixelLength Points per device pixel; at a third or less the candidates gain 1/3.
 */
export function estimateScale(blur: number, fill: number, faceFill: number, fillShare: number, pixelLength: number): number {
    const f = Math.fround, eps = f(0.05);
    const cand = pixelLength > 0.33333333333333354 ? SCALE_FEW : SCALE_MANY, n = cand.length;
    const rm = blur > 0 ? f(blur) : 0, rf = fill > 0 ? f(fill) : 0;
    const a = faceFill < 0 ? 0 : faceFill > 1 ? 1 : f(faceFill), b = fillShare < 0 ? 0 : fillShare > 1 ? 1 : f(fillShare);
    for (let i = 0; i < n; i++) {
        const s = f(cand[i] as number);
        let z = f(NEG_PI_SQUARED * rm); z = f(z * rm); z = f(s * z); z = f(s * z); z = f(z * 0.25);
        const lm = f(Math.exp(z));
        let w = f(NEG_PI_SQUARED * rf); w = f(w * rf); w = f(s * w); w = f(s * w); w = f(w * 0.25);
        const lf = f(Math.exp(w));
        let v = f(b * lf); v = f(v + f(f(1 - b) * lm)); v = f(f(1 - a) * v);
        if (v <= eps) return s;
    }
    return cand[n - 1] as number;
}

/**
 * @brief Resolve the mip levels and aligned capture region for variable blur.
 * @param out Receives seven integers at `o`: level count, texel alignment, x, y, width, height and
 * the first mip level needed by the smallest radius.
 * @param w Capture width in texels.
 * @param h Capture height.
 * @param x Capture origin x in texels.
 * @param y Capture origin y.
 * @param r0 Smallest blur radius in texels.
 * @param r1 Largest blur radius in texels.
 * @param scale Backdrop texels per device pixel.
 * @param six Six stable levels instead of seven when a blur fill is on.
 */
export function blurRegion(out: Int32Array, o: number, w: number, h: number, x: number, y: number, r0: number, r1: number, scale: number,
    six: boolean): void {
    const f = Math.fround, log = (v: number): number => f(Math.log2(f(v)));
    r0 = f(r0); r1 = f(r1); scale = f(scale);
    const s0 = f(r0 * 1.6), s1 = f(r1 * 1.6), m = w > h ? w : h;
    const full = Math.floor(log(m > 1 ? m : 1)) + 1;
    let want = s1 > 0 ? Math.max(Math.ceil(log(s1)), 0) + 1 : 1;
    if (want === 1 && s1 !== 0) want = 2;
    const levels = want < full ? want : full, stable = levels < (six ? 6 : 7) ? levels : six ? 6 : 7;
    let shift = f(Math.ceil(log(scale)) + f(stable)); shift = shift > 0 ? shift : 0;
    const a = 1 << shift, inverse = f(1 / f(a)), offset = -r1 * 2.8, growth = -r1 * -5.6;
    const px = (x + offset) * inverse, py = (y + offset) * inverse;
    const x0 = Math.floor(px), y0 = Math.floor(py);
    const x1 = Math.ceil(px + (w + growth) * inverse), y1 = Math.ceil(py + (h + growth) * inverse);
    let low = s0 > 0 ? Math.floor(log(s0)) : 0; if (low < 0) low = 0; if (low > levels - 1) low = levels - 1;
    out[o] = levels; out[o + 1] = a; out[o + 2] = x0 * a; out[o + 3] = y0 * a; out[o + 4] = (x1 - x0) * a; out[o + 5] = (y1 - y0) * a;
    out[o + 6] = low;
}

/**
 * @brief Backdrop capture and blur pyramid of a shape, in texels on the grid from the bottom-left
 * corner of the target (y up).
 * @details The capture is the shape grown by the margin, rounded inwards to whole texels (an extent
 * under two texels keeps one), inside the target; the pyramid region is the capture grown by 2.8
 * times the largest lookup radius and aligned outward (`blurRegion`). Its texture starts at the low
 * level, where it holds whole 64-texel steps (from 64 up) and whole texels of its coarsest level.
 * Writes capture x, y, w, h, region x, y, region w, h (base texels, the texture size times 2^low),
 * the level count and the low level (10 values) into `out` at `o`.
 * @param x Left edge of the shape in points.
 * @param y Top edge in points (y down).
 * @param w Width.
 * @param h Height.
 * @param margin Capture margin in points.
 * @param scale Device pixels per point.
 * @param texel Device pixels per texel.
 * @param r0 Smallest lookup radius in points.
 * @param r1 Largest lookup radius in points.
 * @param backdropScale Backdrop texels per device pixel.
 * @param six Whether a blur fill is on.
 * @param width Target width in pixels.
 * @param height Target height in pixels.
 * @param maxLevels Maximum number of pyramid levels.
 */
export function backdropRegion(out: Int32Array, o: number, x: number, y: number, w: number, h: number, margin: number, scale: number,
    texel: number, r0: number, r1: number, backdropScale: number, six: boolean, width: number, height: number, maxLevels: number): void {
    const iT = 1 / texel, tw = Math.ceil(width * iT), th = Math.ceil(height * iT);
    const fx = (x - margin) * scale * iT, fy = (height - (y + h + margin) * scale) * iT;
    const fw = (w + 2 * margin) * scale * iT, fh = (h + 2 * margin) * scale * iT;
    let cx0 = fw >= 2 ? Math.ceil(fx) : Math.floor(fx), cx1 = fw >= 2 ? Math.floor(fx + fw) : cx0 + 1;
    let cy0 = fh >= 2 ? Math.ceil(fy) : Math.floor(fy), cy1 = fh >= 2 ? Math.floor(fy + fh) : cy0 + 1;
    if (cx0 < 0) cx0 = 0; if (cy0 < 0) cy0 = 0; if (cx1 > tw) cx1 = tw; if (cy1 > th) cy1 = th;
    if (cx1 <= cx0) { if (cx0 >= tw) cx0 = tw - 1; cx1 = cx0 + 1; }
    if (cy1 <= cy0) { if (cy0 >= th) cy0 = th - 1; cy1 = cy0 + 1; }
    const cw = cx1 - cx0, ch = cy1 - cy0, k = scale * iT;
    blurRegion(REGION, 0, cw, ch, cx0, cy0, r0 * k, r1 * k, backdropScale, six);
    let levels = REGION[0] as number; if (levels > maxLevels) levels = maxLevels; if (levels < 1) levels = 1;
    let low = REGION[6] as number; if (low > levels - 1) low = levels - 1;
    const step = 1 << low, cells = 1 << (levels - 1 - low);
    let pw = Math.ceil((REGION[4] as number) / step), ph = Math.ceil((REGION[5] as number) / step);
    if (pw >= 64) pw = Math.ceil(pw / 64) * 64;
    if (ph >= 64) ph = Math.ceil(ph / 64) * 64;
    pw = Math.ceil(pw / cells) * cells; ph = Math.ceil(ph / cells) * cells;
    out[o] = cx0; out[o + 1] = cy0; out[o + 2] = cw; out[o + 3] = ch; out[o + 4] = REGION[2] as number; out[o + 5] = REGION[3] as number;
    out[o + 6] = pw * step; out[o + 7] = ph * step; out[o + 8] = levels; out[o + 9] = low;
}

/**
 * @brief Backdrop luminance as adaptive glass sees it: rounded to 1/64, then to 1/32 (ties up), at
 * most 1.
 * @param y Mean luminance of the captured backdrop, 0..1.
 */
export function luminanceLevel(y: number): number {
    const l = Math.floor(Math.floor(64 * y + 0.5) * 0.5 + 0.5) * 0.03125;
    return l > 1 ? 1 : l < 0 ? 0 : l;
}

/**
 * @brief Scheme adaptive glass shows over a backdrop: 0 dark, 1 light.
 * @details In dark surroundings it turns light over a backdrop brighter than 0.9; in light
 * surroundings it turns dark over one darker than 0.1.
 * @param level Luminance level from `luminanceLevel`.
 * @param scheme Surroundings.
 */
export function adaptScheme(level: number, scheme: Scheme): number {
    return scheme === SCHEME_DARK ? (level > 0.9 ? 1 : 0) : level < 0.1 ? 0 : 1;
}

/**
 * @brief Whether built-in glass follows the backdrop luminance in these surroundings (the tinted,
 * reduce-transparency and increase-contrast settings keep the scheme of the surroundings).
 */
export function adapts(environment: number): boolean {
    return (environment & (ENV_TINTED | ENV_REDUCE_TRANSPARENCY | ENV_INCREASE_CONTRAST)) === 0;
}

/**
 * @brief Extended-range share of a screen: 0 at a headroom of 1 (standard dynamic range), 1 from a
 * headroom of 1.2 up.
 * @param headroom Brightest value the screen shows, relative to the standard white.
 */
export function headroomShare(headroom: number): number {
    const e = (headroom - 1) / 0.2;
    return e > 0 ? (e < 1 ? e : 1) : 0;
}

// Three opaque rows of a 4×5 matrix, with alpha folded into the constant, at float offset q of the block.
function rows3(d: Float32Array, q: number, m: Float64Array): void {
    for (let i = 0; i < 3; i++) {
        const a = i * 5, r = q + i * 4;
        d[r] = half(m[a] as number); d[r + 1] = half(m[a + 1] as number); d[r + 2] = half(m[a + 2] as number);
        d[r + 3] = half(Math.fround((m[a + 3] as number) + (m[a + 4] as number)));
    }
}

// Four rows (RGBA) of a 4×5 matrix, with alpha folded into the constant.
function rows4(d: Float32Array, q: number, m: Float64Array): void {
    for (let i = 0; i < 4; i++) {
        const a = i * 5, r = q + i * 4;
        d[r] = half(m[a] as number); d[r + 1] = half(m[a + 1] as number); d[r + 2] = half(m[a + 2] as number);
        d[r + 3] = half(Math.fround((m[a + 3] as number) + (m[a + 4] as number)));
    }
}

function same(a: Float64Array, b: Float64Array): boolean {
    for (let i = 0; i < 20; i++) if (a[i] !== b[i]) return false;
    return true;
}

function sat(x: number): number {
    return x < 0 ? 0 : x > 1 ? 1 : x;
}

/**
 * @brief Pack a material vector into the material rows of a block (rows 0..41 and 47..49; the color
 * layer rows are left to `packTint`).
 * @param d Block storage.
 * @param o Float offset of the block.
 * @param info Receives six values at `io`: shadow spread beyond the shape, largest blur radius of a
 * lookup, capture margin (points), backdrop texels per device pixel, shadow offset x and y (points,
 * y down).
 * @param p Material vector (`VECTOR` values).
 * @param presence 1 for the material itself; below 1 blur, lenses, face, bleed, shadows, edge
 * shade, fringes and lens layer are blended in from plain glass (the rim lights keep their
 * strength).
 * @param share Extended-range share in [0, 1] (the vector's own headroom wins when it has one).
 * @param scale Device pixels per point.
 * @param estimate Take the backdrop scale from the blur (the regular recipe's estimator) instead of
 * the vector.
 * @returns Feature bits.
 */
export function packParams(d: Float32Array, o: number, info: Float32Array, io: number, p: Float64Array, presence: number,
    share: number, scale: number, estimate: boolean): number {
    const pr = presence >= 1 ? 1 : presence > 0 ? presence : 0, s = scale > 0 ? scale : 1;
    const hv = p[X_HEADROOM] as number, e = hv >= 0 ? (hv < 1 ? hv : 1) : share > 0 ? (share < 1 ? share : 1) : 0;
    d.fill(0, o, o + 168);
    d.fill(0, o + 188, o + 200);
    let f = 0;
    // blur radii of the lookups (points, x1.6; the filter halves the blur, blur fill, bleed and shadow radii)
    const blur = 0.5 * (p[P_BLUR] as number), fl = sat(p[P_FILL_LIGHTEN] as number), fd = sat(p[P_FILL_DARKEN] as number);
    const fn = sat(p[P_FILL_NORMAL] as number), fillOn = fl > 0 || fd > 0 || fn > 0, fill = fillOn ? 0.5 * (p[P_FILL_BLUR] as number) : 0;
    const bop = sat(p[P_BLEED_OPACITY] as number) * pr, bleedOn = bop > 0, bleed = 0.5 * (p[P_BLEED_BLUR] as number);
    const sop = sat(p[P_SHADOW_OPACITY] as number) * pr, srad = p[P_SHADOW_RADIUS] as number, shadowOn = sop > 0 && srad > 0;
    const vib = sat(p[P_SHADOW_VIBRANCY] as number), sampleOn = shadowOn && vib > 1e-4, sblur = 0.5 * (p[P_SHADOW_BLUR] as number);
    d[o] = 1.6 * blur * pr; d[o + 1] = 1.6 * sblur * pr; d[o + 2] = 1.6 * bleed * pr; d[o + 3] = 1.6 * fill * pr;
    // lenses
    const ih = (p[P_IN_HEIGHT] as number) * pr, oh = (p[P_OUT_HEIGHT] as number) * pr;
    d[o + 4] = (p[P_IN_AMOUNT] as number) * pr; d[o + 5] = ih > 0 ? 1 / ih : INF;
    d[o + 6] = (p[P_OUT_AMOUNT] as number) * pr; d[o + 7] = oh > 0 ? 1 / oh : INF;
    // blur weight against the refracted distance: w0 - sum drop_i sat((x - d_i) / (d_i+1 - d_i))
    const d0 = p[P_BLUR_D0] as number, d1 = p[P_BLUR_D1] as number, d2 = p[P_BLUR_D2] as number, d3 = p[P_BLUR_D3] as number;
    const w0 = p[P_BLUR_OP0] as number, w1 = p[P_BLUR_OP1] as number, w2 = p[P_BLUR_OP2] as number, w3 = p[P_BLUR_OP3] as number;
    d[o + 8] = d0; d[o + 9] = d1; d[o + 10] = d2; d[o + 11] = d3;
    d[o + 12] = d1 === d0 ? 0 : 1 / (d1 - d0); d[o + 13] = d2 === d1 ? 0 : 1 / (d2 - d1); d[o + 14] = d3 === d2 ? 0 : 1 / (d3 - d2);
    d[o + 15] = w0; d[o + 16] = w0 - w1; d[o + 17] = w1 - w2; d[o + 18] = w2 - w3;
    // outer refraction band
    const oop = sat(p[P_OUT_OPACITY] as number) * pr, t0 = p[P_OUT_D0] as number, t1 = p[P_OUT_D1] as number;
    d[o + 19] = oop; d[o + 20] = t0; d[o + 21] = t1 === t0 ? INF : 1 / (t1 - t0);
    if (oop > 0) f |= FEATURE_OUTER;
    let rd = p[X_ROUNDNESS] as number;
    if (rd < 0) rd = (p[P_BLEED_OPACITY] as number) > 0 ? 0.5 : 0;
    d[o + 22] = rd;
    if (rd !== 0) f |= FEATURE_ROUND_NORMAL;
    // face: maximum luminance, then the YCC matrix with its fill
    const fop = sat(p[P_FACE_OPACITY] as number) * pr;
    d[o + 23] = fop;
    const W = p[P_FACE_WHITE] as number;
    if (fop > 0) {
        f |= FEATURE_FACE;
        yccMatrix(MA, 0, W, p[P_FACE_BLACK] as number, p[P_FACE_SAT] as number, p[P_FACE_FILL_R] as number,
            p[P_FACE_FILL_G] as number, p[P_FACE_FILL_B] as number, sat(p[P_FACE_FILL_A] as number));
        rows3(d, o + 24, MA);
        const lf = Math.fround(p[P_FACE_LUMA] as number), ls = Math.fround(p[P_FACE_LUMA_SDR] as number), lm = sat(fma32(Math.fround(lf - ls), e, ls));
        if (1 - lm > 0) { d[o + 36] = 1 - lm; f |= FEATURE_LUMA; }
    }
    // blur fill: darken and lighten share at most 1
    if (fillOn && pr > 0) {
        let a = fl, b = fd;
        if (a + b > 1) { const k = 1 / (a + b); a *= k; b *= k; }
        d[o + 37] = a * pr; d[o + 38] = b * pr; d[o + 39] = fn * pr;
        f |= FEATURE_FILL;
    }
    // edge bleed: (gain Y + offset)^2 x ramp, squared, x opacity; Y the luminance of the face
    if (bleedOn) {
        yccMatrix(MA, 0, p[P_BLEED_WHITE] as number, p[P_BLEED_BLACK] as number, p[P_BLEED_SAT] as number,
            p[X_BLEED_FILL_R] ?? 0, p[X_BLEED_FILL_R + 1] ?? 0, p[X_BLEED_FILL_R + 2] ?? 0, sat(p[X_BLEED_FILL_A] ?? 0));
        rows3(d, o + 40, MA);
        const bh = (p[P_BLEED_HEIGHT] as number) * pr, b0 = p[P_BLEED_D0] as number, b1 = p[P_BLEED_D1] as number;
        d[o + 52] = (p[P_BLEED_AMOUNT] as number) * pr; d[o + 53] = bh > 0 ? 1 / bh : INF;
        d[o + 54] = b0; d[o + 55] = b1 === b0 ? 0 : 1 / (b1 - b0);
        const dk = (p[P_BLEED_DARKEN] as number) >= 0.5;
        d[o + 56] = bop; d[o + 57] = dk ? 1 : -1; d[o + 58] = dk ? 0 : 1;
        f |= FEATURE_BLEED;
    }
    // drop shadow: falloff of the moved outline; color from the backdrop by its share, else the fill
    let spread = 0, ox = 0, oy = 0;
    if (shadowOn) {
        ox = p[P_SHADOW_X] as number; oy = p[P_SHADOW_Y] as number; spread = 2 * srad;
        const fa = sat(p[P_SHADOW_FILL_A] as number);
        yccMatrix(MA, 0, p[P_SHADOW_WHITE] as number, p[P_SHADOW_BLACK] as number, p[P_SHADOW_SAT] as number,
            p[P_SHADOW_FILL_R] as number, p[P_SHADOW_FILL_G] as number, p[P_SHADOW_FILL_B] as number, fa);
        rows3(d, o + 68, MA);
        const r = srad * (pr > 0.01 ? pr : 0.01), sh = (p[P_SHADOW_HEIGHT] as number) * pr;
        // These are SDF-coordinate additions, not outline positions.
        d[o + 60] = ox; d[o + 61] = -oy; d[o + 62] = 1 / r; d[o + 63] = sop;
        d[o + 64] = (p[P_SHADOW_AMOUNT] as number) * pr; d[o + 65] = sh > 0 ? 1 / sh : INF;
        d[o + 66] = (p[P_SHADOW_INSET] as number) * pr; d[o + 67] = vib;
        d[o + 80] = fa;
        f |= sampleOn ? FEATURE_SHADOW | FEATURE_SHADOW_SAMPLE : FEATURE_SHADOW;
    }
    // ring shadow
    const rop = sat(p[P_RING_OPACITY] as number) * pr;
    if (rop > 0) {
        const rb = p[P_RING_BLUR] as number, iv = half(1 / Math.max(half(rb), half(1e-4))), mask = p[P_RING_MASK] as number;
        // The resolved vector uses offset for the SDF translation and width
        // for the Gaussian distance gap. The shader adds this offset.
        d[o + 84] = 0; d[o + 85] = -(p[P_RING_OFFSET] as number); d[o + 86] = iv;
        d[o + 87] = half(half(p[P_RING_WIDTH] as number) * iv);
        d[o + 88] = rop; d[o + 89] = mask;
        if (mask < 1) { const r = (p[P_RING_OFFSET] as number) + 2.83 * rb; if (r > spread) spread = r; }
        f |= FEATURE_RING;
    }
    // edge shade: height and offset are device pixels
    const eh = (p[P_DARK_HEIGHT] as number) / s, ea = p[P_DARK_AMOUNT] as number;
    if (eh > 0 && ea > 0 && pr > 0) {
        const eo = (p[P_DARK_OFFSET] as number) / s, ang = p[P_DARK_ANGLE] as number;
        const sp = p[P_DARK_SPREAD] as number, ss = p[P_DARK_SPREAD_SDR] as number, c = Math.cos(fma32(Math.fround(Math.fround(sp) - Math.fround(ss)), e, Math.fround(ss)));
        d[o + 90] = Math.sin(ang); d[o + 91] = Math.cos(ang);
        d[o + 92] = eh; d[o + 93] = c; d[o + 94] = 1 / ea - 2; d[o + 95] = eo;
        const bias = (p[P_DARK_BIAS] as number) * pr;
        d[o + 96] = bias; d[o + 97] = eo < 0 && Math.abs(eh + eo) < 1e-3 ? 1 : 0; d[o + 98] = eo < 0 ? 1 : 0;
        d[o + 99] = bias !== 0 ? 1 : 0;
        f |= FEATURE_EDGE;
    }
    // holding tone (standard range only)
    const hw = p[X_HOLD_WHITE] as number;
    if (hw > 0 && e < 1) {
        const hs = p[X_HOLD_START] as number, he = p[X_HOLD_END] as number;
        d[o + 100] = (1 - e) * pr; d[o + 101] = hs; d[o + 102] = he === hs ? INF : 1 / (he - hs); d[o + 103] = mx(1, hw, pr);
        f |= FEATURE_HOLD;
    }
    // output limit: the filter's limit (from the face white) on the shader's gamma 2.2 scale
    let lim = p[X_LIMIT] as number;
    if (lim < 0) lim = limitOf(mx(1, W, fop));
    d[o + 104] = lim > 0 ? Math.pow(lim, 1 / 2.2) : 0;
    if (lim > 0) f |= (p[X_KEEP_HUE] as number) > 0 ? FEATURE_CLAMP | FEATURE_CLAMP_HUE : FEATURE_CLAMP;
    // fringes of the face lookup
    const fa = (p[X_FRINGE] as number) * pr;
    if (fa !== 0) {
        const fh = p[X_FRINGE_HEIGHT] as number, an = p[X_FRINGE_ANGLE] as number;
        d[o + 106] = fa; d[o + 107] = fh > 0 ? 1 / fh : INF; d[o + 108] = p[X_FRINGE_OFFSET] as number;
        d[o + 109] = Math.cos(an); d[o + 110] = Math.sin(an);
        f |= FEATURE_ABERRATION;
    }
    // bright rim lights: the key at its angle, the fill opposite; each with a wide diffuse band
    const ka = sat(p[P_KEY_OPACITY] as number), la = sat(p[P_FILL_OPACITY] as number);
    if (ka > 0 || la > 0) {
        const an = Math.fround((p[X_RIM_ANGLE] as number) + (p[P_KEY_OFFSET] as number)), dh = p[P_DIFFUSE_HEIGHT] as number;
        const ds = p[P_DIFFUSE_SPREAD] as number, dm = p[P_DIFFUSE_AMOUNT] as number;
        const kh = p[P_KEY_HEIGHT] as number, ks = p[P_KEY_SPREAD] as number, kk = p[P_KEY_AMOUNT] as number;
        const gh = p[P_FILL_HEIGHT] as number, gs = p[P_FILL_SPREAD] as number, gk = p[P_FILL_AMOUNT] as number;
        d[o + 112] = Math.sin(an); d[o + 113] = Math.cos(an); d[o + 114] = kh; d[o + 115] = Math.cos(Math.fround(ks));
        d[o + 116] = strength(kk); d[o + 117] = dh * kh; d[o + 118] = Math.cos(Math.fround(Math.fround(ds) * Math.fround(ks))); d[o + 119] = strength(Math.fround(Math.fround(dm) * Math.fround(kk)));
        d[o + 120] = gh; d[o + 121] = Math.cos(Math.fround(gs)); d[o + 122] = strength(gk); d[o + 123] = dh * gh;
        d[o + 124] = Math.cos(Math.fround(Math.fround(ds) * Math.fround(gs))); d[o + 125] = strength(Math.fround(Math.fround(dm) * Math.fround(gk))); d[o + 126] = p[P_KEY_CURVATURE] as number;
        d[o + 127] = p[P_RIM_INSET] as number;
        d[o + 128] = ka; d[o + 129] = la; d[o + 130] = 1; d[o + 131] = p[P_FILL_CURVATURE] as number;
        vibrantMatrix(MB, 0, p[P_KEY_WHITE] as number, p[P_KEY_BLACK] as number, p[P_KEY_SAT] as number, p[P_KEY_FILL_R] as number,
            p[P_KEY_FILL_G] as number, p[P_KEY_FILL_B] as number, sat(p[P_KEY_FILL_A] as number), p[P_KEY_DODGE_R] as number,
            p[P_KEY_DODGE_G] as number, p[P_KEY_DODGE_B] as number, sat(p[P_KEY_DODGE_A] as number));
        vibrantMatrix(MC, 0, p[P_FILL_WHITE] as number, p[P_FILL_BLACK] as number, p[P_FILL_SAT] as number,
            p[P_FILL_FILL_R] as number, p[P_FILL_FILL_G] as number, p[P_FILL_FILL_B] as number, sat(p[P_FILL_FILL_A] as number),
            p[P_FILL_DODGE_R] as number, p[P_FILL_DODGE_G] as number, p[P_FILL_DODGE_B] as number, sat(p[P_FILL_DODGE_A] as number));
        rows4(d, o + 132, MB);
        f |= FEATURE_LIGHTS;
        if (!same(MB, MC) && ka > 0 && la > 0) { rows4(d, o + 148, MC); f |= FEATURE_RIM_SPLIT; }
        else if (ka <= 0) rows4(d, o + 132, MC);
    }
    // lens layer
    const la2 = (p[P_LENS_AMOUNT] as number) * pr;
    if (la2 !== 0) {
        const lh = p[P_LENS_HEIGHT] as number, an = p[P_LENS_ANGLE] as number, q0 = p[P_LENS_D0] as number, q1 = p[P_LENS_D1] as number;
        d[o + 188] = la2; d[o + 189] = lh > 0 ? 1 / lh : INF; d[o + 190] = p[P_LENS_INSET] as number; d[o + 191] = pr;
        d[o + 192] = Math.cos(an); d[o + 193] = Math.sin(an); d[o + 194] = q0; d[o + 195] = q1 === q0 ? 0 : 1 / (q1 - q0);
        d[o + 196] = p[P_LENS_OP0] as number; d[o + 197] = p[P_LENS_OP1] as number;
        f |= FEATURE_LENS;
    }
    // what the renderer needs: shadow spread, the smallest and largest lookup radius (the blur radius times its smallest
    // and largest weight, then the shadow, bleed and blur fill radii that are on), margin, backdrop scale, shadow offset
    const fr = Math.fround, hb = fr(blur);
    let lo = w0 < w1 ? w0 : w1, hi = w0 > w1 ? w0 : w1;
    if (w2 < lo) lo = w2; if (w3 < lo) lo = w3; if (w2 > hi) hi = w2; if (w3 > hi) hi = w3;
    let r0 = fr(hb * fr(lo)), r1 = fr(hb * fr(hi));
    if ((p[P_SHADOW_OPACITY] as number) > 0 && vib > 0) { const v = fr(sblur); if (v < r0) r0 = v; if (v > r1) r1 = v; }
    if ((p[P_BLEED_OPACITY] as number) > 0) { const v = fr(bleed); if (v < r0) r0 = v; if (v > r1) r1 = v; }
    if (fillOn) { const v = fr(fill); if (v < r0) r0 = v; if (v > r1) r1 = v; }
    d[o + 164] = r0; d[o + 165] = fillOn ? 1 : 0;
    let bs = p[P_SCALE] as number;
    if (estimate) bs = estimateScale(Math.fround(Math.fround(blur) * w0), fill, p[P_FACE_FILL_A] as number, fn, 1 / s);
    bs = bs > 0 ? fr(bs) : .25;
    const sourceFactor = fr(fr(bs * fr(1.6)) * fr(s)), texelsPerPoint = fr(s / Math.round(1 / bs));
    d[o] = fr(fr(fr(blur) * sourceFactor) / texelsPerPoint) * pr;
    d[o + 1] = sampleOn ? fr(fr(fr(sblur) * sourceFactor) / texelsPerPoint) * pr : 0;
    d[o + 2] = bleedOn ? fr(fr(fr(bleed) * sourceFactor) / texelsPerPoint) * pr : 0;
    d[o + 3] = fillOn ? fr(fr(fr(fill) * sourceFactor) / texelsPerPoint) * pr : 0;
    info[io] = spread; info[io + 1] = r1; info[io + 2] = p[P_MARGIN] as number; info[io + 3] = bs;
    info[io + 4] = ox; info[io + 5] = -oy;
    for (let i = 8; i < 12; i++) d[o + i] = half(d[o + i] as number);
    for (let i = 15; i < 20; i++) d[o + i] = half(d[o + i] as number);
    for (const i of HALF_FIELDS) d[o + i] = half(d[o + i] as number);
    const k0 = d[o + 8] as number, k1 = d[o + 9] as number, k2 = d[o + 10] as number, k3 = d[o + 11] as number;
    d[o + 12] = k1 === k0 ? 0 : Math.fround(1 / Math.fround(k1 - k0));
    d[o + 13] = k2 === k1 ? 0 : Math.fround(1 / Math.fround(k2 - k1));
    d[o + 14] = k3 === k2 ? 0 : Math.fround(1 / Math.fround(k3 - k2));
    return f;
}

// Brightness bias of a light as the shader's k: v / (1 + (1 - v) k), k = 1 / amount - 2
function strength(amount: number): number {
    return Math.fround(1 / Math.fround(amount > 1e-6 ? amount : 1e-6) - 2);
}

// one channel of the tint gradient: color at luma 0 (end 0) or 1 (end 1), blended between the two schemes
function tintEnd(v: number, lo: number, bd: number, qd: number, bl: number, ql: number, m: number, end: number): number {
    let ad = bd + qd * (v - lo); ad = ad < 0 ? 0 : ad > 1 ? 1 : ad;
    let al = bl + ql * (v - lo); al = al < 0 ? 0 : al > 1 ? 1 : al;
    const kd = (ad - v) / 0.6;
    return end === 0 ? mx(v - 0.15 * kd, v + (al - v) / 0.85, m) : mx(v + 0.85 * kd, v, m);
}

/**
 * @brief Pack the color layer of a tint (rows 42..46): a matrix that maps the glass luminance onto
 * a gradient through two anchors of the tint hue, at the tint's alpha.
 * @param d Block storage.
 * @param o Float offset of the block.
 * @param r Tint red, 0..1.
 * @param g Tint green, 0..1.
 * @param b Tint blue, 0..1.
 * @param a Tint strength, 0..1.
 * @param mix Scheme: 0 dark, 1 light.
 * @returns The tint feature bit, or 0 when the strength is 0.
 */
export function packTint(d: Float32Array, o: number, r: number, g: number, b: number, a: number, mix: number): number {
    d.fill(0, o + 168, o + 188);
    r = r < 0 ? 0 : r > 1 ? 1 : r; g = g < 0 ? 0 : g > 1 ? 1 : g; b = b < 0 ? 0 : b > 1 ? 1 : b;
    const al = a < 0 ? 0 : a > 1 ? 1 : a;
    if (al <= 0) return 0;
    const hi = r > g ? (r > b ? r : b) : g > b ? g : b, lo = r < g ? (r < b ? r : b) : g < b ? g : b, c = hi - lo;
    const m = mix < 0 ? 0 : mix > 1 ? 1 : mix;
    let r0: number, g0: number, b0: number, r1: number, g1: number, b1: number;
    if (c < 1e-9) {
        r0 = 0.95 * r; g0 = 0.95 * g; b0 = 0.95 * b;
        r1 = 1 - 0.9 * (1 - r); g1 = 1 - 0.9 * (1 - g); b1 = 1 - 0.9 * (1 - b);
    } else {
        // anchors of the same hue: saturation x0.95, lightness x1.1 (dark) and x1.2, x0.6 (light)
        const lum = (hi + lo) * 0.5, s = c / (1 - Math.abs(2 * lum - 1));
        const ld = lum * 1.1, cd = s * 0.95 * (1 - Math.abs(2 * ld - 1)), bd = ld - cd * 0.5, qd = cd / c;
        const ll = lum * 0.6, cl = s * 1.2 * (1 - Math.abs(2 * ll - 1)), bl = ll - cl * 0.5, ql = cl / c;
        r0 = tintEnd(r, lo, bd, qd, bl, ql, m, 0); g0 = tintEnd(g, lo, bd, qd, bl, ql, m, 0); b0 = tintEnd(b, lo, bd, qd, bl, ql, m, 0);
        r1 = tintEnd(r, lo, bd, qd, bl, ql, m, 1); g1 = tintEnd(g, lo, bd, qd, bl, ql, m, 1); b1 = tintEnd(b, lo, bd, qd, bl, ql, m, 1);
    }
    const q = o + 168;
    d[q] = (r1 - r0) * LR; d[q + 1] = (r1 - r0) * LG; d[q + 2] = (r1 - r0) * LB; d[q + 3] = r0;
    d[q + 4] = (g1 - g0) * LR; d[q + 5] = (g1 - g0) * LG; d[q + 6] = (g1 - g0) * LB; d[q + 7] = g0;
    d[q + 8] = (b1 - b0) * LR; d[q + 9] = (b1 - b0) * LG; d[q + 10] = (b1 - b0) * LB; d[q + 11] = b0;
    d[q + 15] = al; d[q + 16] = 1.2;
    return FEATURE_TINT;
}

/**
 * @brief A material vector with every value off (plain glass: no blur, lens, color, shadow or
 * light).
 * @internal
 */
export function clearVector(p: Float64Array): void {
    p.fill(0);
    p[P_SCALE] = 0.25; p[P_BLUR_OP0] = 1; p[P_BLUR_OP1] = 1; p[P_BLUR_OP2] = 1; p[P_BLUR_OP3] = 1; p[P_OUT_D0] = -1;
    p[P_FACE_WHITE] = 1; p[P_FACE_SAT] = 1; p[P_FACE_LUMA] = 1; p[P_FACE_LUMA_SDR] = 1; p[P_BLEED_WHITE] = 1; p[P_BLEED_SAT] = 1;
    p[P_BLEED_D0] = 1; p[P_SHADOW_WHITE] = 1; p[P_SHADOW_SAT] = 1; p[P_KEY_AMOUNT] = 0.5; p[P_KEY_WHITE] = 1; p[P_KEY_SAT] = 1;
    p[P_FILL_AMOUNT] = 0.5; p[P_FILL_WHITE] = 1; p[P_FILL_SAT] = 1; p[P_DIFFUSE_SPREAD] = 1; p[P_DARK_ANGLE] = Math.PI * 0.5;
    p[P_LENS_D0] = -1; p[P_LENS_OP0] = 1;
    p[X_LIMIT] = -1; p[X_ROUNDNESS] = -1; p[X_HEADROOM] = -1;
}

function num(v: number | undefined, d: number): number {
    return v === undefined ? d : v;
}

function at(v: readonly number[] | undefined, i: number, d: number): number {
    if (v === undefined) return d;
    const x = v[i];
    return x === undefined ? d : x;
}

function tone(p: Float64Array, w: number, b: number, s: number, t: ToneSpec): void {
    p[w] = num(t.white, 1); p[b] = num(t.black, 0); p[s] = num(t.saturation, 1);
}

function colour(p: Float64Array, i: number, c: Rgba | undefined): void {
    if (c === undefined) return;
    p[i] = c[0]; p[i + 1] = c[1]; p[i + 2] = c[2]; p[i + 3] = c[3];
}

/**
 * @brief The material vector of a description (any value it leaves out is off).
 * @param p Receives `VECTOR` values.
 * @param headroom Use the description's own extended-range share (else the renderer's).
 */
export function vectorOf(p: Float64Array, sp: MaterialSpec): void {
    clearVector(p);
    p[P_SCALE] = num(sp.backdropScale, 0.25);
    const bl = sp.blur;
    if (bl !== undefined) {
        p[P_BLUR] = bl.radius;
        p[P_BLUR_OP0] = at(bl.opacities, 0, 1); p[P_BLUR_OP1] = at(bl.opacities, 1, 1);
        p[P_BLUR_OP2] = at(bl.opacities, 2, 1); p[P_BLUR_OP3] = at(bl.opacities, 3, 1);
        p[P_BLUR_D0] = at(bl.distances, 0, 0); p[P_BLUR_D1] = at(bl.distances, 1, 0);
        p[P_BLUR_D2] = at(bl.distances, 2, 0); p[P_BLUR_D3] = at(bl.distances, 3, 0);
    }
    const bf = sp.blurFill;
    if (bf !== undefined) {
        p[P_FILL_BLUR] = bf.radius; p[P_FILL_DARKEN] = num(bf.darken, 0); p[P_FILL_LIGHTEN] = num(bf.lighten, 0);
        p[P_FILL_NORMAL] = num(bf.normal, 0);
    }
    const rf = sp.refraction;
    if (rf !== undefined) {
        if (rf.inner !== undefined) { p[P_IN_AMOUNT] = rf.inner.amount; p[P_IN_HEIGHT] = rf.inner.height; }
        if (rf.outer !== undefined) { p[P_OUT_AMOUNT] = rf.outer.amount; p[P_OUT_HEIGHT] = rf.outer.height; }
        p[P_OUT_OPACITY] = rf.outer !== undefined ? num(rf.outerOpacity, 0) : 0;
        p[P_OUT_D0] = at(rf.outerDistances, 0, -1); p[P_OUT_D1] = at(rf.outerDistances, 1, 0);
    }
    const fc = sp.face;
    if (fc !== undefined) {
        p[P_FACE_OPACITY] = num(fc.opacity, 1);
        tone(p, P_FACE_WHITE, P_FACE_BLACK, P_FACE_SAT, fc);
        colour(p, P_FACE_FILL_R, fc.fill);
        p[P_FACE_LUMA] = num(fc.maxLuminance, 1); p[P_FACE_LUMA_SDR] = num(fc.maxLuminanceStandard, p[P_FACE_LUMA] as number);
    }
    const be = sp.bleed;
    if (be !== undefined) {
        p[P_BLEED_OPACITY] = be.opacity; p[P_BLEED_AMOUNT] = be.amount; p[P_BLEED_HEIGHT] = be.height; p[P_BLEED_BLUR] = be.radius;
        p[P_BLEED_D0] = at(be.distances, 0, 1); p[P_BLEED_D1] = at(be.distances, 1, 0); p[P_BLEED_DARKEN] = be.darken === true ? 1 : 0;
        tone(p, P_BLEED_WHITE, P_BLEED_BLACK, P_BLEED_SAT, be);
        colour(p, X_BLEED_FILL_R, be.fill);
    }
    const sh = sp.shadow;
    if (sh !== undefined) {
        p[P_SHADOW_OPACITY] = sh.opacity; p[P_SHADOW_RADIUS] = sh.radius; p[P_SHADOW_X] = num(sh.offsetX, 0);
        p[P_SHADOW_Y] = num(sh.offsetY, 0); p[P_SHADOW_AMOUNT] = num(sh.amount, 0); p[P_SHADOW_HEIGHT] = num(sh.height, 0);
        p[P_SHADOW_INSET] = num(sh.inset, 0); p[P_SHADOW_BLUR] = num(sh.blur, 0); p[P_SHADOW_VIBRANCY] = num(sh.backdropMix, 0);
        tone(p, P_SHADOW_WHITE, P_SHADOW_BLACK, P_SHADOW_SAT, sh);
        colour(p, P_SHADOW_FILL_R, sh.fill);
    }
    const rs = sp.ringShadow;
    if (rs !== undefined) {
        p[P_RING_OPACITY] = rs.opacity; p[P_RING_BLUR] = rs.radius; p[P_RING_WIDTH] = rs.width; p[P_RING_OFFSET] = rs.offset;
        p[P_RING_MASK] = num(rs.mask, 1);
    }
    const es = sp.edgeShade;
    if (es !== undefined) {
        p[P_DARK_AMOUNT] = es.amount; p[P_DARK_ANGLE] = num(es.angle, Math.PI * 0.5); p[P_DARK_BIAS] = es.bias;
        p[P_DARK_HEIGHT] = es.height; p[P_DARK_OFFSET] = num(es.offset, 0); p[P_DARK_SPREAD] = es.spread;
        p[P_DARK_SPREAD_SDR] = num(es.spreadStandard, es.spread);
    }
    const rim = sp.rim;
    if (rim !== undefined) {
        light(p, P_KEY_OPACITY, P_KEY_AMOUNT, P_KEY_HEIGHT, P_KEY_SPREAD, P_KEY_WHITE, P_KEY_BLACK, P_KEY_SAT, P_KEY_DODGE_R, P_KEY_FILL_R, rim.key);
        light(p, P_FILL_OPACITY, P_FILL_AMOUNT, P_FILL_HEIGHT, P_FILL_SPREAD, P_FILL_WHITE, P_FILL_BLACK, P_FILL_SAT, P_FILL_DODGE_R, P_FILL_FILL_R, rim.fill);
        p[P_KEY_CURVATURE] = num(rim.key.curvature, 0); p[P_FILL_CURVATURE] = num(rim.fill.curvature, 0);
        p[X_RIM_ANGLE] = num(rim.angle, 0); p[P_RIM_INSET] = num(rim.inset, 0);
        const df = rim.diffuse;
        if (df !== undefined) { p[P_DIFFUSE_AMOUNT] = df.amount; p[P_DIFFUSE_HEIGHT] = df.height; p[P_DIFFUSE_SPREAD] = df.spread; }
    }
    const ab = sp.aberration;
    if (ab !== undefined) {
        p[X_FRINGE] = ab.amount; p[X_FRINGE_ANGLE] = num(ab.angle, 0); p[X_FRINGE_HEIGHT] = num(ab.height, 0);
        p[X_FRINGE_OFFSET] = num(ab.offset, 0);
    }
    const ln = sp.lens;
    if (ln !== undefined) {
        p[P_LENS_AMOUNT] = ln.amount; p[P_LENS_ANGLE] = num(ln.angle, 0); p[P_LENS_HEIGHT] = num(ln.height, 0);
        p[P_LENS_INSET] = num(ln.inset, 0); p[P_LENS_D0] = at(ln.distances, 0, -1); p[P_LENS_D1] = at(ln.distances, 1, 0);
        p[P_LENS_OP0] = at(ln.opacities, 0, 1); p[P_LENS_OP1] = at(ln.opacities, 1, 0);
    }
    const ho = sp.hold;
    if (ho !== undefined) { p[X_HOLD_START] = ho.start; p[X_HOLD_END] = ho.end; p[X_HOLD_WHITE] = ho.white; }
    p[X_LIMIT] = sp.limit === undefined ? -1 : sp.limit > 0 ? sp.limit : 0;
    p[X_KEEP_HUE] = sp.keepHue === true ? 1 : 0;
    p[X_ROUNDNESS] = sp.roundness === undefined ? -1 : sp.roundness;
    const range = sp.rangeShare ?? sp.headroom;
    p[X_HEADROOM] = range === undefined ? -1 : range < 0 ? 0 : range > 1 ? 1 : range;
    // capture-margin candidates: the shadow (offset + its lens reach or its radius times the extent factor
    // of its opacity, when it takes the backdrop), the refraction, the bleed, the blur fill and the edge-shade offset
    if (sp.margin !== undefined && sp.margin >= 0) p[P_MARGIN] = sp.margin;
    else {
        const so = Math.max(Math.abs(p[P_SHADOW_X] as number), Math.abs(p[P_SHADOW_Y] as number))
            + Math.max(Math.abs(p[P_SHADOW_AMOUNT] as number) + Math.max(0, -(p[P_SHADOW_INSET] as number)),
                (p[P_SHADOW_RADIUS] as number) * extentFactor(p[P_SHADOW_OPACITY] as number));
        let m = (p[P_SHADOW_OPACITY] as number) > 0 && (p[P_SHADOW_VIBRANCY] as number) > 0 ? so : 0;
        const oa = p[P_OUT_AMOUNT] as number, outer = oa !== 0 && (p[P_OUT_HEIGHT] as number) !== 0 && (p[P_OUT_OPACITY] as number) !== 0 ? oa : 0;
        const r = Math.max(0, p[P_IN_AMOUNT] as number, outer);
        if (r > m) m = r;
        const ba = p[P_BLEED_AMOUNT] as number;
        if ((p[P_BLEED_OPACITY] as number) !== 0 && ba !== 0 && (p[P_BLEED_HEIGHT] as number) !== 0 && Math.abs(ba) > m) m = Math.abs(ba);
        if (((p[P_FILL_LIGHTEN] as number) > 0 || (p[P_FILL_DARKEN] as number) > 0 || (p[P_FILL_NORMAL] as number) > 0)
            && (p[P_FILL_BLUR] as number) > m) m = p[P_FILL_BLUR] as number;
        const cut = -0.5 * (p[P_DARK_OFFSET] as number);
        if (cut > m) m = cut;
        p[P_MARGIN] = m;
    }
}

/**
 * @brief Opacity-to-margin extent factor: 0 up to 0.005, then 0.3 ln(2 (a
 * - 0.005)) + 1.65 (at least 0), from 0.505 a straight line to 1.7 at 1.
 */
export function extentFactor(opacity: number): number {
    const v = Math.fround(opacity);
    if (!(v === v)) return 0;
    if (v >= 0.505) return ((v < 1 ? v : 1) + -0.505) / 0.495 * 0.05 + 1.65;
    if (v <= 0.005) return 0;
    const t = Math.max(0, v + -0.005);
    return Math.max(0, Math.log(t + t) * 0.3 + 1.65);
}

function light(p: Float64Array, op: number, am: number, h: number, sp: number, w: number, b: number, s: number, dodge: number,
    fill: number, l: LightSpec): void {
    p[op] = num(l.opacity, 1); p[am] = num(l.amount, 0.5); p[h] = l.height; p[sp] = l.spread;
    tone(p, w, b, s, l);
    colour(p, dodge, l.dodge);
    colour(p, fill, l.fill);
}

type Writable<T> = { -readonly [K in keyof T]: T[K] };

function rgba(p: Float64Array, i: number): Rgba {
    return [p[i] as number, p[i + 1] as number, p[i + 2] as number, p[i + 3] as number];
}

/**
 * @brief The description of a material vector (the values a description can hold).
 * @internal
 */
export function specOf(p: Float64Array): MaterialSpec {
    const sp: Writable<MaterialSpec> = {
        backdropScale: p[P_SCALE] as number,
        blur: { radius: p[P_BLUR] as number, opacities: [p[P_BLUR_OP0] as number, p[P_BLUR_OP1] as number, p[P_BLUR_OP2] as number, p[P_BLUR_OP3] as number],
            distances: [p[P_BLUR_D0] as number, p[P_BLUR_D1] as number, p[P_BLUR_D2] as number, p[P_BLUR_D3] as number] },
        refraction: { inner: { amount: p[P_IN_AMOUNT] as number, height: p[P_IN_HEIGHT] as number },
            outer: { amount: p[P_OUT_AMOUNT] as number, height: p[P_OUT_HEIGHT] as number }, outerOpacity: p[P_OUT_OPACITY] as number,
            outerDistances: [p[P_OUT_D0] as number, p[P_OUT_D1] as number] },
        margin: p[P_MARGIN] as number
    };
    if ((p[P_FILL_DARKEN] as number) > 0 || (p[P_FILL_LIGHTEN] as number) > 0 || (p[P_FILL_NORMAL] as number) > 0) {
        sp.blurFill = { radius: p[P_FILL_BLUR] as number, darken: p[P_FILL_DARKEN] as number, lighten: p[P_FILL_LIGHTEN] as number,
            normal: p[P_FILL_NORMAL] as number };
    }
    if ((p[P_FACE_OPACITY] as number) > 0) {
        sp.face = { opacity: p[P_FACE_OPACITY] as number, white: p[P_FACE_WHITE] as number, black: p[P_FACE_BLACK] as number,
            saturation: p[P_FACE_SAT] as number, fill: rgba(p, P_FACE_FILL_R), maxLuminance: p[P_FACE_LUMA] as number,
            maxLuminanceStandard: p[P_FACE_LUMA_SDR] as number };
    }
    if ((p[P_BLEED_OPACITY] as number) > 0) {
        sp.bleed = { opacity: p[P_BLEED_OPACITY] as number, amount: p[P_BLEED_AMOUNT] as number, height: p[P_BLEED_HEIGHT] as number,
            radius: p[P_BLEED_BLUR] as number, distances: [p[P_BLEED_D0] as number, p[P_BLEED_D1] as number],
            darken: (p[P_BLEED_DARKEN] as number) >= 0.5, white: p[P_BLEED_WHITE] as number, black: p[P_BLEED_BLACK] as number,
            saturation: p[P_BLEED_SAT] as number };
        if ((p[X_BLEED_FILL_A] ?? 0) !== 0) sp.bleed = { ...sp.bleed, fill: rgba(p, X_BLEED_FILL_R) };
    }
    if ((p[P_SHADOW_OPACITY] as number) > 0) {
        sp.shadow = { opacity: p[P_SHADOW_OPACITY] as number, radius: p[P_SHADOW_RADIUS] as number, offsetX: p[P_SHADOW_X] as number,
            offsetY: p[P_SHADOW_Y] as number, amount: p[P_SHADOW_AMOUNT] as number, height: p[P_SHADOW_HEIGHT] as number,
            inset: p[P_SHADOW_INSET] as number, blur: p[P_SHADOW_BLUR] as number, backdropMix: p[P_SHADOW_VIBRANCY] as number,
            white: p[P_SHADOW_WHITE] as number, black: p[P_SHADOW_BLACK] as number, saturation: p[P_SHADOW_SAT] as number,
            fill: rgba(p, P_SHADOW_FILL_R) };
    }
    if ((p[P_RING_OPACITY] as number) > 0) {
        sp.ringShadow = { opacity: p[P_RING_OPACITY] as number, radius: p[P_RING_BLUR] as number, width: p[P_RING_WIDTH] as number,
            offset: p[P_RING_OFFSET] as number, mask: p[P_RING_MASK] as number };
    }
    if ((p[P_DARK_AMOUNT] as number) > 0 && (p[P_DARK_HEIGHT] as number) > 0) {
        sp.edgeShade = { amount: p[P_DARK_AMOUNT] as number, angle: p[P_DARK_ANGLE] as number, bias: p[P_DARK_BIAS] as number,
            height: p[P_DARK_HEIGHT] as number, offset: p[P_DARK_OFFSET] as number, spread: p[P_DARK_SPREAD] as number,
            spreadStandard: p[P_DARK_SPREAD_SDR] as number };
    }
    if ((p[P_KEY_OPACITY] as number) > 0 || (p[P_FILL_OPACITY] as number) > 0) {
        sp.rim = {
            key: { opacity: p[P_KEY_OPACITY] as number, amount: p[P_KEY_AMOUNT] as number, height: p[P_KEY_HEIGHT] as number,
                spread: p[P_KEY_SPREAD] as number, curvature: p[P_KEY_CURVATURE] as number, white: p[P_KEY_WHITE] as number,
                black: p[P_KEY_BLACK] as number, saturation: p[P_KEY_SAT] as number, dodge: rgba(p, P_KEY_DODGE_R), fill: rgba(p, P_KEY_FILL_R) },
            fill: { opacity: p[P_FILL_OPACITY] as number, amount: p[P_FILL_AMOUNT] as number, height: p[P_FILL_HEIGHT] as number,
                spread: p[P_FILL_SPREAD] as number, curvature: p[P_FILL_CURVATURE] as number, white: p[P_FILL_WHITE] as number,
                black: p[P_FILL_BLACK] as number, saturation: p[P_FILL_SAT] as number, dodge: rgba(p, P_FILL_DODGE_R), fill: rgba(p, P_FILL_FILL_R) },
            angle: (p[X_RIM_ANGLE] as number) + (p[P_KEY_OFFSET] as number),
            diffuse: { amount: p[P_DIFFUSE_AMOUNT] as number, height: p[P_DIFFUSE_HEIGHT] as number, spread: p[P_DIFFUSE_SPREAD] as number },
            inset: p[P_RIM_INSET] as number
        };
    }
    if ((p[P_LENS_AMOUNT] as number) !== 0) {
        sp.lens = { amount: p[P_LENS_AMOUNT] as number, angle: p[P_LENS_ANGLE] as number, height: p[P_LENS_HEIGHT] as number,
            inset: p[P_LENS_INSET] as number, distances: [p[P_LENS_D0] as number, p[P_LENS_D1] as number],
            opacities: [p[P_LENS_OP0] as number, p[P_LENS_OP1] as number] };
    }
    if ((p[X_FRINGE] as number) !== 0) sp.aberration = { amount: p[X_FRINGE] as number, angle: p[X_FRINGE_ANGLE] as number,
        height: p[X_FRINGE_HEIGHT] as number, offset: p[X_FRINGE_OFFSET] as number };
    if ((p[X_HOLD_WHITE] as number) > 0) sp.hold = { start: p[X_HOLD_START] as number, end: p[X_HOLD_END] as number, white: p[X_HOLD_WHITE] as number };
    if ((p[X_LIMIT] as number) >= 0) sp.limit = p[X_LIMIT] as number;
    if ((p[X_KEEP_HUE] as number) > 0) sp.keepHue = true;
    if ((p[X_ROUNDNESS] as number) >= 0) sp.roundness = p[X_ROUNDNESS] as number;
    else sp.roundness = (p[P_BLEED_OPACITY] as number) > 0 ? 0.5 : 0;
    if ((p[X_HEADROOM] as number) >= 0) sp.headroom = p[X_HEADROOM] as number;
    return sp;
}

const VS = new Float64Array(VECTOR);
const TRIAL = new Float32Array(200), TRIAL_INFO = new Float32Array(6);
const TRIAL_HEAD = TRIAL.subarray(0, 168), TRIAL_TAIL = TRIAL.subarray(188, 200);

/**
 * @brief Check derived Float32 values before committing a material update.
 * @internal
 */
export function packedMaterialFinite(d: Float32Array, o: number, info: Float32Array, io: number): boolean {
    for (let i = 0; i < 200; i++) if ((i < 168 || i >= 188) && !Number.isFinite(d[o + i])) return false;
    for (let i = 0; i < 6; i++) if (!Number.isFinite(info[io + i])) return false;
    return true;
}

/**
 * @brief Pack a material description (see `packParams` for the rows and `info`).
 * @param presence 1 for the material itself (default); below 1 it is blended in from plain glass.
 * @param share Extended-range share in [0, 1] when the description has no `headroom` of its own
 * (default 0).
 * @param scale Device pixels per point (default 2).
 * @returns Feature bits, or -1 when a list has the wrong length or a value is not finite (`d` and
 * `info` untouched).
 */
export function packMaterial(d: Float32Array, o: number, info: Float32Array, io: number, sp: MaterialSpec, presence = 1, share = 0,
    scale = 2): number {
    if (rawMaterialIssue(sp) !== null || !Number.isFinite(presence) || !Number.isFinite(share) || !Number.isFinite(scale)
        || o < 0 || io < 0 || !Number.isInteger(o) || !Number.isInteger(io) || d.length < o + 200 || info.length < io + 6) return -1;
    vectorOf(VS, sp);
    let a = 0;
    for (let i = 0; i < VECTOR; i++) a += VS[i] as number;
    if (a - a !== 0) return -1;
    const bits = packParams(TRIAL, 0, TRIAL_INFO, 0, VS, presence, share, scale, false);
    if (!packedMaterialFinite(TRIAL, 0, TRIAL_INFO, 0)) return -1;
    d.set(TRIAL_HEAD, o); d.set(TRIAL_TAIL, o + 188); info.set(TRIAL_INFO, io);
    return bits;
}

/**
 * @brief Describe the first invalid material field.
 * @returns A field path and diagnostic, or an empty string for a valid description.
 */
export function explainMaterial(sp: MaterialSpec): string {
    return rawMaterialIssue(sp)?.message ?? "";
}
