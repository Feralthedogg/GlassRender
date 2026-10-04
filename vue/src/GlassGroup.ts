// Glass shared by the `Glass` components inside it: their boxes become one piece of glass, and neighbours closer
// than `spacing` flow into each other. Material options are set here; the members only give their boxes.
import { defineComponent, inject, provide, shallowReactive, watch, type PropType } from "vue";
import type { Appearance, MaterialSpec, Preset, Rgba, ShownScheme, Transition } from "glassrender";
import { CANVAS_KEY, GROUP_KEY, type GroupState } from "./context.js";

export const GlassGroup = defineComponent({
    name: "GlassGroup",
    props: {
        /** Distance in CSS pixels over which neighbouring members merge (default 0: they only share the glass). */
        spacing: { type: Number, default: 0 },
        /** Built-in material (default "standard"). */
        preset: { type: String as PropType<Preset>, default: "standard" },
        /** Surroundings (default: the canvas setting). */
        appearance: { type: String as PropType<Appearance | undefined>, default: undefined },
        /** Fields replacing those of the preset's description. */
        material: { type: Object as PropType<Partial<MaterialSpec> | null>, default: null },
        /** Colour laid over the glass; its alpha is the strength. */
        tint: { type: Array as unknown as PropType<Rgba | null>, default: null },
        /** Opacity of the glass with its shadow (default 1). */
        opacity: { type: Number, default: 1 },
        /** Shown (default) or hidden. */
        visible: { type: Boolean, default: true },
        /** How visibility changes look (default "materialize"). */
        transition: { type: String as PropType<Transition>, default: "materialize" },
        /** Small glass follows the luminance of the backdrop under it (default true). */
        adaptive: { type: Boolean, default: true }
    },
    emits: {
        /** "dark" or "light" when the scheme the glass shows changes (and once at the start). */
        scheme: (_scheme: ShownScheme) => true
    },
    setup(props, { emit, slots }) {
        const canvas = inject(CANVAS_KEY, undefined);
        const state = shallowReactive<GroupState>({ group: null });
        provide(GROUP_KEY, state);

        watch(() => (canvas === undefined ? null : canvas.glass), (glass, _old, onCleanup) => {
            if (glass === null) return;
            const group = glass.addGroup({
                spacing: props.spacing, preset: props.preset, material: props.material, tint: props.tint, opacity: props.opacity,
                visible: props.visible, transition: props.transition, adaptive: props.adaptive,
                onScheme: (scheme: ShownScheme) => emit("scheme", scheme),
                ...(props.appearance === undefined ? {} : { appearance: props.appearance })
            });
            state.group = group;
            onCleanup(() => {
                state.group = null;
                group.remove();
            });
        }, { immediate: true });

        watch(() => props.spacing, (v) => { state.group?.set({ spacing: v }); });
        watch(() => props.preset, (v) => { state.group?.set({ preset: v }); });
        watch(() => props.appearance, (v) => { if (v !== undefined) state.group?.set({ appearance: v }); });
        watch(() => props.material, (v) => { state.group?.set({ material: v }); });
        watch(() => (props.tint === null ? "" : props.tint.join(",")), () => { state.group?.set({ tint: props.tint }); });
        watch(() => props.opacity, (v) => { state.group?.set({ opacity: v }); });
        watch(() => props.visible, (v) => { state.group?.set({ visible: v }); });
        watch(() => props.transition, (v) => { state.group?.set({ transition: v }); });
        watch(() => props.adaptive, (v) => { state.group?.set({ adaptive: v }); });

        return () => (slots.default === undefined ? null : slots.default());
    }
});
