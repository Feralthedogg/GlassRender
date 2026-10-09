/**
 * @file context.ts
 * @brief Vue context for the nearest glass canvas and group.
 */

import { inject, type InjectionKey } from "vue";
import type { Glass, GlassGroup } from "glassrender";

/**
 * @brief What a `GlassCanvas` shares with the components inside it.
 * @details `glass` is null until the canvas is ready.
 */
export interface CanvasState {
    glass: Glass | null;
    /** @brief Why the canvas could not be used ("" when it works). */
    error: string;
}

/** @brief What a `GlassGroup` shares with its members. */
export interface GroupState {
    group: GlassGroup | null;
}

export const CANVAS_KEY: InjectionKey<CanvasState> = Symbol("glass-canvas");
export const GROUP_KEY: InjectionKey<GroupState> = Symbol("glass-group");

/**
 * @brief The state of the nearest `GlassCanvas`, for low-level calls from a component inside it
 * (call it in `setup`).
 * @details Its `glass` field is reactive.
 */
export function useGlass(): CanvasState | undefined {
    return inject(CANVAS_KEY, undefined);
}

/**
 * @brief Content takes the color for the glass it sits on.
 * @details The rule has no specificity, so any rule of the page wins.
 */
export function ensureStyle(): void {
    if (typeof document === "undefined" || document.getElementById("glassrender-style") !== null) return;
    const s = document.createElement("style");
    s.id = "glassrender-style";
    s.textContent = ":where(.glass-box){color:var(--glass-foreground,inherit)}";
    document.head.appendChild(s);
}
