import { createContext, useContext, type Accessor } from "solid-js";
import type { Glass, GlassGroup } from "glassrender";

/** Reactive getters: keep the state object intact when reading it in effects. */
export interface CanvasState {
    readonly glass: Glass | null;
    readonly error: string;
}

export const CanvasContext = createContext<CanvasState | null>(null);
export const GroupContext = createContext<Accessor<GlassGroup | null>>();

export function useGlass(): CanvasState | null { return useContext(CanvasContext); }

export function ensureStyle(): void {
    if (typeof document === "undefined" || document.getElementById("glassrender-style")) return;
    const style = document.createElement("style");
    style.id = "glassrender-style";
    style.textContent = ":where(.glass-box){color:var(--glass-foreground,inherit)}";
    document.head.appendChild(style);
}
