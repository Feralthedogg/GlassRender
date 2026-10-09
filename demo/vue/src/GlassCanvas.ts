/**
 * @file GlassCanvas.ts
 * @brief Vue canvas lifecycle and backdrop component.
 * @details Descendant shapes share one renderer; the canvas sizes to the viewport or its container.
 */

import { defineComponent, h, onBeforeUnmount, onMounted, provide, shallowReactive, shallowRef, watch, type CSSProperties, type PropType } from "vue";
import { createGlass, DEFAULT_CHROMATIC_ABERRATION, type Appearance, type Fit, type Follow, type StackingMode } from "glassrender";
import { CANVAS_KEY, ensureStyle, type CanvasState } from "./context.js";

const COVER: CSSProperties = { position: "absolute", inset: "0", width: "100%", height: "100%", display: "block", zIndex: -1, pointerEvents: "none" };
const FIXED: CSSProperties = { ...COVER, position: "fixed", width: "100vw", height: "100vh" };

/** @brief Own the canvas and renderer shared by descendant glass components. */
export const GlassCanvas = defineComponent({
    name: "GlassCanvas",
    props: {
        /** @brief Picture behind the glass: a URL, or an image, canvas, video or bitmap. */
        backdrop: { type: [String, Object] as PropType<string | TexImageSource | null>, default: null },
        /** @brief How a backdrop of another size is laid on the canvas (default "cover"). */
        fit: { type: String as PropType<Fit>, default: "cover" },
        /** @brief Upload the backdrop on every frame (a playing video, an animated canvas). */
        live: { type: Boolean, default: false },
        /**
         * @brief Default surroundings of the glass (default "auto": the page's color scheme).
         */
        appearance: { type: String as PropType<Appearance>, default: "auto" },
        /** @brief Glass over glass: "exact" (default) or "flat". */
        stacking: { type: String as PropType<StackingMode>, default: "exact" },
        /** @brief Turn of the rim lights in radians, clockwise. */
        lightAngle: { type: Number, default: 0 },
        /** @brief Default color-separation multiplier (0..1, default 0.25). */
        chromaticAberration: { type: Number, default: DEFAULT_CHROMATIC_ABERRATION },
        /** @brief Upper limit of device pixels per CSS pixel (default 2). */
        maxPixelRatio: { type: Number, default: 2 },
        /**
         * @brief The window is the active one (default true). false gives the flatter glass of an
         * inactive window; "auto" follows the focus of the page.
         */
        active: { type: [Boolean, String] as PropType<Follow>, default: true },
        /**
         * @brief The more opaque, more saturated variant of the standard material (default false).
         */
        tinted: { type: Boolean, default: false },
        /**
         * @brief Nearly opaque glass without refraction; "auto" (default) follows
         * `prefers-reduced-transparency`.
         */
        reduceTransparency: { type: [Boolean, String] as PropType<Follow>, default: "auto" },
        /**
         * @brief A stronger, more opaque tone; "auto" (default) follows `prefers-contrast: more`.
         */
        increaseContrast: { type: [Boolean, String] as PropType<Follow>, default: "auto" },
        /**
         * @brief No refraction inside the glass and more blur; "auto" (default) follows
         * `prefers-reduced-motion: reduce`.
         */
        reduceMotion: { type: [Boolean, String] as PropType<Follow>, default: "auto" },
        /**
         * @brief Rim lights drawn as a plain outline instead of shaded bands (default false).
         */
        buttonShapes: { type: Boolean, default: false },
        /**
         * @brief Draw in extended range on screens that show values above the standard white
         * (default false; "auto" follows `dynamic-range: high`).
         * @details It can change later only when it was true or "auto" when the canvas was made.
         */
        extendedRange: { type: [Boolean, String] as PropType<Follow>, default: false },
        /**
         * @brief Brightest value of the screen relative to the standard white, used with extended
         * range (default 2).
         */
        headroom: { type: Number, default: 2 },
        /** @brief Preferred brightness multiplier name; overrides headroom when supplied. */
        displayHeadroom: { type: Number as PropType<number | undefined>, default: undefined },
        /** @brief The canvas covers the viewport (default) or only this element. */
        fixed: { type: Boolean, default: true }
    },
    emits: {
        /** @brief The browser cannot draw the glass (no WebGL2). */
        error: (_message: string) => true,
        /**
         * @brief The WebGL context is lost; the glass draws again on its own when it is back.
         */
        contextlost: () => true,
        /**
         * @brief The context is back: "" when the glass was rebuilt, else why it could not be.
         */
        contextrestored: (_error: string) => true
    },
    setup(props, { emit, slots }) {
        const state = shallowReactive<CanvasState>({ glass: null, error: "" });
        provide(CANVAS_KEY, state);
        const canvas = shallowRef<HTMLCanvasElement | null>(null);

        onMounted(() => {
            const el = canvas.value;
            if (el === null) return;
            ensureStyle();
            const made = createGlass(el, {
                appearance: props.appearance, stacking: props.stacking, lightAngle: props.lightAngle, chromaticAberration: props.chromaticAberration, maxPixelRatio: props.maxPixelRatio,
                extendedRange: props.extendedRange, headroom: props.displayHeadroom ?? props.headroom,
                environment: {
                    active: props.active, tinted: props.tinted, reduceTransparency: props.reduceTransparency,
                    increaseContrast: props.increaseContrast, reduceMotion: props.reduceMotion, buttonShapes: props.buttonShapes
                },
                onContextLost: () => emit("contextlost"),
                onContextRestored: (error: string) => emit("contextrestored", error)
            });
            if (!made.ok) {
                state.error = made.error;
                emit("error", made.error);
                return;
            }
            state.glass = made.value;
        });
        onBeforeUnmount(() => {
            const g = state.glass;
            state.glass = null;
            if (g !== null) g.destroy();
        });

        watch(() => props.appearance, (v) => { state.glass?.setAppearance(v); });
        watch(() => props.stacking, (v) => { state.glass?.setStacking(v); });
        watch(() => props.lightAngle, (v) => { state.glass?.setLightAngle(v); });
        watch(() => props.chromaticAberration, (v) => { state.glass?.setChromaticAberration(v); });
        watch(() => [props.active, props.tinted, props.reduceTransparency, props.increaseContrast, props.reduceMotion, props.buttonShapes] as const, () => {
            state.glass?.setEnvironment({
                active: props.active, tinted: props.tinted, reduceTransparency: props.reduceTransparency,
                increaseContrast: props.increaseContrast, reduceMotion: props.reduceMotion, buttonShapes: props.buttonShapes
            });
        });
        watch(() => [props.extendedRange, props.headroom, props.displayHeadroom] as const, () => { state.glass?.setExtendedRange(props.extendedRange, props.displayHeadroom ?? props.headroom); });
        watch(() => [state.glass, props.backdrop, props.fit, props.live] as const, ([glass, b, f, l]) => {
            if (glass === null) return;
            if (typeof b === "string") {
                const img = new Image();
                img.crossOrigin = "anonymous";
                img.src = b;
                glass.setBackdrop(img, f, false);
            } else glass.setBackdrop(b, f, l);
        });

        return () => h("div", { class: "glass-canvas", style: { position: "relative", isolation: "isolate" } }, [
            h("canvas", { ref: canvas, style: props.fixed ? FIXED : COVER }),
            slots.default === undefined ? null : slots.default()
        ]);
    }
});
