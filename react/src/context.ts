// Context shared by the components: the glass of the nearest canvas and the group a member belongs to.
import { createContext, useContext } from "react";
import type { Glass, GlassGroup } from "glassrender";

/** What a `GlassCanvas` shares with the components inside it. `glass` is null until the canvas is ready. */
export interface CanvasState {
    readonly glass: Glass | null;
    /** Why the canvas could not be used ("" when it works). */
    readonly error: string;
}

export const CanvasContext = createContext<CanvasState | null>(null);
// undefined outside a group; null while the group is being made
export const GroupContext = createContext<GlassGroup | null | undefined>(undefined);

/** The state of the nearest `GlassCanvas`, for low-level calls from a component inside it (null outside a canvas). */
export function useGlass(): CanvasState | null {
    return useContext(CanvasContext);
}

/**
 * Content takes the colour for the glass it sits on. The rule has no specificity, so any rule of the page wins.
 */
export function ensureStyle(): void {
    if (typeof document === "undefined" || document.getElementById("glassrender-style") !== null) return;
    const s = document.createElement("style");
    s.id = "glassrender-style";
    s.textContent = ":where(.glass-box){color:var(--glass-foreground,inherit)}";
    document.head.appendChild(s);
}
