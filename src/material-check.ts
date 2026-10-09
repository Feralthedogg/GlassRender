/**
 * @file material-check.ts
 * @brief Validation rules for material descriptions.
 * @details Validation runs when a description changes, outside the renderer's frame path.
 */

/** @brief First invalid material field, its rule code and diagnostic. */
export interface MaterialIssue {
    readonly path: string;
    readonly code: string;
    readonly message: string;
}

interface Rule {
    readonly path: string;
    readonly kind: number;
    readonly required: boolean;
    readonly min: number;
    readonly max: number;
    readonly length: number;
    readonly ordered: boolean;
    readonly fields: Schema | null;
    readonly disable: boolean;
}
type Schema = Readonly<Record<string, Rule>>;
const NUMBER = 0, BOOLEAN = 1, ARRAY = 2, OBJECT = 3;

function number(path: string, required = false, min = -Infinity, max = Infinity): Rule {
    return { path, kind: NUMBER, required, min, max, length: 0, ordered: false, fields: null, disable: false };
}
function bool(path: string): Rule {
    return { ...number(path), kind: BOOLEAN };
}
function list(path: string, length: number, ordered = false, min = -Infinity, max = Infinity): Rule {
    return { ...number(path, false, min, max), kind: ARRAY, length, ordered };
}
function object(path: string, fields: Schema, required = false, disable = false): Rule {
    return { ...number(path, required), kind: OBJECT, fields, disable };
}
function tone(path: string): Record<string, Rule> {
    return { white: number(path + ".white"), black: number(path + ".black"), saturation: number(path + ".saturation"), fill: list(path + ".fill", 4) };
}
function lens(path: string): Schema {
    return { amount: number(path + ".amount", true), height: number(path + ".height", true) };
}
function light(path: string): Schema {
    return { ...tone(path), opacity: number(path + ".opacity"), amount: number(path + ".amount"), height: number(path + ".height", true),
        spread: number(path + ".spread", true), curvature: number(path + ".curvature"), dodge: list(path + ".dodge", 4) };
}

const RAW: Schema = {
    backdropScale: number("backdropScale"),
    blur: object("blur", { radius: number("blur.radius", true), opacities: list("blur.opacities", 4), distances: list("blur.distances", 4, true) }),
    blurFill: object("blurFill", { radius: number("blurFill.radius", true), darken: number("blurFill.darken"), lighten: number("blurFill.lighten"), normal: number("blurFill.normal") }),
    refraction: object("refraction", { inner: object("refraction.inner", lens("refraction.inner")), outer: object("refraction.outer", lens("refraction.outer")),
        outerOpacity: number("refraction.outerOpacity"), outerDistances: list("refraction.outerDistances", 2) }),
    face: object("face", { ...tone("face"), opacity: number("face.opacity"), maxLuminance: number("face.maxLuminance"), maxLuminanceStandard: number("face.maxLuminanceStandard") }),
    bleed: object("bleed", { ...tone("bleed"), opacity: number("bleed.opacity", true), amount: number("bleed.amount", true), height: number("bleed.height", true),
        radius: number("bleed.radius", true), distances: list("bleed.distances", 2), darken: bool("bleed.darken") }),
    shadow: object("shadow", { ...tone("shadow"), opacity: number("shadow.opacity", true), radius: number("shadow.radius", true), offsetX: number("shadow.offsetX"),
        offsetY: number("shadow.offsetY"), amount: number("shadow.amount"), height: number("shadow.height"), inset: number("shadow.inset"), blur: number("shadow.blur"), backdropMix: number("shadow.backdropMix") }),
    ringShadow: object("ringShadow", { opacity: number("ringShadow.opacity", true), radius: number("ringShadow.radius", true), width: number("ringShadow.width", true), offset: number("ringShadow.offset", true), mask: number("ringShadow.mask") }),
    edgeShade: object("edgeShade", { amount: number("edgeShade.amount", true), angle: number("edgeShade.angle"), bias: number("edgeShade.bias", true), height: number("edgeShade.height", true),
        offset: number("edgeShade.offset"), spread: number("edgeShade.spread", true), spreadStandard: number("edgeShade.spreadStandard") }),
    rim: object("rim", { key: object("rim.key", light("rim.key"), true), fill: object("rim.fill", light("rim.fill"), true), angle: number("rim.angle"), inset: number("rim.inset"),
        diffuse: object("rim.diffuse", { amount: number("rim.diffuse.amount", true), height: number("rim.diffuse.height", true), spread: number("rim.diffuse.spread", true) }) }),
    aberration: object("aberration", { amount: number("aberration.amount", true), angle: number("aberration.angle"), height: number("aberration.height"), offset: number("aberration.offset") }),
    lens: object("lens", { amount: number("lens.amount", true), angle: number("lens.angle"), height: number("lens.height"), inset: number("lens.inset"), distances: list("lens.distances", 2), opacities: list("lens.opacities", 2) }),
    hold: object("hold", { start: number("hold.start", true), end: number("hold.end", true), white: number("hold.white", true) }),
    limit: number("limit"), keepHue: bool("keepHue"), roundness: number("roundness"), headroom: number("headroom"), rangeShare: number("rangeShare"), margin: number("margin")
};

