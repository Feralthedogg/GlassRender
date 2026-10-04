// Option types of the convenience layer.
import { CORNER_CIRCULAR, CORNER_SMOOTH, type CornerKind } from "../layout.js";
import type { MaterialSpec, Rgb, Rgba } from "../material.js";
import type { PRESET_NAMES } from "../presets.js";

/** Surroundings a material is tuned for; "auto" follows the colour scheme the page prefers. */
export type Appearance = "dark" | "light" | "auto";
/**
 * Built-in material. "standard" is frosted glass and "clear" glass with little blur and no shadow; "prominent" is
 * standard glass tinted at full strength with the accent colour (or with `tint`), the look of a primary control. The
 * others are the materials of particular surfaces and controls, each with its own laws over the size and the
 * surroundings: "menu", "popover", "notification", "sidebar", "attachedSidebar", "inspector", "dock", "controlPanel",
 * "keyboard", "widget", "icon", "player" and "call" (clear glass over video), "camera", "bubble", "text" (fields),
 * "assistant", "assistantCard", "focusRing", "focusBackground", "vehicle", "control", "slider" and "loupe" (lenses of
 * controls; "control" and "loupe" draw colour fringes), "monogram" (a lens with bright lights only) and "identity"
 * (no effect at all).
 */
export type Preset = (typeof PRESET_NAMES)[number] | "prominent";
/** Corner construction: "smooth" (curvature eases into the edges) or "circular" arcs. */
export type CornerStyle = "smooth" | "circular";
/** How a shape appears, disappears and leaves: "materialize" blends it in over half a second, "none" switches at once. */
export type Transition = "materialize" | "none";
/** How a backdrop of another size is laid on the canvas. */
export type Fit = "cover" | "contain" | "stretch";
/** "exact": glass over glass refracts the glass below it; "flat": every shape refracts the backdrop only (cheaper). */
export type StackingMode = "exact" | "flat";
/** A setting that is on, off, or follows what the person set on their device ("auto"). */
export type Follow = boolean | "auto";
/** One corner radius, or four (top-left, top-right, bottom-right, bottom-left). */
export type Radius = number | readonly [number, number, number, number];
/** The scheme a glass shows: small adaptive glass turns light over a bright backdrop and dark over a dark one. */
export type ShownScheme = "dark" | "light";

/** CSS colours for content on a glass: ordinary content and the title of a control. */
export interface Foreground {
    readonly text: string;
    readonly title: string;
}

/** Look of a shape or a group. Every field is optional. */
export interface MaterialOptions {
    /** Built-in material (default "standard"). */
    readonly preset?: Preset;
    /** Surroundings (default: the setting of the glass, which defaults to "auto"). */
    readonly appearance?: Appearance;
    /**
     * Fields that replace those of the preset's description (top-level fields; a nested object replaces the whole
     * field). With it the material no longer adapts its tone to the backdrop. null goes back to the preset.
     */
    readonly material?: Partial<MaterialSpec> | null;
    /** Colour laid over the glass; its alpha is the strength. null removes it. With "prominent" it replaces the accent. */
    readonly tint?: Rgba | null;
    /** Opacity of the glass with its shadow, 0..1 (default 1). */
    readonly opacity?: number;
    /** Shown (default) or hidden. */
    readonly visible?: boolean;
    /** Pressed: a faint veil over the glass (white on dark glass, black on light glass). */
    readonly pressed?: boolean;
    /** How visibility changes and removal look (default "materialize"). */
    readonly transition?: Transition;
    /**
     * Small glass (short side up to 64) follows the luminance of the backdrop under it: its tone moves with it and it
     * turns light over a bright backdrop (default true). false keeps the fixed tone of its scheme, as glass of a fixed
     * size class does.
     */
    readonly adaptive?: boolean;
    /** Called when the scheme the glass shows changes (see `GlassItem.shownScheme`). null removes it. */
    readonly onScheme?: ((scheme: ShownScheme) => void) | null;
}

/** A rectangle in CSS pixels from the top-left corner of the canvas. */
export interface FrameOptions {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
    /** Corner radius, or four radii (top-left, top-right, bottom-right, bottom-left). Default: half the short side. */
    readonly radius?: Radius;
    /** Corner construction (default "smooth"). */
    readonly corner?: CornerStyle;
}

/** Options of `Glass.add`. */
export interface ShapeOptions extends FrameOptions, MaterialOptions {
    /**
     * Outline of any shape instead of a rounded rectangle: the alpha channel of an image or canvas, stretched over
     * the frame (radius and corner are not used). Only a shape made with a mask can get another one later.
     */
    readonly mask?: TexImageSource;
}
/** Any subset of the shape options; the fields left out keep their value. */
export type ShapeUpdate = Partial<ShapeOptions>;

