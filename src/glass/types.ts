/**
 * @file types.ts
 * @brief Public canvas, geometry and material option contracts.
 */

import { CORNER_CIRCULAR, CORNER_SMOOTH, type CornerKind } from "../layout.js";
import type { Rgba } from "../material.js";
import type { PRESET_NAMES } from "../presets.js";

/**
 * @brief Color scheme used to resolve a material.
 * @details "auto" follows the page's preferred color scheme.
 */
export type Appearance = "dark" | "light" | "auto";
/** @brief A built-in material preset. */
export type Preset = (typeof PRESET_NAMES)[number];
/** @brief Corner construction: "smooth" (curvature eases into the edges) or "circular" arcs. */
export type CornerStyle = "smooth" | "circular";
/**
 * @brief Visibility and removal transition.
 * @details "materialize" blends the shape over half a second; "none" switches immediately.
 */
export type Transition = "materialize" | "none";
/** @brief How a backdrop of another size is laid on the canvas. */
export type Fit = "cover" | "contain" | "stretch";
/**
 * @brief Backdrop source used when glass shapes overlap.
 * @details "exact" includes previously drawn glass; "flat" samples only the backdrop and costs less.
 */
export type StackingMode = "exact" | "flat";
/**
 * @brief Explicit setting or device preference selected with "auto".
 */
export type Follow = boolean | "auto";
/** @brief One corner radius, or four (top-left, top-right, bottom-right, bottom-left). */
export type Radius = number | readonly [number, number, number, number];
/**
 * @brief Color scheme currently displayed by a glass item.
 * @details Small adaptive items can change scheme with the backdrop luminance.
 */
export type ShownScheme = "dark" | "light";

/** @brief CSS colors for content on a glass: ordinary content and the title of a control. */
export interface Foreground {
    readonly text: string;
    readonly title: string;
}

/** @brief Appearance options shared by standalone shapes and groups. */
export interface MaterialOptions {
    /** @brief Built-in material (default "standard"). */
    readonly preset?: Preset;
    /** @brief Surroundings (default: the setting of the glass, which defaults to "auto"). */
    readonly appearance?: Appearance;
    /**
     * @brief Color overlay whose alpha controls its strength.
     * @details null removes the overlay.
     */
    readonly tint?: Rgba | null;
    /** @brief Opacity of the glass with its shadow, 0..1 (default 1). */
    readonly opacity?: number;
    /**
     * @brief Color-separation multiplier from 0 (off) to 1 (original preset distance).
     * @details Omitted or null inherits the canvas default, initially 0.25. Other optical effects
     * remain unchanged; presets without color separation stay unchanged.
     */
    readonly chromaticAberration?: number | null;
    /** @brief Shown (default) or hidden. */
    readonly visible?: boolean;
    /**
     * @brief Pressed: a faint veil over the glass (white on dark glass, black on light glass).
     */
    readonly pressed?: boolean;
    /** @brief How visibility changes and removal look (default "materialize"). */
    readonly transition?: Transition;
    /**
     * @brief Follow backdrop luminance for eligible small glass (default true).
     * @details Items with a short side up to 64 CSS pixels can change tone and scheme. false keeps
     * the selected scheme's fixed tone; fixed size classes remain ineligible.
     */
    readonly adaptive?: boolean;
    /**
     * @brief Callback for changes to `GlassItem.shownScheme`.
     * @details null removes the callback.
     */
    readonly onScheme?: ((scheme: ShownScheme) => void) | null;
}

/** @brief A rectangle in CSS pixels from the top-left corner of the canvas. */
export interface FrameOptions {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
    /**
     * @brief Corner radius, or four radii (top-left, top-right, bottom-right, bottom-left).
     * @details Default: half the short side. null restores this automatic radius on updates.
     */
    readonly radius?: Radius | null;
    /** @brief Corner construction (default "smooth"). */
    readonly corner?: CornerStyle;
}

/** @brief Options of `Glass.add`. */
export interface ShapeOptions extends FrameOptions, MaterialOptions {
    /**
     * @brief Alpha mask stretched over the frame.
     * @details Masked shapes ignore radius and corner. Only a shape created with a mask can replace
     * its mask later.
     */
    readonly mask?: TexImageSource;
}
/** @brief Any subset of the shape options; the fields left out keep their value. */
export type ShapeUpdate = Partial<ShapeOptions>;

