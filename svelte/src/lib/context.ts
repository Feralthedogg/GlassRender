// Context shared by the components: the glass of the nearest canvas and the group a member belongs to.
import { getContext } from "svelte";
import type { Glass, GlassGroup } from "glassrender";

export const CANVAS_KEY = Symbol("glass-canvas");
export const GROUP_KEY = Symbol("glass-group");

/** What a `GlassCanvas` shares with the components inside it. `glass` is null until the canvas is ready. */
export interface CanvasState {
    glass: Glass | null;
    /** Why the canvas could not be used ("" when it works). */
    error: string;
}

/** What a `GlassGroup` shares with its members. */
export interface GroupState {
    group: GlassGroup | null;
}

/**
 * The state of the nearest `GlassCanvas`, for low-level calls from a component inside it (call it while the
 * component is set up). Its `glass` field is reactive.
 */
export function getGlass(): CanvasState | undefined {
    return getContext<CanvasState | undefined>(CANVAS_KEY);
}
