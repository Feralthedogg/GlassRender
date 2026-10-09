import { createEffect, createSignal, onCleanup, untrack, useContext, type JSX } from "solid-js";
import type { GlassGroup as CoreGroup, MaterialOptions } from "glassrender";
import { CanvasContext, GroupContext } from "./context.js";

export interface GlassGroupProps extends MaterialOptions { spacing?: number; children?: JSX.Element; }

export function GlassGroup(props: GlassGroupProps): JSX.Element {
    const canvas = useContext(CanvasContext), [group, setGroup] = createSignal<CoreGroup | null>(null);
    createEffect(() => {
        const instance = canvas?.glass;
        if (!instance) return;
        untrack(() => {
            const current = instance.addGroup({ spacing: props.spacing ?? 0, preset: props.preset ?? "standard", appearance: props.appearance,
                tint: props.tint ?? null, opacity: props.opacity ?? 1, chromaticAberration: props.chromaticAberration ?? null,
                visible: props.visible ?? true, transition: props.transition ?? "materialize", adaptive: props.adaptive ?? true,
                pressed: props.pressed ?? false, onScheme: scheme => props.onScheme?.(scheme) });
            setGroup(current); onCleanup(() => { setGroup(null); current.remove(); });
        });
    });
    createEffect(() => { group()?.set({ spacing: props.spacing ?? 0 }); });
    createEffect(() => { group()?.set({ preset: props.preset ?? "standard" }); });
    createEffect(() => { if (props.appearance !== undefined) group()?.set({ appearance: props.appearance }); });
    createEffect(() => { group()?.set({ tint: props.tint ?? null }); });
    createEffect(() => { group()?.set({ opacity: props.opacity ?? 1 }); });
    createEffect(() => { group()?.set({ chromaticAberration: props.chromaticAberration ?? null }); });
    createEffect(() => { group()?.set({ visible: props.visible ?? true }); });
    createEffect(() => { group()?.set({ transition: props.transition ?? "materialize" }); });
    createEffect(() => { group()?.set({ adaptive: props.adaptive ?? true }); });
    createEffect(() => { group()?.press(props.pressed ?? false); });
    return <GroupContext.Provider value={group}>{props.children}</GroupContext.Provider>;
}