/** Options of `Glass.addGroup`. */
export interface GroupOptions extends MaterialOptions {
    /** Distance in CSS pixels over which neighbouring members flow into each other (default 0: they only share the glass). */
    readonly spacing?: number;
}
/** Any subset of the group options. */
export type GroupUpdate = Partial<GroupOptions>;
/** Options of `GlassGroup.add`: a rounded rectangle, or with `mask` any outline. */
export interface MemberOptions {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
    /** Corner radius, or four radii (default: half the short side). */
    readonly radius?: Radius;
    /** Corner construction (default "smooth"); fixed once the member is added. */
    readonly corner?: CornerStyle;
    /** Outline from the alpha channel of an image or canvas, stretched over the frame (at most 4 such members per group). */
    readonly mask?: TexImageSource;
}
/** Any subset of the member frame; `mask` replaces the mask of a member made with one. */
export type MemberUpdate = Partial<Pick<MemberOptions, "x" | "y" | "width" | "height" | "radius" | "mask">>;

/**
 * Surroundings that change the built-in materials. The accessibility settings follow the device by default, the way
 * system glass does.
 */
export interface EnvironmentOptions {
    /**
     * The window is the active one (default true). false gives the flatter glass of an inactive window; "auto" follows
     * the focus of the page.
     */
    readonly active?: Follow;
    /** The more opaque, more saturated variant of the standard material (default false). */
    readonly tinted?: boolean;
    /** Nearly opaque, strongly blurred glass without refraction. "auto" (default) follows `prefers-reduced-transparency`. */
    readonly reduceTransparency?: Follow;
    /** A stronger, more opaque tone. "auto" (default) follows `prefers-contrast: more`. */
    readonly increaseContrast?: Follow;
    /** No refraction inside the glass and more blur. "auto" (default) follows `prefers-reduced-motion: reduce`. */
    readonly reduceMotion?: Follow;
    /** Rim lights drawn as a plain outline instead of shaded bands (default false). */
    readonly buttonShapes?: boolean;
}

/** Options of `createGlass`. */
export interface GlassOptions {
    /** Default surroundings of the shapes (default "auto"). */
    readonly appearance?: Appearance;
    /** Keep the drawing buffer at the displayed size of the canvas times the pixel ratio (default true). */
    readonly autoResize?: boolean;
    /** Upper limit of device pixels per CSS pixel (default 2). */
    readonly maxPixelRatio?: number;
    /** Glass over glass (default "exact"). */
    readonly stacking?: StackingMode;
    /** Turn of the rim lights in radians, clockwise (default 0). */
    readonly lightAngle?: number;
    /** Picture behind the glass. */
    readonly backdrop?: TexImageSource;
    /** How a backdrop of another size is laid on the canvas (default "cover"). */
    readonly fit?: Fit;
    /** Upload the backdrop again on every frame (a playing video, an animated canvas). */
    readonly live?: boolean;
    /** Window activity, the tinted setting and the accessibility settings. */
    readonly environment?: EnvironmentOptions;
    /**
     * Draw in extended range where the screen shows values above the standard white (default false). "auto" follows
     * `dynamic-range: high`. It needs a browser with half-float drawing buffers; otherwise the output stays standard.
     * Only a glass created with this option (true or "auto") can switch to extended range later.
     */
    readonly extendedRange?: Follow;
    /** Brightest value of the screen relative to the standard white, used with extended range (default 2). */
    readonly headroom?: number;
    /** Accent colour of the "prominent" preset (default a blue, 0 / 0.478 / 1). */
    readonly accent?: Rgb;
    /** Called when the WebGL context is lost; drawing pauses until it is back. */
    readonly onContextLost?: () => void;
    /** Called when the context is back and the glass has been rebuilt ("" ) or cannot be rebuilt (the reason). */
    readonly onContextRestored?: (error: string) => void;
}

/** @internal */
export function kindOf(c: CornerStyle | undefined): CornerKind {
    return c === "circular" ? CORNER_CIRCULAR : CORNER_SMOOTH;
}

/** @internal Radius the renderer takes for a frame: the one radius, half the short side by default, 0 with four radii. */
export function roundOf(r: Radius | null, width: number, height: number): number {
    return typeof r === "number" ? r : r === null ? (width < height ? width : height) * 0.5 : 0;
}
