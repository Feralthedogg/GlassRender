/**
 * @file context.ts
 * @brief React context for the nearest glass canvas and group.
 */

import { createContext, useContext } from "react";
import type { Glass, GlassGroup } from "glassrender";

/**
 * @brief What a `GlassCanvas` shares with the components inside it.
 * @details `glass` is null until the canvas is ready.
 */
export interface CanvasState {
    readonly glass: Glass | null;
    /** @brief Why the canvas could not be used ("" when it works). */
    readonly error: string;
}

export const CanvasContext = createContext<CanvasState | null>(null);
// Undefined means no group; null means the group is still initializing.
export const GroupContext = createContext<GlassGroup | null | undefined>(undefined);

/**
 * @brief The state of the nearest `GlassCanvas`, for low-level calls from a component inside it
 * (null outside a canvas).
 */
export function useGlass(): CanvasState | null {
    return useContext(CanvasContext);
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
