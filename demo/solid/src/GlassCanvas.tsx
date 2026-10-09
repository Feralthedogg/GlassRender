import { createEffect, createSignal, onMount, onCleanup, splitProps, type JSX } from "solid-js";
import { createGlass, DEFAULT_CHROMATIC_ABERRATION, type Glass as CoreGlass, type Appearance, type Fit, type Follow, type StackingMode } from "glassrender";
import { CanvasContext, ensureStyle, type CanvasState } from "./context.js";

export interface GlassCanvasProps extends Omit<JSX.HTMLAttributes<HTMLDivElement>, "onError" | "onContextLost" | "onContextRestored"> {
    backdrop?: string | TexImageSource | null;
    fit?: Fit;
    live?: boolean;
    appearance?: Appearance;
    stacking?: StackingMode;
    lightAngle?: number;
    chromaticAberration?: number;
    /** Creation-time pixel ratio limit. */
    maxPixelRatio?: number;
    active?: Follow;
    tinted?: boolean;
    reduceTransparency?: Follow;
    increaseContrast?: Follow;
    reduceMotion?: Follow;
    buttonShapes?: boolean;
    /** Enable at creation to allow later extended-range changes. */
    extendedRange?: Follow;
    headroom?: number;
    displayHeadroom?: number;
    fixed?: boolean;
    onError?: (message: string) => void;
    onContextLost?: () => void;
    onContextRestored?: (error: string) => void;
}

const COVER: JSX.CSSProperties = { position: "absolute", inset: 0, width: "100%", height: "100%", display: "block", "z-index": -1, "pointer-events": "none" };
const FIXED: JSX.CSSProperties = { ...COVER, position: "fixed", width: "100vw", height: "100vh" };

export function GlassCanvas(props: GlassCanvasProps): JSX.Element {
    const [local, dom] = splitProps(props, ["children", "class", "style", "backdrop", "fit", "live", "appearance", "stacking", "lightAngle", "chromaticAberration", "maxPixelRatio",
        "active", "tinted", "reduceTransparency", "increaseContrast", "reduceMotion", "buttonShapes", "extendedRange", "headroom", "displayHeadroom", "fixed", "onError", "onContextLost", "onContextRestored"]);
    let canvas!: HTMLCanvasElement;
    const [glass, setGlass] = createSignal<CoreGlass | null>(null), [error, setError] = createSignal("");
    const state: CanvasState = { get glass() { return glass(); }, get error() { return error(); } };
    onMount(() => {
        ensureStyle();
        const made = createGlass(canvas, {
            appearance: local.appearance ?? "auto", stacking: local.stacking ?? "exact", lightAngle: local.lightAngle ?? 0,
            chromaticAberration: local.chromaticAberration ?? DEFAULT_CHROMATIC_ABERRATION, maxPixelRatio: local.maxPixelRatio ?? 2,
            extendedRange: local.extendedRange ?? false, displayHeadroom: local.displayHeadroom ?? local.headroom ?? 2,
            environment: { active: local.active ?? true, tinted: local.tinted ?? false, reduceTransparency: local.reduceTransparency ?? "auto",
                increaseContrast: local.increaseContrast ?? "auto", reduceMotion: local.reduceMotion ?? "auto", buttonShapes: local.buttonShapes ?? false },
            onContextLost: () => local.onContextLost?.(), onContextRestored: message => local.onContextRestored?.(message)
        });
        if (!made.ok) { setError(made.error); local.onError?.(made.error); return; }
        const instance = made.value;
        setGlass(instance);
        onCleanup(() => { setGlass(null); instance.destroy(); });
    });
    createEffect(() => { glass()?.setAppearance(local.appearance ?? "auto"); });
    createEffect(() => { glass()?.setStacking(local.stacking ?? "exact"); });
    createEffect(() => { glass()?.setLightAngle(local.lightAngle ?? 0); });
    createEffect(() => { glass()?.setChromaticAberration(local.chromaticAberration ?? DEFAULT_CHROMATIC_ABERRATION); });
    createEffect(() => { glass()?.setExtendedRange(local.extendedRange ?? false, local.displayHeadroom ?? local.headroom ?? 2); });
    createEffect(() => { glass()?.setEnvironment({ active: local.active ?? true, tinted: local.tinted ?? false,
        reduceTransparency: local.reduceTransparency ?? "auto", increaseContrast: local.increaseContrast ?? "auto",
        reduceMotion: local.reduceMotion ?? "auto", buttonShapes: local.buttonShapes ?? false }); });
    createEffect(() => {
        const instance = glass(), source = local.backdrop ?? null, fit = local.fit ?? "cover", live = local.live ?? false;
        if (!instance) return;
        if (typeof source === "string") {
            const image = new Image(); image.crossOrigin = "anonymous"; image.src = source;
            instance.setBackdrop(image, fit, false);
        } else instance.setBackdrop(source, fit, live);
    });
    const style = (): JSX.CSSProperties | string => typeof local.style === "string"
        ? "position:relative;isolation:isolate;" + local.style : { position: "relative", isolation: "isolate", ...local.style };
    return <div {...dom} class={"glass-canvas" + (local.class ? " " + local.class : "")} style={style()}>
        <canvas ref={canvas} style={local.fixed === false ? COVER : FIXED} />
        <CanvasContext.Provider value={state}>{local.children}</CanvasContext.Provider>
    </div>;
}
