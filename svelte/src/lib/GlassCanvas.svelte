<!--
    A canvas with glass on it, behind its content. Put `Glass` and `GlassGroup` anywhere inside; each one draws glass
    under its own box. The canvas fills the viewport (default) or this element, and sizes itself.
-->
<script lang="ts">
    import { onMount, setContext, untrack, type Snippet } from "svelte";
    import { createGlass, type Appearance, type Fit, type Follow, type Rgb, type StackingMode } from "glassrender";
    import { CANVAS_KEY, type CanvasState } from "./context.js";

    interface Props {
        /** Picture behind the glass: a URL, or an image, canvas, video or bitmap. */
        backdrop?: string | TexImageSource | null;
        /** How a backdrop of another size is laid on the canvas (default "cover"). */
        fit?: Fit;
        /** Upload the backdrop on every frame (a playing video, an animated canvas). */
        live?: boolean;
        /** Default surroundings of the glass (default "auto": the page's colour scheme). */
        appearance?: Appearance;
        /** Glass over glass: "exact" (default) or "flat". */
        stacking?: StackingMode;
        /** Turn of the rim lights in radians, clockwise. */
        lightAngle?: number;
        /** Upper limit of device pixels per CSS pixel (default 2). */
        maxPixelRatio?: number;
        /**
         * The window is the active one (default true). false gives the flatter glass of an inactive window;
         * "auto" follows the focus of the page.
         */
        active?: Follow;
        /** The more opaque, more saturated variant of the standard material (default false). */
        tinted?: boolean;
        /** Nearly opaque glass without refraction; "auto" (default) follows `prefers-reduced-transparency`. */
        reduceTransparency?: Follow;
        /** A stronger, more opaque tone; "auto" (default) follows `prefers-contrast: more`. */
        increaseContrast?: Follow;
        /** No refraction inside the glass and more blur; "auto" (default) follows `prefers-reduced-motion: reduce`. */
        reduceMotion?: Follow;
        /** Rim lights drawn as a plain outline instead of shaded bands (default false). */
        buttonShapes?: boolean;
        /**
         * Draw in extended range on screens that show values above the standard white (default false; "auto" follows
         * `dynamic-range: high`). It can change later only when it was true or "auto" when the canvas was made.
         */
        extendedRange?: Follow;
        /** Brightest value of the screen relative to the standard white, used with extended range (default 2). */
        headroom?: number;
        /** Accent colour of the "prominent" preset (default a blue). */
        accent?: Rgb;
        /** The canvas covers the viewport (default) or only this element. */
        fixed?: boolean;
        /** Class of the outer element. */
        class?: string;
        /** Called when the browser cannot draw the glass (no WebGL2). */
        onerror?: (message: string) => void;
        /** Called when the WebGL context is lost; the glass draws again on its own when it is back. */
        oncontextlost?: () => void;
        /** Called when the context is back: "" when the glass was rebuilt, else why it could not be. */
        oncontextrestored?: (error: string) => void;
        children?: Snippet;
    }

    let {
        backdrop = null, fit = "cover", live = false, appearance = "auto", stacking = "exact", lightAngle = 0,
        maxPixelRatio = 2, active = true, tinted = false, reduceTransparency = "auto", increaseContrast = "auto",
        reduceMotion = "auto", buttonShapes = false, extendedRange = false, headroom = 2, accent, fixed = true, class: className = "", onerror,
        oncontextlost, oncontextrestored, children
    }: Props = $props();

    const state: CanvasState = $state({ glass: null, error: "" });
    setContext(CANVAS_KEY, state);
    let canvas: HTMLCanvasElement;

    onMount(() => {
        const made = createGlass(canvas, untrack(() => ({
            appearance, stacking, lightAngle, maxPixelRatio, extendedRange, headroom,
            environment: { active, tinted, reduceTransparency, increaseContrast, reduceMotion, buttonShapes },
            ...(accent === undefined ? {} : { accent }),
            onContextLost: () => oncontextlost?.(),
            onContextRestored: (error: string) => oncontextrestored?.(error)
        })));
        if (!made.ok) {
            state.error = made.error;
            onerror?.(made.error);
            return;
        }
        const glass = made.value;
        state.glass = glass;
        return () => {
            state.glass = null;
            glass.destroy();
        };
    });

    $effect(() => {
        const a = appearance;
        untrack(() => state.glass?.setAppearance(a));
    });
    $effect(() => {
        const s = stacking;
        untrack(() => state.glass?.setStacking(s));
    });
    $effect(() => {
        const a = lightAngle;
        untrack(() => state.glass?.setLightAngle(a));
    });
    $effect(() => {
        const e = { active, tinted, reduceTransparency, increaseContrast, reduceMotion, buttonShapes };
        untrack(() => state.glass?.setEnvironment(e));
    });
    $effect(() => {
        const on = extendedRange, h = headroom;
        untrack(() => state.glass?.setExtendedRange(on, h));
    });
    $effect(() => {
        const a = accent;
        if (a !== undefined) untrack(() => state.glass?.setAccent(a));
    });
    $effect(() => {
        const glass = state.glass, b = backdrop, f = fit, l = live;
        if (glass === null) return;
        if (typeof b === "string") {
            const img = new Image();
            img.crossOrigin = "anonymous";
            img.src = b;
            glass.setBackdrop(img, f, false);
        } else glass.setBackdrop(b, f, l);
    });
</script>

<div class="glass-canvas {className}" class:fixed>
    <canvas bind:this={canvas}></canvas>
    {@render children?.()}
</div>

<style>
    .glass-canvas {
        position: relative;
        isolation: isolate;
    }
    canvas {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        display: block;
        z-index: -1;
        pointer-events: none;
    }
    .fixed > canvas {
        position: fixed;
        width: 100vw;
        height: 100vh;
    }
</style>
