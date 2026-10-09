/**
 * @file GlassGroup.tsx
 * @brief React provider for a shared glass material.
 * @details Members contribute outlines that merge within spacing; material options belong to the
 * group.
 */

import { useContext, useEffect, useRef, useState, type ReactElement, type ReactNode } from "react";
import type { Appearance, GlassGroup as Group, Preset, Rgba, ShownScheme, Transition } from "glassrender";
import { CanvasContext, GroupContext } from "./context.js";

/** @brief Shared material and merge distance for descendant glass outlines. */
export interface GlassGroupProps {
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
     * @brief Called with "dark" or "light" when the scheme the glass shows changes (and once at the
     * start).
     */
    onScheme?: (scheme: ShownScheme) => void;
    children?: ReactNode;
}

/** @brief Own one shared glass material while descendant components supply its outlines. */
export function GlassGroup(props: GlassGroupProps): ReactElement {
    const {
        spacing = 0, preset = "standard", appearance, tint = null, opacity = 1, chromaticAberration = null, visible = true,
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
            spacing: p.spacing ?? 0, tint: p.tint ?? null,
            opacity: p.opacity ?? 1, chromaticAberration: p.chromaticAberration ?? null, visible: p.visible ?? true, transition: p.transition ?? "materialize", adaptive: p.adaptive ?? true,
            onScheme: (scheme: ShownScheme) => latest.current.onScheme?.(scheme),
            ...(p.preset === undefined ? {} : { preset: p.preset }), ...(p.appearance === undefined ? {} : { appearance: p.appearance })
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
    useEffect(() => {
        group?.set({ tint: t0 === undefined || t1 === undefined || t2 === undefined || t3 === undefined ? null : [t0, t1, t2, t3] });
    }, [group, t0, t1, t2, t3]);
    useEffect(() => { group?.set({ opacity }); }, [group, opacity]);
    useEffect(() => { group?.set({ chromaticAberration }); }, [group, chromaticAberration]);
    useEffect(() => { group?.set({ visible }); }, [group, visible]);
    useEffect(() => { group?.set({ transition }); }, [group, transition]);
    useEffect(() => { group?.set({ adaptive }); }, [group, adaptive]);

    return <GroupContext.Provider value={group}>{children}</GroupContext.Provider>;
}
