/**
 * @file Glass.tsx
 * @brief React component that tracks a DOM box with glass.
 * @details Content inherits --glass-foreground and --glass-title. Group members contribute
 * geometry; the group owns their material.
 */

import {
    forwardRef, useCallback, useContext, useEffect, useRef, useState, type CSSProperties, type HTMLAttributes, type PointerEvent,
    type ReactNode, type Ref
} from "react";
import type {
    Appearance, CornerStyle, GlassShape, GroupMember, Preset, Radius, Rgba, ShownScheme, Transition
} from "glassrender";
import { CanvasContext, GroupContext } from "./context.js";

/** @brief Glass geometry and appearance combined with the outer div's DOM attributes. */
export interface GlassProps extends HTMLAttributes<HTMLDivElement> {
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
     * @brief Outline of any shape instead of a rounded rectangle: the alpha channel of an image or
     * canvas, stretched over the box.
     * @details It has to be there when the box is first drawn; later values replace the mask.
     */
    mask?: TexImageSource;
    /** @brief Small glass follows the luminance of the backdrop under it (default true). */
    adaptive?: boolean;
    /**
     * @brief Called with "dark" or "light" when the scheme the glass shows changes (and once at the
     * start).
     */
    onScheme?: (scheme: ShownScheme) => void;
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
    children?: ReactNode;
}

// Match DOM backgrounds and outlines to the glass corners.
function rounding(radius: Radius | undefined): string {
    return radius === undefined ? "9999px" : typeof radius === "number" ? radius + "px" : radius.map((r) => r + "px").join(" ");
}

function assign(ref: Ref<HTMLDivElement> | undefined, el: HTMLDivElement | null): void {
    if (typeof ref === "function") ref(el);
    else if (ref !== null && ref !== undefined) (ref as { current: HTMLDivElement | null }).current = el;
}

/**
 * @brief Track the outer div with a glass shape and forward its DOM ref.
 * @details Inside a group, only geometry options apply; the group supplies the material.
 */
export const Glass = forwardRef<HTMLDivElement, GlassProps>(function Glass(props, ref) {
    const {
        preset = "standard", appearance, radius, corner = "smooth", mask, adaptive = true, onScheme: _onScheme, tint = null,
        opacity = 1, chromaticAberration = null, visible = true, pressed = false, interactive = false, transition = "materialize", everyFrame = false, children,
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
            member.current = m;
            return () => {
                member.current = null;
                m.remove();
            };
        }
        if (glass === null) return;
        const s = glass.add({
            x: 0, y: 0, width: 0, height: 0, corner: p.corner ?? "smooth",
            tint: p.tint ?? null, opacity: p.opacity ?? 1, chromaticAberration: p.chromaticAberration ?? null, visible: p.visible ?? true, transition: p.transition ?? "materialize",
            adaptive: p.adaptive ?? true, pressed: p.pressed ?? false,
            onScheme: (scheme: ShownScheme) => latest.current.onScheme?.(scheme),
            ...(p.radius === undefined ? {} : { radius: p.radius }), ...(p.preset === undefined ? {} : { preset: p.preset }), ...(p.appearance === undefined ? {} : { appearance: p.appearance }),
            ...(p.mask === undefined ? {} : { mask: p.mask })
        });
        shape.current = s;
        return () => {
            shape.current = null;
            s.remove();
        };
    }, [glass, group]);

    useEffect(() => {
        const el = box.current;
        if (el === null) return;
        shape.current?.follow(el, everyFrame);
        member.current?.follow(el, everyFrame);
    }, [glass, group, everyFrame]);

    const radiusKey = radius === undefined ? "" : typeof radius === "number" ? String(radius) : radius.join(" ");
    const t0 = tint?.[0], t1 = tint?.[1], t2 = tint?.[2], t3 = tint?.[3];
    useEffect(() => { shape.current?.set({ preset }); }, [preset]);
    useEffect(() => { shape.current?.set({ chromaticAberration }); }, [chromaticAberration]);
    useEffect(() => { if (appearance !== undefined) shape.current?.set({ appearance }); }, [appearance]);
    useEffect(() => {
        shape.current?.set({ radius: radius ?? null });
        member.current?.set({ radius: radius ?? null });
    }, [radiusKey]);
    useEffect(() => {
        if (mask === undefined) return;
        shape.current?.set({ mask });
        member.current?.set({ mask });
    }, [mask]);
    useEffect(() => { shape.current?.set({ adaptive }); }, [adaptive]);
    useEffect(() => { shape.current?.set({ corner }); }, [corner]);
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
