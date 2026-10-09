/**
 * @file material-catalog.ts
 * @brief Built-in material metadata and canonical role aliases.
 */

import { PRESET_NAMES, presetFollows, presetNumber, presetSide } from "./preset.js";
import type { Preset } from "./glass/types.js";

/**
 * @brief Frozen metadata for one built-in material role.
 * @details Aliases retain their role name while `canonical` identifies the shared profile.
 */
export interface MaterialInfo {
    readonly name: Preset;
    readonly canonical: Preset;
    readonly aliases: readonly Preset[];
    readonly category: "surface" | "lens" | "decoration" | "diagnostic";
    readonly description: string;
    readonly recommendedUses: readonly string[];
    readonly adaptation: "eligible-small-surface" | "fixed";
    readonly fixedShortSide: number | null;
    readonly status: "supported" | "specialist" | "experimental";
}
const ALIASES: Readonly<Partial<Record<Preset, Preset>>> = { player: "clear", call: "clear", inspector: "attachedSidebar", focusBackground: "focusRing" };
const DESCRIPTIONS: Readonly<Record<Preset, string>> = {
    standard: "General-purpose frosted content surface.", clear: "Transparent glass with pronounced edge refraction.",
    identity: "Unmodified backdrop, for passthrough and diagnostics.", menu: "Menu surface with eligible small-surface adaptation.", notification: "Frosted notification surface.",
    popover: "Frosted popover surface.", sidebar: "Frosted sidebar surface.", attachedSidebar: "Subdued connected surface.", inspector: "Inspector role alias of attachedSidebar.",
    dock: "Dock surface with a fixed short-side class of 160.", controlPanel: "Transparent control-panel surface.", keyboard: "Dense, neutral surface for controls.",
    widget: "Widget surface with visible backdrop detail.", icon: "Icon-oriented optical surface.", player: "Video-control role alias of clear.", call: "Call-interface role alias of clear.",
    camera: "Dark, desaturated camera-control surface.", control: "Small control lens with color separation.", loupe: "Specialist edge-refraction lens.", slider: "Lens for a slider thumb or handle.",
    monogram: "Highlight-oriented lens for short labels and icon shapes.", bubble: "Frosted content material; geometry supplies the bubble outline.", text: "Specialist input-field surface.",
    assistant: "Colorful blurred assistant surface.", assistantCard: "More opaque assistant reading surface.", focusRing: "Focus decoration material; geometry and focus behavior are supplied by the app.",
    focusBackground: "Focus-decoration role alias of focusRing.", vehicle: "Experimental vehicle-oriented passthrough profile."
};
const NAMES: readonly Preset[] = PRESET_NAMES;
const byName: Partial<Record<Preset, MaterialInfo>> = {};

/** @brief Frozen material metadata, ordered with the everyday choices first. */
export const MATERIALS: readonly MaterialInfo[] = Object.freeze(NAMES.map(name => {
    const canonical = ALIASES[name] ?? name, number = presetNumber(name);
    const category = name === "identity" ? "diagnostic" : name === "focusRing" || name === "focusBackground" ? "decoration"
        : ["control", "loupe", "slider", "monogram", "icon"].includes(name) ? "lens" : "surface";
    const fixed = presetSide(number);
    const info: MaterialInfo = Object.freeze({ name, canonical, aliases: Object.freeze(NAMES.filter(n => n !== canonical && (ALIASES[n] ?? n) === canonical)),
        category, description: DESCRIPTIONS[name], recommendedUses: Object.freeze([name]),
        adaptation: presetFollows(number, 0) ? "eligible-small-surface" : "fixed", fixedShortSide: fixed > 0 ? fixed : null,
        status: name === "vehicle" ? "experimental" : ["standard", "clear"].includes(name) ? "supported" : "specialist" });
    byName[name] = info;
    return info;
}));

/** @brief Read metadata by name, or null for an unknown preset. */
export function getMaterialInfo(name: string): MaterialInfo | null { return Object.hasOwn(byName, name) ? byName[name as Preset] ?? null : null; }
