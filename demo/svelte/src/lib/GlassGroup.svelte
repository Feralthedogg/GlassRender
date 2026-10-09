<script lang="ts">
    /**
     * @file GlassGroup.svelte
     * @brief Svelte provider for a shared glass material.
     * @details Members contribute outlines that merge within spacing; material options belong to the
     * group.
     */

    import { getContext, setContext, untrack, type Snippet } from "svelte";
    import type { Appearance, Preset, Rgba, ShownScheme, Transition } from "glassrender";
    import { CANVAS_KEY, GROUP_KEY, type CanvasState, type GroupState } from "./context.js";

    /** @brief Shared material and merge distance for descendant glass outlines. */
    interface Props {
        /**
         * @brief Distance in CSS pixels over which neighboring members merge (default 0: they only
         * share the glass).
         */
        spacing?: number;
        /** @brief Built-in material (default "standard"). */
        preset?: Preset;
        /** @brief Surroundings (default: the canvas setting). */
        appearance?: Appearance;
        /** @brief Color laid over the glass; its alpha is the strength. */
        tint?: Rgba | null;
        /** @brief Opacity of the glass with its shadow (default 1). */
        opacity?: number;
        /** @brief Color-separation multiplier (0..1); null inherits the canvas default. */
        chromaticAberration?: number | null;
        /** @brief Shown (default) or hidden. */
        visible?: boolean;
        /** @brief How visibility changes look (default "materialize"). */
        transition?: Transition;
        /** @brief Small glass follows the luminance of the backdrop under it (default true). */
        adaptive?: boolean;
        /**
         * @brief Called with "dark" or "light" when the scheme the glass shows changes (and once at
         * the start).
         */
        onscheme?: (scheme: ShownScheme) => void;
        children?: Snippet;
    }

    let {
        spacing = 0, preset, appearance, tint = null, opacity = 1, chromaticAberration = null, visible = true,
        transition = "materialize", adaptive = true, onscheme, children
    }: Props = $props();

    const canvas = getContext<CanvasState | undefined>(CANVAS_KEY);
    const state: GroupState = $state({ group: null });
    setContext(GROUP_KEY, state);

    $effect(() => {
        const glass = canvas?.glass ?? null;
        if (glass === null) return;
        const group = glass.addGroup(untrack(() => ({
            spacing, tint, opacity, chromaticAberration, visible, transition, adaptive,
            onScheme: (scheme: ShownScheme) => onscheme?.(scheme), ...(preset === undefined ? {} : { preset }), ...(appearance === undefined ? {} : { appearance })
        })));
        state.group = group;
        return () => {
            state.group = null;
            group.remove();
        };
    });

    $effect(() => { const v = spacing; untrack(() => state.group?.set({ spacing: v })); });
    $effect(() => { const v = preset ?? "standard"; untrack(() => state.group?.set({ preset: v })); });
    $effect(() => { const v = appearance; if (v !== undefined) untrack(() => state.group?.set({ appearance: v })); });
    $effect(() => { const v = tint; untrack(() => state.group?.set({ tint: v })); });
    $effect(() => { const v = opacity; untrack(() => state.group?.set({ opacity: v })); });
    $effect(() => { const v = chromaticAberration; untrack(() => state.group?.set({ chromaticAberration: v })); });
    $effect(() => { const v = visible; untrack(() => state.group?.set({ visible: v })); });
    $effect(() => { const v = transition; untrack(() => state.group?.set({ transition: v })); });
    $effect(() => { const v = adaptive; untrack(() => state.group?.set({ adaptive: v })); });
</script>

{@render children?.()}