function issue(path: string, code: string, text: string): MaterialIssue {
    return { path, code, message: path + " " + text };
}

// Precomputed paths keep successful validation free of temporary paths and issue records.
function check(value: unknown, fields: Schema, path: string, authored = false): MaterialIssue | null {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return issue(path || "material", "object", "must be an object");
    const v = value as Record<string, unknown>;
    for (const key in v) {
        if (!Object.hasOwn(v, key)) continue;
        if (!Object.hasOwn(fields, key)) return issue(path === "" ? key : path + "." + key, "unknown", "is not a supported field");
    }
    for (const key in fields) {
        const r = fields[key] as Rule, x = v[key];
        if (x === undefined) { if (r.required) return issue(r.path, "required", "is required"); else continue; }
        if (r.disable && x === false) continue;
        if (r.kind === OBJECT) { const bad = check(x, r.fields as Schema, r.path, authored); if (bad !== null) return bad; }
        else if (r.kind === BOOLEAN) { if (typeof x !== "boolean") return issue(r.path, "boolean", "must be a boolean"); }
        else if (r.kind === ARRAY) {
            if (!Array.isArray(x) || x.length !== r.length) return issue(r.path, "length", "must hold " + r.length + " numbers (has " + (Array.isArray(x) ? x.length : typeof x) + ")");
            for (let i = 0; i < x.length; i++) {
                const n: unknown = x[i];
                if (typeof n !== "number" || !Number.isFinite(n)) return issue(r.path + "[" + i + "]", "finite", "must be a finite number");
                if (n < r.min || n > r.max) return issue(r.path + "[" + i + "]", "range", "is outside the supported range");
                if (authored && Math.abs(n) > 1e6) return issue(r.path + "[" + i + "]", "range", "exceeds the supported numeric range");
                if (r.ordered && i > 0 && n < (x[i - 1] as number)) return issue(r.path, "order", "must be non-decreasing");
            }
        } else {
            if (typeof x !== "number" || !Number.isFinite(x)) return issue(r.path, "finite", "must be a finite number");
            if (x < r.min || x > r.max) return issue(r.path, "range", "is outside the supported range");
            if (authored && Math.abs(x) > 1e6) return issue(r.path, "range", "exceeds the supported numeric range");
            if (authored && x > 0 && x < 1e-4 && (key === "depth" || key === "width" || key === "radius")) return issue(r.path, "range", "must be zero or at least 0.0001 CSS pixels");
        }
    }
    return null;
}

/**
 * @brief Validate before converting raw input into a numeric vector.
 * @internal
 */
export function rawMaterialIssue(value: unknown): MaterialIssue | null { return check(value, RAW, ""); }
