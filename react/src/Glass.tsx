// A box with glass under it. The glass follows the box as the page lays it out, scrolls and resizes; the content of
// the box sits on the glass and takes the colour for content on it (`--glass-foreground`; `--glass-title` is the
// colour for a control title). Inside a `GlassGroup` the box becomes a member of the group's glass and only its
// outline options (radius, corner, mask) apply.
import {
    forwardRef, useCallback, useContext, useEffect, useRef, useState, type CSSProperties, type HTMLAttributes, type PointerEvent,
    type ReactNode, type Ref
} from "react";
import type {
    Appearance, CornerStyle, GlassShape, GroupMember, MaterialSpec, Preset, Radius, Rgba, ShownScheme, Transition
} from "glassrender";
import { CanvasContext, GroupContext } from "./context.js";

export interface GlassProps extends HTMLAttributes<HTMLDivElement> {
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
    onScheme?: (scheme: ShownScheme) => void;
    /** Fields replacing those of the preset's description (keep the same object while it does not change). */
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
    children?: ReactNode;
}

// the box keeps the corners of its glass, so its own background or outline matches
function rounding(radius: Radius | undefined): string {
    return radius === undefined ? "9999px" : typeof radius === "number" ? radius + "px" : radius.map((r) => r + "px").join(" ");
}

function assign(ref: Ref<HTMLDivElement> | undefined, el: HTMLDivElement | null): void {
    if (typeof ref === "function") ref(el);
    else if (ref !== null && ref !== undefined) (ref as { current: HTMLDivElement | null }).current = el;
}

export const Glass = forwardRef<HTMLDivElement, GlassProps>(function Glass(props, ref) {
    const {
        preset = "standard", appearance, radius, corner = "smooth", mask, adaptive = true, onScheme: _onScheme, material = null, tint = null,
        opacity = 1, visible = true, pressed = false, interactive = false, transition = "materialize", everyFrame: _everyFrame, children,
        style, className, onPointerDown, onPointerUp, onPointerCancel, onLostPointerCapture, ...rest
    } = props;
    const canvas = useContext(CanvasContext), group = useContext(GroupContext), glass = canvas === null ? null : canvas.glass;
    const box = useRef<HTMLDivElement | null>(null);
    const shape = useRef<GlassShape | null>(null), member = useRef<GroupMember | null>(null);
    const [down, setDown] = useState(false);
    const pressPointer = useRef<number | null>(null);
    const pressCleanup = useRef<(() => void) | null>(null);
    const latest = useRef(props);
    latest.current = props;

    useEffect(() => () => { pressCleanup.current?.(); }, []);

    useEffect(() => {
        const el = box.current, p = latest.current;
        if (el === null) return;
        if (group !== undefined) {
            if (group === null) return;
            const m = group.add({
                x: 0, y: 0, width: 0, height: 0, corner: p.corner ?? "smooth", ...(p.radius === undefined ? {} : { radius: p.radius }),
                ...(p.mask === undefined ? {} : { mask: p.mask })
            });
            if (m === null) return;
            m.follow(el, p.everyFrame ?? false);
            member.current = m;
            return () => {
                member.current = null;
                m.remove();
            };
        }
        if (glass === null) return;
        const s = glass.add({
            x: 0, y: 0, width: 0, height: 0, preset: p.preset ?? "standard", corner: p.corner ?? "smooth", material: p.material ?? null,
            tint: p.tint ?? null, opacity: p.opacity ?? 1, visible: p.visible ?? true, transition: p.transition ?? "materialize",
            adaptive: p.adaptive ?? true, pressed: p.pressed ?? false,
            onScheme: (scheme: ShownScheme) => latest.current.onScheme?.(scheme),
            ...(p.radius === undefined ? {} : { radius: p.radius }), ...(p.appearance === undefined ? {} : { appearance: p.appearance }),
            ...(p.mask === undefined ? {} : { mask: p.mask })
        });
        s.follow(el, p.everyFrame ?? false);
        shape.current = s;
        return () => {
            shape.current = null;
            s.remove();
        };
    }, [glass, group]);

    const radiusKey = radius === undefined ? "" : typeof radius === "number" ? String(radius) : radius.join(" ");
    const t0 = tint?.[0], t1 = tint?.[1], t2 = tint?.[2], t3 = tint?.[3];
    useEffect(() => { shape.current?.set({ preset }); }, [preset]);
    useEffect(() => { if (appearance !== undefined) shape.current?.set({ appearance }); }, [appearance]);
    useEffect(() => {
        if (radius === undefined) return;
        shape.current?.set({ radius });
        member.current?.set({ radius });
    }, [radiusKey]);
    useEffect(() => {
        if (mask === undefined) return;
        shape.current?.set({ mask });
        member.current?.set({ mask });
    }, [mask]);
    useEffect(() => { shape.current?.set({ adaptive }); }, [adaptive]);
    useEffect(() => { shape.current?.set({ corner }); }, [corner]);
    useEffect(() => { shape.current?.set({ material }); }, [material]);
    useEffect(() => {
        shape.current?.set({ tint: t0 === undefined || t1 === undefined || t2 === undefined || t3 === undefined ? null : [t0, t1, t2, t3] });
    }, [t0, t1, t2, t3]);
    useEffect(() => { shape.current?.set({ opacity }); }, [opacity]);
    useEffect(() => { shape.current?.set({ visible }); }, [visible]);
    useEffect(() => { shape.current?.set({ transition }); }, [transition]);
    useEffect(() => { shape.current?.press(pressed || down); }, [pressed, down]);

    const releasePress = (pointerId?: number): void => {
        if (pointerId !== undefined && pointerId !== pressPointer.current) return;
        pressCleanup.current?.();
        setDown(false);
    };

    // Observe releases without capturing the pointer away from a child button or link.
    const pointerDown = (e: PointerEvent<HTMLDivElement>): void => {
        onPointerDown?.(e);
        if (!interactive || e.defaultPrevented || pressPointer.current !== null) return;
        const doc = e.currentTarget.ownerDocument, win = doc.defaultView;
        const finish = (event: globalThis.PointerEvent): void => { releasePress(event.pointerId); };
        const blur = (): void => { releasePress(); };
        pressPointer.current = e.pointerId;
        pressCleanup.current = () => {
            doc.removeEventListener("pointerup", finish, true);
            doc.removeEventListener("pointercancel", finish, true);
            win?.removeEventListener("blur", blur);
            pressPointer.current = null;
            pressCleanup.current = null;
        };
        doc.addEventListener("pointerup", finish, true);
        doc.addEventListener("pointercancel", finish, true);
        win?.addEventListener("blur", blur);
        setDown(true);
    };
    const pointerUp = (e: PointerEvent<HTMLDivElement>): void => { onPointerUp?.(e); releasePress(e.pointerId); };
    const pointerCancel = (e: PointerEvent<HTMLDivElement>): void => { onPointerCancel?.(e); releasePress(e.pointerId); };
    const lostCapture = (e: PointerEvent<HTMLDivElement>): void => { onLostPointerCapture?.(e); releasePress(e.pointerId); };
    const merged: CSSProperties = { borderRadius: rounding(radius), ...style };
    const attach = useCallback((el: HTMLDivElement | null): void => { box.current = el; assign(ref, el); }, [ref]);

    return (
        <div {...rest} ref={attach}
            className={className === undefined || className === "" ? "glass-box" : "glass-box " + className} style={merged}
            onPointerDown={pointerDown} onPointerUp={pointerUp} onPointerCancel={pointerCancel} onLostPointerCapture={lostCapture}>
            {children}
        </div>
    );
});
