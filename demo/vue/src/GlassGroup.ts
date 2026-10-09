/**
 * @file GlassGroup.ts
 * @brief Vue provider for a shared glass material.
 * @details Members contribute outlines that merge within spacing; material options belong to the
 * group.
 */

import { defineComponent, inject, provide, shallowReactive, watch, type PropType } from "vue";
import type { Appearance, Preset, Rgba, ShownScheme, Transition } from "glassrender";
import { CANVAS_KEY, GROUP_KEY, type GroupState } from "./context.js";

/** @brief Own one shared glass material while descendant components supply its outlines. */
export const GlassGroup = defineComponent({
    name: "GlassGroup",
    props: {
        /**
         * @brief Distance in CSS pixels over which neighboring members merge (default 0: they only
         * share the glass).
         */
        spacing: { type: Number, default: 0 },
        /** @brief Built-in material (default "standard"). */
        preset: { type: String as PropType<Preset | undefined>, default: undefined },
        /** @brief Surroundings (default: the canvas setting). */
        appearance: { type: String as PropType<Appearance | undefined>, default: undefined },
        /** @brief Color laid over the glass; its alpha is the strength. */
        tint: { type: Array as unknown as PropType<Rgba | null>, default: null },
        /** @brief Opacity of the glass with its shadow (default 1). */
        opacity: { type: Number, default: 1 },
        /** @brief Color-separation multiplier (0..1); null inherits the canvas default. */
        chromaticAberration: { type: Number as PropType<number | null>, default: null },
        /** @brief Shown (default) or hidden. */
        visible: { type: Boolean, default: true },
        /** @brief How visibility changes look (default "materialize"). */
        transition: { type: String as PropType<Transition>, default: "materialize" },
        /** @brief Small glass follows the luminance of the backdrop under it (default true). */
        adaptive: { type: Boolean, default: true }
    },
    emits: {
        /**
         * @brief "dark" or "light" when the scheme the glass shows changes (and once at the start).
         */
        scheme: (_scheme: ShownScheme) => true
    },
    setup(props, { emit, slots }) {
        const canvas = inject(CANVAS_KEY, undefined);
        const state = shallowReactive<GroupState>({ group: null });
        provide(GROUP_KEY, state);

        watch(() => (canvas === undefined ? null : canvas.glass), (glass, _old, onCleanup) => {
            if (glass === null) return;
            const group = glass.addGroup({
                spacing: props.spacing, tint: props.tint, opacity: props.opacity, chromaticAberration: props.chromaticAberration,
                visible: props.visible, transition: props.transition, adaptive: props.adaptive,
                onScheme: (scheme: ShownScheme) => emit("scheme", scheme),
                ...(props.preset === undefined ? {} : { preset: props.preset }), ...(props.appearance === undefined ? {} : { appearance: props.appearance })
            });
            state.group = group;
            onCleanup(() => {
                state.group = null;
                group.remove();
            });
        }, { immediate: true });

        watch(() => props.spacing, (v) => { state.group?.set({ spacing: v }); });
        watch(() => props.preset, (v) => { state.group?.set({ preset: v ?? "standard" }); });
        watch(() => props.appearance, (v) => { if (v !== undefined) state.group?.set({ appearance: v }); });
        watch(() => (props.tint === null ? "" : props.tint.join(",")), () => { state.group?.set({ tint: props.tint }); });
        watch(() => props.opacity, (v) => { state.group?.set({ opacity: v }); });
        watch(() => props.chromaticAberration, (v) => { state.group?.set({ chromaticAberration: v }); });
        watch(() => props.visible, (v) => { state.group?.set({ visible: v }); });
        watch(() => props.transition, (v) => { state.group?.set({ transition: v }); });
        watch(() => props.adaptive, (v) => { state.group?.set({ adaptive: v }); });

        return () => (slots.default === undefined ? null : slots.default());
    }
});
