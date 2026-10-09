<script lang="ts">
    /**
     * @file Glass.svelte
     * @brief Svelte component that tracks a DOM box with glass.
     * @details Content inherits --glass-foreground and --glass-title. Group members contribute
     * geometry; the group owns their material.
     */

    import { getContext, onDestroy, untrack, type Snippet } from "svelte";
    import type { HTMLAttributes } from "svelte/elements";
    import type {
        Appearance, CornerStyle, GlassShape, GroupMember, Preset, Radius, Rgba, ShownScheme, Transition
    } from "glassrender";
    import { CANVAS_KEY, GROUP_KEY, type CanvasState, type GroupState } from "./context.js";

    /** @brief Glass geometry and appearance combined with the outer div's DOM attributes. */
    interface Props extends HTMLAttributes<HTMLDivElement> {
        /** @brief Built-in material: "standard" (default), "clear", "menu", "dock", ... */
        preset?: Preset;
        /** @brief Surroundings (default: the canvas setting). */
        appearance?: Appearance;
        /**
         * @brief Corner radius in CSS pixels, or four radii (top-left, top-right, bottom-right,
         * bottom-left).
         * @details Default: half the short side.
         */
        radius?: Radius;
        /** @brief Corner construction (default "smooth"). */
        corner?: CornerStyle;
        /**
         * @brief Outline of any shape instead of a rounded rectangle: the alpha channel of an image
         * or canvas, stretched over the box.
         * @details It has to be there when the box is first drawn; later values replace the mask.
         */
        mask?: TexImageSource;
        /** @brief Small glass follows the luminance of the backdrop under it (default true). */
        adaptive?: boolean;
        /**
         * @brief Called with "dark" or "light" when the scheme the glass shows changes (and once at
         * the start).
         */
        onscheme?: (scheme: ShownScheme) => void;
        /** @brief Color laid over the glass; its alpha is the strength. */
        tint?: Rgba | null;
        /** @brief Opacity of the glass with its shadow (default 1). */
        opacity?: number;
        /** @brief Color-separation multiplier (0..1); null inherits the canvas default. */
        chromaticAberration?: number | null;
        /** @brief Shown (default) or hidden. */
        visible?: boolean;
        /** @brief Pressed veil. */
        pressed?: boolean;
        /** @brief Show the pressed veil while a pointer is down on the box. */
        interactive?: boolean;
        /** @brief How visibility changes and removal look (default "materialize"). */
        transition?: Transition;
        /**
         * @brief Measure the box on every frame (for boxes moved by CSS animations or transforms).
         */
        everyFrame?: boolean;
        children?: Snippet;
    }

    let {
        preset, appearance, radius, corner = "smooth", mask, adaptive = true, onscheme, tint = null,
        opacity = 1, chromaticAberration = null, visible = true, pressed = false, interactive = false, transition = "materialize", everyFrame = false, children,
        style = "", class: className = "", onpointerdown, onpointerup, onpointercancel, onlostpointercapture, ...rest
    }: Props = $props();

    const canvas = getContext<CanvasState | undefined>(CANVAS_KEY);
    const group = getContext<GroupState | undefined>(GROUP_KEY);
    let box: HTMLDivElement;
    let down = $state(false);
    let pressPointer: number | null = null;
    let pressCleanup: (() => void) | null = null;
    let shape: GlassShape | null = null;
    let member: GroupMember | null = null;

    onDestroy(() => { pressCleanup?.(); });

    // Match DOM backgrounds and outlines to the glass corners.
    const rounding = $derived(radius === undefined ? "9999px" : typeof radius === "number" ? radius + "px" : radius.map((r) => r + "px").join(" "));

    $effect(() => {
        const g = group === undefined ? null : group.group;
        if (group !== undefined) {
            if (g === null) return;
            const m = g.add(untrack(() => ({
                x: 0, y: 0, width: 0, height: 0, corner, ...(radius === undefined ? {} : { radius }), ...(mask === undefined ? {} : { mask })
            })));
            if (m === null) return;
            m.follow(box, untrack(() => everyFrame));
            member = m;
            return () => {
                member = null;
                m.remove();
            };
        }
        const glass = canvas?.glass ?? null;
        if (glass === null) return;
        const s = glass.add(untrack(() => ({
            x: 0, y: 0, width: 0, height: 0, corner, tint, opacity, chromaticAberration, visible, transition, adaptive, pressed: pressed || down,
            onScheme: (scheme: ShownScheme) => onscheme?.(scheme),
            ...(radius === undefined ? {} : { radius }), ...(preset === undefined ? {} : { preset }), ...(appearance === undefined ? {} : { appearance }),
            ...(mask === undefined ? {} : { mask })
        })));
        s.follow(box, untrack(() => everyFrame));
        shape = s;
        return () => {
            shape = null;
            s.remove();
        };
    });

    $effect(() => {
        const v = everyFrame;
        untrack(() => { shape?.follow(box, v); member?.follow(box, v); });
    });

    $effect(() => { const v = preset ?? "standard"; untrack(() => shape?.set({ preset: v })); });
    $effect(() => { const v = appearance; if (v !== undefined) untrack(() => shape?.set({ appearance: v })); });
    $effect(() => {
        const v = radius ?? null;
        untrack(() => { shape?.set({ radius: v }); member?.set({ radius: v }); });
    });
    $effect(() => {
        const v = mask;
        if (v !== undefined) untrack(() => { shape?.set({ mask: v }); member?.set({ mask: v }); });
    });
    $effect(() => { const v = adaptive; untrack(() => shape?.set({ adaptive: v })); });
    $effect(() => { const v = corner; untrack(() => shape?.set({ corner: v })); });
    $effect(() => { const v = tint; untrack(() => shape?.set({ tint: v })); });
    $effect(() => { const v = opacity; untrack(() => shape?.set({ opacity: v })); });
    $effect(() => { const v = chromaticAberration; untrack(() => shape?.set({ chromaticAberration: v })); });
    $effect(() => { const v = visible; untrack(() => shape?.set({ visible: v })); });
    $effect(() => { const v = transition; untrack(() => shape?.set({ transition: v })); });
    $effect(() => { const v = pressed || down; untrack(() => shape?.press(v)); });

    type BoxEvent = PointerEvent & { currentTarget: EventTarget & HTMLDivElement };

    function releasePress(pointerId?: number): void {
        if (pointerId !== undefined && pointerId !== pressPointer) return;
        pressCleanup?.();
        down = false;
    }

    // Observe releases without capturing the pointer away from a child button or link.
    function pointerdown(e: BoxEvent): void {
        onpointerdown?.(e);
        if (!interactive || e.defaultPrevented || pressPointer !== null) return;
        const doc = box.ownerDocument, win = doc.defaultView;
        const finish = (event: PointerEvent): void => { releasePress(event.pointerId); };
        const blur = (): void => { releasePress(); };
        pressPointer = e.pointerId;
        pressCleanup = () => {
            doc.removeEventListener("pointerup", finish, true);
            doc.removeEventListener("pointercancel", finish, true);
            win?.removeEventListener("blur", blur);
            pressPointer = null;
            pressCleanup = null;
        };
        doc.addEventListener("pointerup", finish, true);
        doc.addEventListener("pointercancel", finish, true);
        win?.addEventListener("blur", blur);
        down = true;
    }

    function pointerup(e: BoxEvent): void {
        onpointerup?.(e);
        releasePress(e.pointerId);
    }

    function pointercancel(e: BoxEvent): void {
        onpointercancel?.(e);
        releasePress(e.pointerId);
    }

    function lostcapture(e: BoxEvent): void {
        onlostpointercapture?.(e);
        releasePress(e.pointerId);
    }
</script>

<div
    bind:this={box}
    {...rest}
    class="glass-box {className}"
    style="border-radius: {rounding}; {style}"
    onpointerdown={pointerdown}
    onpointerup={pointerup}
    onpointercancel={pointercancel}
    onlostpointercapture={lostcapture}
>
    {@render children?.()}
</div>

<style>
    /* content takes the colour for the glass it sits on; no specificity, so any rule of the page wins */
    :global(:where(.glass-box)) {
        color: var(--glass-foreground, inherit);
    }
</style>
