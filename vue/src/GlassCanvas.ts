// A canvas with glass on it, behind its content. Put `Glass` and `GlassGroup` anywhere inside; each one draws glass
// under its own box. The canvas fills the viewport (default) or this element, and sizes itself.
import { defineComponent, h, onBeforeUnmount, onMounted, provide, shallowReactive, shallowRef, watch, type CSSProperties, type PropType } from "vue";
import { createGlass, type Appearance, type Fit, type Follow, type Rgb, type StackingMode } from "glassrender";
import { CANVAS_KEY, ensureStyle, type CanvasState } from "./context.js";

const COVER: CSSProperties = { position: "absolute", inset: "0", width: "100%", height: "100%", display: "block", zIndex: -1, pointerEvents: "none" };
const FIXED: CSSProperties = { ...COVER, position: "fixed", width: "100vw", height: "100vh" };

export const GlassCanvas = defineComponent({
    name: "GlassCanvas",
    props: {
        /** Picture behind the glass: a URL, or an image, canvas, video or bitmap. */
        backdrop: { type: [String, Object] as PropType<string | TexImageSource | null>, default: null },
        /** How a backdrop of another size is laid on the canvas (default "cover"). */
        fit: { type: String as PropType<Fit>, default: "cover" },
        /** Upload the backdrop on every frame (a playing video, an animated canvas). */
        live: { type: Boolean, default: false },
        /** Default surroundings of the glass (default "auto": the page's colour scheme). */
        appearance: { type: String as PropType<Appearance>, default: "auto" },
        /** Glass over glass: "exact" (default) or "flat". */
        stacking: { type: String as PropType<StackingMode>, default: "exact" },
        /** Turn of the rim lights in radians, clockwise. */
        lightAngle: { type: Number, default: 0 },
        /** Upper limit of device pixels per CSS pixel (default 2). */
        maxPixelRatio: { type: Number, default: 2 },
        /**
         * The window is the active one (default true). false gives the flatter glass of an inactive window;
         * "auto" follows the focus of the page.
         */
        active: { type: [Boolean, String] as PropType<Follow>, default: true },
        /** The more opaque, more saturated variant of the standard material (default false). */
        tinted: { type: Boolean, default: false },
        /** Nearly opaque glass without refraction; "auto" (default) follows `prefers-reduced-transparency`. */
        reduceTransparency: { type: [Boolean, String] as PropType<Follow>, default: "auto" },
        /** A stronger, more opaque tone; "auto" (default) follows `prefers-contrast: more`. */
        increaseContrast: { type: [Boolean, String] as PropType<Follow>, default: "auto" },
        /** No refraction inside the glass and more blur; "auto" (default) follows `prefers-reduced-motion: reduce`. */
        reduceMotion: { type: [Boolean, String] as PropType<Follow>, default: "auto" },
        /** Rim lights drawn as a plain outline instead of shaded bands (default false). */
        buttonShapes: { type: Boolean, default: false },
        /**
         * Draw in extended range on screens that show values above the standard white (default false; "auto" follows
         * `dynamic-range: high`). It can change later only when it was true or "auto" when the canvas was made.
         */
        extendedRange: { type: [Boolean, String] as PropType<Follow>, default: false },
        /** Brightest value of the screen relative to the standard white, used with extended range (default 2). */
        headroom: { type: Number, default: 2 },
        /** Accent colour of the "prominent" preset (default a blue). */
        accent: { type: Array as unknown as PropType<Rgb | undefined>, default: undefined },
        /** The canvas covers the viewport (default) or only this element. */
        fixed: { type: Boolean, default: true }
    },
    emits: {
        /** The browser cannot draw the glass (no WebGL2). */
        error: (_message: string) => true,
        /** The WebGL context is lost; the glass draws again on its own when it is back. */
        contextlost: () => true,
        /** The context is back: "" when the glass was rebuilt, else why it could not be. */
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
                appearance: props.appearance, stacking: props.stacking, lightAngle: props.lightAngle, maxPixelRatio: props.maxPixelRatio,
                extendedRange: props.extendedRange, headroom: props.headroom,
                environment: {
                    active: props.active, tinted: props.tinted, reduceTransparency: props.reduceTransparency,
                    increaseContrast: props.increaseContrast, reduceMotion: props.reduceMotion, buttonShapes: props.buttonShapes
                },
                ...(props.accent === undefined ? {} : { accent: props.accent }),
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
        watch(() => [props.active, props.tinted, props.reduceTransparency, props.increaseContrast, props.reduceMotion, props.buttonShapes] as const, () => {
            state.glass?.setEnvironment({
                active: props.active, tinted: props.tinted, reduceTransparency: props.reduceTransparency,
                increaseContrast: props.increaseContrast, reduceMotion: props.reduceMotion, buttonShapes: props.buttonShapes
            });
        });
        watch(() => [props.extendedRange, props.headroom] as const, () => { state.glass?.setExtendedRange(props.extendedRange, props.headroom); });
        watch(() => (props.accent === undefined ? "" : props.accent.join(",")), () => {
            if (props.accent !== undefined) state.glass?.setAccent(props.accent);
        });
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
