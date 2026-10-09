/**
 * @file core.ts
 * @brief Canvas, shape and group API entry point.
 */

export { createGlass } from "./glass/glass.js";
export { DEFAULT_CHROMATIC_ABERRATION } from "./layout.js";
export { resolveDisplayHeadroom, type DisplayBrightness } from "./hdr.js";
export type { BackdropPixels } from "./layout.js";
export type { Glass } from "./glass/glass.js";
export type { GlassShape } from "./glass/shape.js";
export type { GlassGroup, GroupMember } from "./glass/group.js";
export type { GlassItem } from "./glass/item.js";
export type { Appearance, CornerStyle, EnvironmentOptions, Fit, Follow, Foreground, FrameOptions, GlassOptions, GroupOptions,
    GroupUpdate, MaterialOptions, MemberOptions, MemberUpdate, Preset, Radius, ShapeOptions, ShapeUpdate, ShownScheme, StackingMode, Transition } from "./glass/types.js";
export type { Rgb, Rgba } from "./material.js";
export type { Result, Ok, Err } from "./result.js";
