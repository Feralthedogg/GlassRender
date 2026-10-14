/**
 * @file index.ts
 * @brief Root entry: the canvas API, the low-level renderer and what both take as arguments.
 * @details Numeric material helpers and material descriptions are in `glassrender/advanced`, the
 * catalog also in `glassrender/materials`.
 */

export {
    CORNER_CIRCULAR, CORNER_SMOOTH, DEFAULT_CHROMATIC_ABERRATION, ENV_BUTTON_SHAPES, ENV_INACTIVE, ENV_INCREASE_CONTRAST, ENV_REDUCE_MOTION, ENV_REDUCE_TRANSPARENCY,
    ENV_TINTED, ROWS_BOTTOM_UP, ROWS_TOP_DOWN, SCHEME_DARK, SCHEME_LIGHT, STACKING_EXACT, STACKING_FLAT, STACKING_OVERLAP, type CornerKind, type RowOrder,
    type BackdropPixels, type Scheme, type Stacking
} from "./layout.js";
export type { Rgb, Rgba } from "./material.js";
export { DEFAULT_BACKDROP } from "./default-backdrop.js";
export {
    PRESET_ASSISTANT, PRESET_ASSISTANT_CARD, PRESET_ATTACHED_SIDEBAR, PRESET_BUBBLE, PRESET_CALL,
    PRESET_CAMERA, PRESET_CLEAR, PRESET_CONTROL, PRESET_CONTROL_PANEL, PRESET_COUNT, PRESET_DOCK, PRESET_FOCUS_BACKGROUND,
    PRESET_FOCUS_RING, PRESET_ICON, PRESET_IDENTITY, PRESET_INSPECTOR, PRESET_KEYBOARD, PRESET_LOUPE, PRESET_MENU, PRESET_MONOGRAM,
    PRESET_NAMES, PRESET_NOTIFICATION, PRESET_PLAYER, PRESET_POPOVER, PRESET_SIDEBAR, PRESET_SLIDER, PRESET_STANDARD, PRESET_TEXT,
    PRESET_VEHICLE, PRESET_WIDGET, presetNumber
} from "./preset.js";
export { MATERIALS, getMaterialInfo, type MaterialInfo } from "./material-catalog.js";
export { createGlass, Glass } from "./glass/glass.js";
export { GlassGroup, GroupMember } from "./glass/group.js";
export { GlassItem } from "./glass/item.js";
export { GlassShape } from "./glass/shape.js";
export type {
    Appearance, CornerStyle, EnvironmentOptions, Fit, Follow, Foreground, FrameOptions, GlassOptions, GroupOptions, GroupUpdate,
    MaterialOptions, MemberOptions, MemberUpdate, Preset, Radius, ShapeOptions, ShapeUpdate, ShownScheme, StackingMode, Transition
} from "./glass/types.js";
export { createRenderer, Renderer } from "./renderer/renderer.js";
export { resolveDisplayHeadroom, type DisplayBrightness } from "./hdr.js";
export type { Err, Ok, Result } from "./result.js";
