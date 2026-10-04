// A canvas with glass on it, behind its content. Put `Glass` and `GlassGroup` anywhere inside; each one draws glass
// under its own box. The canvas fills the viewport (default) or this element, and sizes itself.
import { useEffect, useRef, useState, type CSSProperties, type ReactElement, type ReactNode } from "react";
import { createGlass, type Appearance, type Fit, type Follow, type Rgb, type StackingMode } from "glassrender";
import { CanvasContext, ensureStyle, type CanvasState } from "./context.js";

export interface GlassCanvasProps {
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
    className?: string;
    /** Style of the outer element. */
    style?: CSSProperties;
    /** Called when the browser cannot draw the glass (no WebGL2). */
    onError?: (message: string) => void;
    /** Called when the WebGL context is lost; the glass draws again on its own when it is back. */
    onContextLost?: () => void;
    /** Called when the context is back: "" when the glass was rebuilt, else why it could not be. */
    onContextRestored?: (error: string) => void;
    children?: ReactNode;
}

const EMPTY: CanvasState = { glass: null, error: "" };
const COVER: CSSProperties = { position: "absolute", inset: 0, width: "100%", height: "100%", display: "block", zIndex: -1, pointerEvents: "none" };
const FIXED: CSSProperties = { ...COVER, position: "fixed", width: "100vw", height: "100vh" };

export function GlassCanvas(props: GlassCanvasProps): ReactElement {
    const {
        backdrop = null, fit = "cover", live = false, appearance = "auto", stacking = "exact", lightAngle = 0, maxPixelRatio = 2,
        active = true, tinted = false, reduceTransparency = "auto", increaseContrast = "auto", reduceMotion = "auto", buttonShapes = false,
        extendedRange = false, headroom = 2, accent, fixed = true, className, style, children
    } = props;
    const canvas = useRef<HTMLCanvasElement | null>(null);
    const [state, setState] = useState<CanvasState>(EMPTY);
    // the latest props, read when the glass is made and by its callbacks
    const latest = useRef(props);
    latest.current = props;
    const glass = state.glass;

    useEffect(() => {
        const el = canvas.current;
        if (el === null) return;
        ensureStyle();
        const p = latest.current;
        const made = createGlass(el, {
            appearance: p.appearance ?? "auto", stacking: p.stacking ?? "exact", lightAngle: p.lightAngle ?? 0,
            maxPixelRatio: p.maxPixelRatio ?? 2, extendedRange: p.extendedRange ?? false, headroom: p.headroom ?? 2,
            environment: {
                active: p.active ?? true, tinted: p.tinted ?? false, reduceTransparency: p.reduceTransparency ?? "auto",
                increaseContrast: p.increaseContrast ?? "auto", reduceMotion: p.reduceMotion ?? "auto", buttonShapes: p.buttonShapes ?? false
            },
            ...(p.accent === undefined ? {} : { accent: p.accent }),
            onContextLost: () => latest.current.onContextLost?.(),
            onContextRestored: (error: string) => latest.current.onContextRestored?.(error)
        });
        if (!made.ok) {
            setState({ glass: null, error: made.error });
            p.onError?.(made.error);
            return;
        }
        const g = made.value;
        setState({ glass: g, error: "" });
        return () => {
            setState(EMPTY);
            g.destroy();
        };
    }, []);

    useEffect(() => { glass?.setAppearance(appearance); }, [glass, appearance]);
    useEffect(() => { glass?.setStacking(stacking); }, [glass, stacking]);
    useEffect(() => { glass?.setLightAngle(lightAngle); }, [glass, lightAngle]);
    useEffect(() => {
        glass?.setEnvironment({ active, tinted, reduceTransparency, increaseContrast, reduceMotion, buttonShapes });
    }, [glass, active, tinted, reduceTransparency, increaseContrast, reduceMotion, buttonShapes]);
    useEffect(() => { glass?.setExtendedRange(extendedRange, headroom); }, [glass, extendedRange, headroom]);
    const ar = accent?.[0], ag = accent?.[1], ab = accent?.[2];
    useEffect(() => {
        if (glass !== null && ar !== undefined && ag !== undefined && ab !== undefined) glass.setAccent([ar, ag, ab]);
    }, [glass, ar, ag, ab]);
    useEffect(() => {
        if (glass === null) return;
        if (typeof backdrop === "string") {
            const img = new Image();
            img.crossOrigin = "anonymous";
            img.src = backdrop;
            glass.setBackdrop(img, fit, false);
        } else glass.setBackdrop(backdrop, fit, live);
    }, [glass, backdrop, fit, live]);

    return (
        <div className={className === undefined || className === "" ? "glass-canvas" : "glass-canvas " + className}
            style={{ position: "relative", isolation: "isolate", ...style }}>
            <canvas ref={canvas} style={fixed ? FIXED : COVER} />
            <CanvasContext.Provider value={state}>{children}</CanvasContext.Provider>
        </div>
    );
}
