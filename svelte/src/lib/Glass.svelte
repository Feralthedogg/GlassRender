<!--
    A box with glass under it. The glass follows the box as the page lays it out, scrolls and resizes; the content of
    the box sits on the glass and takes the colour for content on it (`--glass-foreground`; `--glass-title` is the
    colour for a control title). Inside a `GlassGroup` the box becomes a member of the group's glass and only its
    outline options (radius, corner, mask) apply.
-->
<script lang="ts">
    import { getContext, untrack, type Snippet } from "svelte";
    import type { HTMLAttributes } from "svelte/elements";
    import type {
        Appearance, CornerStyle, GlassShape, GroupMember, MaterialSpec, Preset, Radius, Rgba, ShownScheme, Transition
    } from "glassrender";
    import { CANVAS_KEY, GROUP_KEY, type CanvasState, type GroupState } from "./context.js";

    interface Props extends HTMLAttributes<HTMLDivElement> {
        /** Built-in material: "standard" (default), "clear", "prominent" (tinted with the accent colour), "menu", "dock", ... */
        preset?: Preset;
        /** Surroundings (default: the canvas setting). */
        appearance?: Appearance;
        /** Corner radius in CSS pixels, or four radii (top-left, top-right, bottom-right, bottom-left). Default: half the short side. */
        radius?: Radius;
        /** Corner construction (default "smooth"). */
        corner?: CornerStyle;
        /**
         * Outline of any shape instead of a rounded rectangle: the alpha channel of an image or canvas, stretched over
         * the box. It has to be there when the box is first drawn; later values replace the mask.
         */
        mask?: TexImageSource;
        /** Small glass follows the luminance of the backdrop under it (default true). */
        adaptive?: boolean;
        /** Called with "dark" or "light" when the scheme the glass shows changes (and once at the start). */
        onscheme?: (scheme: ShownScheme) => void;
        /** Fields replacing those of the preset's description. */
        material?: Partial<MaterialSpec> | null;
        /** Colour laid over the glass; its alpha is the strength. */
        tint?: Rgba | null;
        /** Opacity of the glass with its shadow (default 1). */
        opacity?: number;
        /** Shown (default) or hidden. */
        visible?: boolean;
        /** Pressed veil. */
        pressed?: boolean;
        /** Show the pressed veil while a pointer is down on the box. */
        interactive?: boolean;
        /** How visibility changes and removal look (default "materialize"). */
        transition?: Transition;
        /** Measure the box on every frame (for boxes moved by CSS animations or transforms). */
        everyFrame?: boolean;
        children?: Snippet;
    }

    let {
        preset = "standard", appearance, radius, corner = "smooth", mask, adaptive = true, onscheme, material = null, tint = null,
        opacity = 1, visible = true, pressed = false, interactive = false, transition = "materialize", everyFrame = false, children,
        style = "", class: className = "", onpointerdown, onpointerup, onpointercancel, onlostpointercapture, ...rest
    }: Props = $props();

    const canvas = getContext<CanvasState | undefined>(CANVAS_KEY);
    const group = getContext<GroupState | undefined>(GROUP_KEY);
    let box: HTMLDivElement;
    let down = $state(false);
    let shape: GlassShape | null = null;
    let member: GroupMember | null = null;

    // the box keeps the corners of its glass, so its own background or outline matches
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
            x: 0, y: 0, width: 0, height: 0, preset, corner, material, tint, opacity, visible, transition, adaptive, pressed: pressed || down,
            onScheme: (scheme: ShownScheme) => onscheme?.(scheme),
            ...(radius === undefined ? {} : { radius }), ...(appearance === undefined ? {} : { appearance }),
            ...(mask === undefined ? {} : { mask })
        })));
        s.follow(box, untrack(() => everyFrame));
        shape = s;
        return () => {
            shape = null;
            s.remove();
        };
    });

    $effect(() => { const v = preset; untrack(() => shape?.set({ preset: v })); });
    $effect(() => { const v = appearance; if (v !== undefined) untrack(() => shape?.set({ appearance: v })); });
    $effect(() => {
        const v = radius;
        if (v !== undefined) untrack(() => { shape?.set({ radius: v }); member?.set({ radius: v }); });
    });
    $effect(() => {
        const v = mask;
        if (v !== undefined) untrack(() => { shape?.set({ mask: v }); member?.set({ mask: v }); });
    });
    $effect(() => { const v = adaptive; untrack(() => shape?.set({ adaptive: v })); });
    $effect(() => { const v = corner; untrack(() => shape?.set({ corner: v })); });
    $effect(() => { const v = material; untrack(() => shape?.set({ material: v })); });
    $effect(() => { const v = tint; untrack(() => shape?.set({ tint: v })); });
    $effect(() => { const v = opacity; untrack(() => shape?.set({ opacity: v })); });
    $effect(() => { const v = visible; untrack(() => shape?.set({ visible: v })); });
    $effect(() => { const v = transition; untrack(() => shape?.set({ transition: v })); });
    $effect(() => { const v = pressed || down; untrack(() => shape?.press(v)); });

    type BoxEvent = PointerEvent & { currentTarget: EventTarget & HTMLDivElement };

    // the press handlers run after the ones given to the component
    function pointerdown(e: BoxEvent): void {
        onpointerdown?.(e);
        if (!interactive || e.defaultPrevented) return;
        down = true;
        box.setPointerCapture(e.pointerId);
    }

    function pointerup(e: BoxEvent): void {
        onpointerup?.(e);
        down = false;
    }

    function pointercancel(e: BoxEvent): void {
        onpointercancel?.(e);
        down = false;
    }

    function lostcapture(e: BoxEvent): void {
        onlostpointercapture?.(e);
        down = false;
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