/** @brief Options of `Glass.addGroup`. */
export interface GroupOptions extends MaterialOptions {
    /**
     * @brief Distance in CSS pixels over which neighboring members flow into each other (default 0:
     * they only share the glass).
     */
    readonly spacing?: number;
}
/** @brief Any subset of the group options. */
export type GroupUpdate = Partial<GroupOptions>;
/** @brief Options of `GlassGroup.add`: a rounded rectangle, or with `mask` any outline. */
export interface MemberOptions {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
    /** @brief Corner radius, or four radii; null restores the default half-short-side radius. */
    readonly radius?: Radius | null;
    /** @brief Corner construction (default "smooth"); fixed once the member is added. */
    readonly corner?: CornerStyle;
    /**
     * @brief Outline from the alpha channel of an image or canvas, stretched over the frame (at
     * most 4 such members per group).
     */
    readonly mask?: TexImageSource;
}
/**
 * @brief Any subset of the member frame; `mask` replaces the mask of a member made with one.
 */
export type MemberUpdate = Partial<Pick<MemberOptions, "x" | "y" | "width" | "height" | "radius" | "mask">>;

/**
 * @brief Surroundings that change the built-in materials.
 * @details Accessibility settings follow device preferences by default.
 */
export interface EnvironmentOptions {
    /**
     * @brief Window activity used to choose a material variant (default true).
     * @details false selects the flatter inactive variant; "auto" follows page focus.
     */
    readonly active?: Follow;
    /**
     * @brief The more opaque, more saturated variant of the standard material (default false).
     */
    readonly tinted?: boolean;
    /**
     * @brief Nearly opaque, strongly blurred glass without refraction.
     * @details "auto" (default) follows `prefers-reduced-transparency`.
     */
    readonly reduceTransparency?: Follow;
    /**
     * @brief A stronger, more opaque tone.
     * @details "auto" (default) follows `prefers-contrast: more`.
     */
    readonly increaseContrast?: Follow;
    /**
     * @brief No refraction inside the glass and more blur.
     * @details "auto" (default) follows `prefers-reduced-motion: reduce`.
     */
    readonly reduceMotion?: Follow;
    /** @brief Rim lights drawn as a plain outline instead of shaded bands (default false). */
    readonly buttonShapes?: boolean;
}

/** @brief Options of `createGlass`. */
export interface GlassOptions {
    /** @brief Default color-separation multiplier for shapes and groups (0..1, default 0.25). */
    readonly chromaticAberration?: number;
    /** @brief Default surroundings of the shapes (default "auto"). */
    readonly appearance?: Appearance;
    /**
     * @brief Keep the drawing buffer at the displayed size of the canvas times the pixel ratio
     * (default true).
     */
    readonly autoResize?: boolean;
    /** @brief Upper limit of device pixels per CSS pixel (default 2). */
    readonly maxPixelRatio?: number;
    /** @brief Glass over glass (default "exact"). */
    readonly stacking?: StackingMode;
    /** @brief Turn of the rim lights in radians, clockwise (default 0). */
    readonly lightAngle?: number;
    /** @brief Picture behind the glass. */
    readonly backdrop?: TexImageSource;
    /** @brief How a backdrop of another size is laid on the canvas (default "cover"). */
    readonly fit?: Fit;
    /**
     * @brief Upload the backdrop again on every frame (a playing video, an animated canvas).
     */
    readonly live?: boolean;
    /** @brief Window activity, the tinted setting and the accessibility settings. */
    readonly environment?: EnvironmentOptions;
    /**
     * @brief Draw in extended range where the screen shows values above the standard white (default
     * false).
     * @details "auto" follows `dynamic-range: high`. It needs a browser with half-float drawing
     * buffers; otherwise the output stays standard. Only a glass created with this option (true or
     * "auto") can switch to extended range later.
     */
    readonly extendedRange?: Follow;
    /**
     * @brief Brightest value of the screen relative to the standard white, used with extended range
     * (default 1; browsers do not expose the current numeric headroom). Supply a finite value
     * of at least 1 from the host; potential hardware capability is a separate quantity.
     */
    readonly headroom?: number;
    /** @brief Display brightness multiplier; preferred name for `headroom`. */
    readonly displayHeadroom?: number;
    /** @brief Called when the WebGL context is lost; drawing pauses until it is back. */
    readonly onContextLost?: () => void;
    /**
     * @brief Called when the context is back and the glass has been rebuilt ("" ) or cannot be
     * rebuilt (the reason).
     */
    readonly onContextRestored?: (error: string) => void;
}

/** @internal */
export function kindOf(c: CornerStyle | undefined): CornerKind {
    return c === "circular" ? CORNER_CIRCULAR : CORNER_SMOOTH;
}

/**
 * @brief Radius the renderer takes for a frame: the one radius, half the short side by default, 0
 * with four radii.
 * @internal
 */
export function roundOf(r: Radius | null, width: number, height: number): number {
    return typeof r === "number" ? r : r === null ? (width < height ? width : height) * 0.5 : 0;
}
