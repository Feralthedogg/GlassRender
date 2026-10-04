// Glass shared by the `Glass` components inside it: their boxes become one piece of glass, and neighbours closer
// than `spacing` flow into each other. Material options are set here; the members only give their boxes.
import { useContext, useEffect, useRef, useState, type ReactElement, type ReactNode } from "react";
import type { Appearance, GlassGroup as Group, MaterialSpec, Preset, Rgba, ShownScheme, Transition } from "glassrender";
import { CanvasContext, GroupContext } from "./context.js";

export interface GlassGroupProps {
    /** Distance in CSS pixels over which neighbouring members merge (default 0: they only share the glass). */
    spacing?: number;
    /** Built-in material (default "standard"). */
    preset?: Preset;
    /** Surroundings (default: the canvas setting). */
    appearance?: Appearance;
    /** Fields replacing those of the preset's description (keep the same object while it does not change). */
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
    onScheme?: (scheme: ShownScheme) => void;
    children?: ReactNode;
}

export function GlassGroup(props: GlassGroupProps): ReactElement {
    const {
        spacing = 0, preset = "standard", appearance, material = null, tint = null, opacity = 1, visible = true,
        transition = "materialize", adaptive = true, children
    } = props;
    const canvas = useContext(CanvasContext), glass = canvas === null ? null : canvas.glass;
    const [group, setGroup] = useState<Group | null>(null);
    const latest = useRef(props);
    latest.current = props;

    useEffect(() => {
        if (glass === null) return;
        const p = latest.current;
        const g = glass.addGroup({
            spacing: p.spacing ?? 0, preset: p.preset ?? "standard", material: p.material ?? null, tint: p.tint ?? null,
            opacity: p.opacity ?? 1, visible: p.visible ?? true, transition: p.transition ?? "materialize", adaptive: p.adaptive ?? true,
            onScheme: (scheme: ShownScheme) => latest.current.onScheme?.(scheme),
            ...(p.appearance === undefined ? {} : { appearance: p.appearance })
        });
        setGroup(g);
        return () => {
            setGroup(null);
            g.remove();
        };
    }, [glass]);

    const t0 = tint?.[0], t1 = tint?.[1], t2 = tint?.[2], t3 = tint?.[3];
    useEffect(() => { group?.set({ spacing }); }, [group, spacing]);
    useEffect(() => { group?.set({ preset }); }, [group, preset]);
    useEffect(() => { if (appearance !== undefined) group?.set({ appearance }); }, [group, appearance]);
    useEffect(() => { group?.set({ material }); }, [group, material]);
    useEffect(() => {
        group?.set({ tint: t0 === undefined || t1 === undefined || t2 === undefined || t3 === undefined ? null : [t0, t1, t2, t3] });
    }, [group, t0, t1, t2, t3]);
    useEffect(() => { group?.set({ opacity }); }, [group, opacity]);
    useEffect(() => { group?.set({ visible }); }, [group, visible]);
    useEffect(() => { group?.set({ transition }); }, [group, transition]);
    useEffect(() => { group?.set({ adaptive }); }, [group, adaptive]);

    return <GroupContext.Provider value={group}>{children}</GroupContext.Provider>;
}
