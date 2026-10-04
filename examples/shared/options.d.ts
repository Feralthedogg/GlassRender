/** A tint for the glass surfaces. */
export interface TintChoice {
    readonly name: string;
    readonly rgba: readonly [number, number, number, number] | null;
}

/** An accent colour. */
export interface AccentChoice {
    readonly name: string;
    readonly rgb: readonly [number, number, number];
}

/** A switch of the surroundings. */
export interface EnvironmentChoice {
    readonly key: "inactive" | "tinted" | "reduceTransparency" | "increaseContrast" | "reduceMotion" | "buttonShapes";
    readonly label: string;
}

/** Tints for the glass surfaces: straight RGBA in 0 to 1, the last channel being the strength. */
export declare const TINTS: readonly [TintChoice, ...TintChoice[]];
/** Accent colours of the "prominent" preset, which the panels use as their own accent too. */
export declare const ACCENTS: readonly [AccentChoice, ...AccentChoice[]];
/** Settings of the surroundings, each one a switch in the panels. */
export declare const ENVIRONMENT: readonly EnvironmentChoice[];
/** The built-in preset names in the order the panels list them: the everyday ones first, then "prominent". */
export declare function presetOrder<T extends string>(names: readonly T[]): (T | "prominent")[];
/** A CSS colour from channels in 0 to 1. */
export declare function cssColor(c: readonly number[]): string;

/** Colour fringes at the rim (the material's `aberration` field); angles in degrees. */
export interface RimFringes {
    readonly on: boolean;
    readonly amount: number;
    readonly angle: number;
    readonly height: number;
    readonly offset: number;
}

/** The lens layer (the material's `lens` field); angles in degrees. */
export interface LensFringes {
    readonly on: boolean;
    readonly amount: number;
    readonly angle: number;
    readonly inset: number;
    readonly fade: number;
}

/** A slider of a fringe setting. */
export interface FringeField<K extends string> {
    readonly key: K;
    readonly label: string;
    readonly min: number;
    readonly max: number;
    readonly step: number;
    readonly unit: string;
    readonly hint: string;
}

/** The material fields the fringe settings make. */
export interface FringeMaterial {
    readonly aberration?: { readonly amount: number; readonly angle: number; readonly height: number; readonly offset: number };
    readonly lens?: {
        readonly amount: number; readonly angle: number; readonly inset: number;
        readonly distances: readonly [number, number]; readonly opacities: readonly [number, number];
    };
    readonly margin: number;
}

/** Colour fringes at the rim, as the panels start them. */
export declare const RIM_DEFAULT: RimFringes;
/** The lens layer, as the panels start it. */
export declare const LENS_DEFAULT: LensFringes;
/** Sliders of the rim fringes. */
export declare const RIM_FIELDS: readonly FringeField<"amount" | "angle" | "height" | "offset">[];
/** Sliders of the lens layer. */
export declare const LENS_FIELDS: readonly FringeField<"amount" | "angle" | "inset" | "fade">[];
/** The material fields for the colour fringes, or null when both are off; `base` is the preset's own capture margin. */
export declare function fringeMaterial(rim: RimFringes, lens: LensFringes, base: number): FringeMaterial | null;
/** The material as it would be written in code, rounded for reading and wrapped at `width` characters (default 36). */
export declare function materialCode(material: FringeMaterial | null, width?: number): string;
