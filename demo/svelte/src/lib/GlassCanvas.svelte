<script lang="ts">
    /**
     * @file GlassCanvas.svelte
     * @brief Svelte canvas lifecycle and backdrop component.
     * @details Descendant shapes share one renderer; the canvas sizes to the viewport or its container.
     */

    import { onMount, setContext, untrack, type Snippet } from "svelte";
    import { createGlass, DEFAULT_CHROMATIC_ABERRATION, type Appearance, type Fit, type Follow, type StackingMode } from "glassrender";
    import { CANVAS_KEY, type CanvasState } from "./context.js";

    /** @brief Canvas placement, backdrop and environment options for descendant glass components. */
    interface Props {
        /** @brief Picture behind the glass: a URL, or an image, canvas, video or bitmap. */
        backdrop?: string | TexImageSource | null;
        /** @brief How a backdrop of another size is laid on the canvas (default "cover"). */
        fit?: Fit;
        /** @brief Upload the backdrop on every frame (a playing video, an animated canvas). */
        live?: boolean;
        /**
         * @brief Default surroundings of the glass (default "auto": the page's color scheme).
         */
        appearance?: Appearance;
        /** @brief Glass over glass: "exact" (default) or "flat". */
        stacking?: StackingMode;
        /** @brief Turn of the rim lights in radians, clockwise. */
        lightAngle?: number;
        /** @brief Default color-separation multiplier (0..1, default 0.25). */
        chromaticAberration?: number;
        /** @brief Upper limit of device pixels per CSS pixel (default 2). */
        maxPixelRatio?: number;
        /**
         * @brief The window is the active one (default true). false gives the flatter glass of an
         * inactive window; "auto" follows the focus of the page.
         */
        active?: Follow;
        /**
         * @brief The more opaque, more saturated variant of the standard material (default false).
         */
        tinted?: boolean;
        /**
         * @brief Nearly opaque glass without refraction; "auto" (default) follows
         * `prefers-reduced-transparency`.
         */
        reduceTransparency?: Follow;
        /**
         * @brief A stronger, more opaque tone; "auto" (default) follows `prefers-contrast: more`.
         */
        increaseContrast?: Follow;
        /**
         * @brief No refraction inside the glass and more blur; "auto" (default) follows
         * `prefers-reduced-motion: reduce`.
         */
        reduceMotion?: Follow;
        /**
         * @brief Rim lights drawn as a plain outline instead of shaded bands (default false).
         */
        buttonShapes?: boolean;
        /**
         * @brief Draw in extended range on screens that show values above the standard white
         * (default false; "auto" follows `dynamic-range: high`).
         * @details It can change later only when it was true or "auto" when the canvas was made.
         */
        extendedRange?: Follow;
        /**
         * @brief Brightest value of the screen relative to the standard white, used with extended
         * range (default 2).
         */
        headroom?: number;
        /** @brief Preferred brightness multiplier name; overrides headroom when supplied. */
        displayHeadroom?: number;
        /** @brief The canvas covers the viewport (default) or only this element. */
        fixed?: boolean;
        /** @brief Class of the outer element. */
        class?: string;
        /** @brief Called when the browser cannot draw the glass (no WebGL2). */
        onerror?: (message: string) => void;
        /**
         * @brief Called when the WebGL context is lost; the glass draws again on its own when it is
         * back.
         */
        oncontextlost?: () => void;
        /**
         * @brief Called when the context is back: "" when the glass was rebuilt, else why it could
         * not be.
         */
        oncontextrestored?: (error: string) => void;
        children?: Snippet;
    }

    let {
        backdrop = null, fit = "cover", live = false, appearance = "auto", stacking = "exact", lightAngle = 0, chromaticAberration = DEFAULT_CHROMATIC_ABERRATION,
        maxPixelRatio = 2, active = true, tinted = false, reduceTransparency = "auto", increaseContrast = "auto",
        reduceMotion = "auto", buttonShapes = false, extendedRange = false, headroom = 2, displayHeadroom, fixed = true, class: className = "", onerror,
        oncontextlost, oncontextrestored, children
    }: Props = $props();

    const state: CanvasState = $state({ glass: null, error: "" });
    setContext(CANVAS_KEY, state);
    let canvas: HTMLCanvasElement;

    onMount(() => {
        const made = createGlass(canvas, untrack(() => ({
            appearance, stacking, lightAngle, chromaticAberration, maxPixelRatio, extendedRange, headroom: displayHeadroom ?? headroom,
            environment: { active, tinted, reduceTransparency, increaseContrast, reduceMotion, buttonShapes },
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
        const strength = chromaticAberration;
        untrack(() => state.glass?.setChromaticAberration(strength));
    });
    $effect(() => {
        const e = { active, tinted, reduceTransparency, increaseContrast, reduceMotion, buttonShapes };
        untrack(() => state.glass?.setEnvironment(e));
    });
    $effect(() => {
        const on = extendedRange, h = displayHeadroom ?? headroom;
        untrack(() => state.glass?.setExtendedRange(on, h));
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
