<!--
    Glass shared by the `Glass` components inside it: their boxes become one piece of glass, and neighbours closer
    than `spacing` flow into each other. Material options are set here; the members only give their boxes.
-->
<script lang="ts">
    import { getContext, setContext, untrack, type Snippet } from "svelte";
    import type { Appearance, MaterialSpec, Preset, Rgba, ShownScheme, Transition } from "glassrender";
    import { CANVAS_KEY, GROUP_KEY, type CanvasState, type GroupState } from "./context.js";

    interface Props {
        /** Distance in CSS pixels over which neighbouring members merge (default 0: they only share the glass). */
        spacing?: number;
        /** Built-in material (default "standard"). */
        preset?: Preset;
        /** Surroundings (default: the canvas setting). */
        appearance?: Appearance;
        /** Fields replacing those of the preset's description. */
        material?: Partial<MaterialSpec> | null;
        /** Colour laid over the glass; its alpha is the strength. */
        tint?: Rgba | null;
        /** Opacity of the glass with its shadow (default 1). */
        opacity?: number;
        /** Shown (default) or hidden. */
        visible?: boolean;
        /** How visibility changes look (default "materialize"). */
        transition?: Transition;
        /** Small glass follows the luminance of the backdrop under it (default true). */
        adaptive?: boolean;
        /** Called with "dark" or "light" when the scheme the glass shows changes (and once at the start). */
        onscheme?: (scheme: ShownScheme) => void;
        children?: Snippet;
    }

    let {
        spacing = 0, preset = "standard", appearance, material = null, tint = null, opacity = 1, visible = true,
        transition = "materialize", adaptive = true, onscheme, children
    }: Props = $props();

    const canvas = getContext<CanvasState | undefined>(CANVAS_KEY);
    const state: GroupState = $state({ group: null });
    setContext(GROUP_KEY, state);

    $effect(() => {
        const glass = canvas?.glass ?? null;
        if (glass === null) return;
        const group = glass.addGroup(untrack(() => ({
            spacing, preset, material, tint, opacity, visible, transition, adaptive,
            onScheme: (scheme: ShownScheme) => onscheme?.(scheme), ...(appearance === undefined ? {} : { appearance })
        })));
        state.group = group;
        return () => {
            state.group = null;
            group.remove();
        };
    });

    $effect(() => { const v = spacing; untrack(() => state.group?.set({ spacing: v })); });
    $effect(() => { const v = preset; untrack(() => state.group?.set({ preset: v })); });
    $effect(() => { const v = appearance; if (v !== undefined) untrack(() => state.group?.set({ appearance: v })); });
    $effect(() => { const v = material; untrack(() => state.group?.set({ material: v })); });
    $effect(() => { const v = tint; untrack(() => state.group?.set({ tint: v })); });
    $effect(() => { const v = opacity; untrack(() => state.group?.set({ opacity: v })); });
    $effect(() => { const v = visible; untrack(() => state.group?.set({ visible: v })); });
    $effect(() => { const v = transition; untrack(() => state.group?.set({ transition: v })); });
    $effect(() => { const v = adaptive; untrack(() => state.group?.set({ adaptive: v })); });
</script>

{@render children?.()}
