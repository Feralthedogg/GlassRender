/**
 * @file environment.ts
 * @brief Device preferences and foreground colors for material surroundings.
 */

import {
    ENV_BUTTON_SHAPES, ENV_INACTIVE, ENV_INCREASE_CONTRAST, ENV_REDUCE_MOTION, ENV_REDUCE_TRANSPARENCY, ENV_TINTED, SCHEME_DARK,
    type Scheme
} from "../layout.js";
import type { EnvironmentOptions, Follow, Foreground } from "./types.js";

// Foreground colors for ordinary content and control titles on dark and light glass.
const DARK: Foreground = { text: "rgba(255, 255, 255, 0.898)", title: "rgba(255, 255, 255, 0.95)" };
const LIGHT: Foreground = { text: "rgba(0, 0, 0, 0.847)", title: "rgb(0, 0, 0)" };

/**
 * @brief Colors for content on glass of a scheme.
 * @internal
 */
export function foregroundOf(scheme: Scheme): Foreground {
    return scheme === SCHEME_DARK ? DARK : LIGHT;
}

function query(text: string): MediaQueryList | null {
    return typeof matchMedia === "function" ? matchMedia(text) : null;
}

/**
 * @brief Media queries and page focus behind the "auto" settings.
 * @internal
 */
export class Surroundings {
    private readonly darkQuery: MediaQueryList | null;
    private readonly opaqueQuery: MediaQueryList | null;
    private readonly contrastQuery: MediaQueryList | null;
    private readonly motionQuery: MediaQueryList | null;
    private readonly rangeQuery: MediaQueryList | null;
    private readonly onChange: () => void;
    private focusWatched: boolean;

    constructor(onChange: () => void) {
        this.darkQuery = query("(prefers-color-scheme: dark)");
        this.opaqueQuery = query("(prefers-reduced-transparency: reduce)");
        this.contrastQuery = query("(prefers-contrast: more)");
        this.motionQuery = query("(prefers-reduced-motion: reduce)");
        this.rangeQuery = query("(dynamic-range: high)");
        this.onChange = onChange;
        this.focusWatched = false;
        if (this.darkQuery !== null) this.darkQuery.addEventListener("change", onChange);
        if (this.opaqueQuery !== null) this.opaqueQuery.addEventListener("change", onChange);
        if (this.contrastQuery !== null) this.contrastQuery.addEventListener("change", onChange);
        if (this.motionQuery !== null) this.motionQuery.addEventListener("change", onChange);
        if (this.rangeQuery !== null) this.rangeQuery.addEventListener("change", onChange);
    }

    /** @brief The page prefers a dark color scheme (true where that cannot be asked). */
    get dark(): boolean {
        return this.darkQuery === null || this.darkQuery.matches;
    }

    /** @brief The screen shows values above the standard white. */
    get highRange(): boolean {
        return this.rangeQuery !== null && this.rangeQuery.matches;
    }

    /**
     * @brief `ENV_*` bits for the options, with "auto" resolved from the device and the page.
     */
    bits(o: EnvironmentOptions): number {
        const active = o.active ?? true;
        this.watchFocus(active === "auto");
        const on = active === "auto" ? typeof document === "undefined" || document.hasFocus() : active;
        return (on ? 0 : ENV_INACTIVE) | (o.tinted === true ? ENV_TINTED : 0)
            | (this.follow(o.reduceTransparency, this.opaqueQuery) ? ENV_REDUCE_TRANSPARENCY : 0)
            | (this.follow(o.increaseContrast, this.contrastQuery) ? ENV_INCREASE_CONTRAST : 0)
            | (this.follow(o.reduceMotion, this.motionQuery) ? ENV_REDUCE_MOTION : 0) | (o.buttonShapes === true ? ENV_BUTTON_SHAPES : 0);
    }

    /** @brief Drop every listener. */
    release(): void {
        const f = this.onChange;
        if (this.darkQuery !== null) this.darkQuery.removeEventListener("change", f);
        if (this.opaqueQuery !== null) this.opaqueQuery.removeEventListener("change", f);
        if (this.contrastQuery !== null) this.contrastQuery.removeEventListener("change", f);
        if (this.motionQuery !== null) this.motionQuery.removeEventListener("change", f);
        if (this.rangeQuery !== null) this.rangeQuery.removeEventListener("change", f);
        this.watchFocus(false);
    }

    private follow(v: Follow | undefined, q: MediaQueryList | null): boolean {
        return v === undefined || v === "auto" ? q !== null && q.matches : v;
    }

    private watchFocus(on: boolean): void {
        if (on === this.focusWatched || typeof addEventListener !== "function") return;
        this.focusWatched = on;
        if (on) { addEventListener("focus", this.onChange); addEventListener("blur", this.onChange); }
        else { removeEventListener("focus", this.onChange); removeEventListener("blur", this.onChange); }
    }
}
