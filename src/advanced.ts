/**
 * @file advanced.ts
 * @brief Low-level rendering and material integration entry point.
 * @details Retains the root exports and exposes the versioned material-block layout.
 */

export * from "./index.js";
export { MATERIAL_FLOATS, BLOCK_FLOATS, ROW_TINT, ROW_RIM_ALPHA } from "./layout.js";
/**
 * @brief Material block layout; v2 adds fill-light curvature in the previously reserved alpha-row
 * component.
 */
export const MATERIAL_LAYOUT = Object.freeze({ version: 2, floats: 200, infoFloats: 6,
    info: Object.freeze({ shadowSpread: 0, maxBlur: 1, margin: 2, backdropScale: 3, shadowX: 4, shadowY: 5 }) });
