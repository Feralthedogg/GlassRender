// The choices the demo panels offer.

/** Tints for the glass surfaces: straight RGBA in 0 to 1, the last channel being the strength. */
export const TINTS = [
    { name: "None", rgba: null },
    { name: "Blue", rgba: [0.1, 0.5, 1, 0.45] },
    { name: "Rose", rgba: [1, 0.25, 0.5, 0.45] },
    { name: "Mint", rgba: [0.15, 0.85, 0.6, 0.45] },
    { name: "Amber", rgba: [1, 0.68, 0.15, 0.45] }
];

/** Accent colours of the "prominent" preset, which the panels use as their own accent too. */
export const ACCENTS = [
    { name: "Blue", rgb: [0, 0.478, 1] },
    { name: "Violet", rgb: [0.55, 0.33, 1] },
    { name: "Pink", rgb: [1, 0.2, 0.47] },
    { name: "Orange", rgb: [1, 0.55, 0.1] },
    { name: "Green", rgb: [0.15, 0.75, 0.4] }
];

/** Settings of the surroundings, each one a switch in the panels. */
export const ENVIRONMENT = [
    { key: "inactive", label: "Inactive window" },
    { key: "tinted", label: "Tinted" },
    { key: "reduceTransparency", label: "Reduce transparency" },
    { key: "increaseContrast", label: "Increase contrast" },
    { key: "reduceMotion", label: "Reduce motion" },
    { key: "buttonShapes", label: "Button shapes" }
];

/** The built-in preset names in the order the panels list them: the everyday ones first, then "prominent". */
export function presetOrder(names) {
    return ["standard", "clear", "prominent", ...names.filter((p) => p !== "standard" && p !== "clear")];
}

/** A CSS colour from channels in 0 to 1. */
export function cssColor(c) {
    return `rgb(${Math.round(c[0] * 255)} ${Math.round(c[1] * 255)} ${Math.round(c[2] * 255)})`;
}

/** Colour fringes at the rim (the material's `aberration` field), as the panels start them; angles in degrees. */
export const RIM_DEFAULT = { on: false, amount: 10, angle: 0, height: 32, offset: 0 };
/** The lens layer (the material's `lens` field): the unblurred backdrop with its colours pulled apart. */
export const LENS_DEFAULT = { on: false, amount: 6, angle: -15, inset: 60, fade: 24 };

/** Sliders of the rim fringes. */
export const RIM_FIELDS = [
    { key: "amount", label: "Amount", min: 0, max: 40, step: 0.5, unit: "", hint: "Separation of red and blue at the rim, in points" },
    { key: "angle", label: "Angle", min: -180, max: 180, step: 1, unit: "°", hint: "Turn of the direction the colours separate along" },
    { key: "height", label: "Height", min: 0, max: 120, step: 1, unit: "", hint: "Depth over which the separation falls to zero (0: a constant band)" },
    { key: "offset", label: "Offset", min: 0, max: 60, step: 1, unit: "", hint: "Depth of the band at full separation" }
];
/** Sliders of the lens layer. */
export const LENS_FIELDS = [
    { key: "amount", label: "Amount", min: 0, max: 30, step: 0.5, unit: "", hint: "Separation of the colours, in points" },
    { key: "angle", label: "Angle", min: -180, max: 180, step: 1, unit: "°", hint: "Turn of the direction the colours separate along" },
    { key: "inset", label: "Inset", min: 0, max: 120, step: 1, unit: "", hint: "Depth of the band at full separation" },
    { key: "fade", label: "Fade", min: 0, max: 120, step: 1, unit: "", hint: "Depth over which the layer fades in from the rim" }
];

/**
 * The material fields for the colour fringes, or null when both are off. `base` is the capture margin the preset
 * gets on its own: the capture has to reach that far past the outline and as far again as the colours are pulled.
 */
export function fringeMaterial(rim, lens, base) {
    if (!rim.on && !lens.on) return null;
    const deg = Math.PI / 180, m = {};
    if (rim.on) m.aberration = { amount: rim.amount, angle: rim.angle * deg, height: rim.height, offset: rim.offset };
    if (lens.on) m.lens = { amount: lens.amount, angle: lens.angle * deg, inset: lens.inset, distances: [-lens.fade, 0], opacities: [1, 0] };
    m.margin = Math.ceil(base + Math.max(rim.on ? rim.amount : 0, lens.on ? lens.amount : 0));
    return m;
}

/** The material as it would be written in code, rounded for reading and wrapped at `width` characters. */
export function materialCode(material, width = 36) {
    if (material === null) return "material: null";
    const n = (v) => String(Math.round(v * 1000) / 1000);
    const value = (v) => (Array.isArray(v) ? "[" + v.map(n).join(", ") + "]" : n(v));
    const lines = [];
    for (const [key, v] of Object.entries(material)) {
        if (typeof v === "number") { lines.push(`  ${key}: ${n(v)},`); continue; }
        const parts = Object.entries(v).map(([k, x]) => k + ": " + value(x));
        let line = `  ${key}: {`;
        parts.forEach((part, i) => {
            const piece = " " + part + (i < parts.length - 1 ? "," : " },");
            if (line.length + piece.length > width && !line.endsWith("{")) { lines.push(line); line = "   "; }
            line += piece;
        });
        lines.push(line);
    }
    const last = lines.length - 1;
    lines[last] = (lines[last] ?? "").replace(/,$/, "");
    return "material: {\n" + lines.join("\n") + "\n}";
}
