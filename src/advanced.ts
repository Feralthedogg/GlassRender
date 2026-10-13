/**
 * @file advanced.ts
 * @brief Low-level rendering and material integration entry point.
 * @details Everything of the root entry, the numeric material helpers and descriptions that only
 * this entry carries, and the versioned material-block layout.
 */

export * from "./index.js";
export {
    ADAPTIVE_SIDE, adaptScheme, adapts, backdropRegion, blurRegion, estimateScale, explainMaterial, extentFactor, headroomShare, limitOf, luminanceLevel, packMaterial,
    packParams, packTint, vectorOf, VECTOR, vibrantMatrix, yccMatrix, type AberrationSpec, type BleedSpec, type BlurFillSpec,
    type BlurSpec, type EdgeShadeSpec, type FaceSpec, type HoldSpec, type LensLayerSpec, type LensSpec, type LightSpec,
    type MaterialSpec, type RefractionSpec, type RimSpec, type RingShadowSpec, type ShadowSpec, type ToneSpec
} from "./material.js";
export {
    clearMaterial, packPreset, presetFollows, presetMaterial, presetSide, presetVector, standardMaterial, surroundings
} from "./preset.js";
export { MATERIAL_FLOATS, BLOCK_FLOATS, ROW_TINT, ROW_RIM_ALPHA } from "./layout.js";
/**
 * @brief Material block layout; v2 adds fill-light curvature in the previously reserved alpha-row
 * component.
 */
export const MATERIAL_LAYOUT = Object.freeze({ version: 2, floats: 200, infoFloats: 6,
    info: Object.freeze({ shadowSpread: 0, maxBlur: 1, margin: 2, backdropScale: 3, shadowX: 4, shadowY: 5 }) });
