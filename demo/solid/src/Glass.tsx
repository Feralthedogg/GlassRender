import { createEffect, createSignal, onMount, onCleanup, splitProps, untrack, useContext, type JSX } from "solid-js";
import type { GlassShape, GroupMember, MaterialOptions, Radius, CornerStyle } from "glassrender";
import { CanvasContext, GroupContext } from "./context.js";

export interface GlassProps extends JSX.HTMLAttributes<HTMLDivElement>, MaterialOptions {
    radius?: Radius;
    corner?: CornerStyle;
    mask?: TexImageSource;
    interactive?: boolean;
    everyFrame?: boolean;
}

function rounding(radius: Radius | undefined): string {
    return radius === undefined ? "9999px" : typeof radius === "number" ? radius + "px" : radius.map(r => r + "px").join(" ");
}

export function Glass(props: GlassProps): JSX.Element {
    const [local, dom] = splitProps(props, ["children", "ref", "class", "style", "preset", "appearance", "radius", "corner", "mask", "adaptive", "onScheme", "tint", "opacity",
        "chromaticAberration", "visible", "pressed", "interactive", "transition", "everyFrame", "onPointerDown", "onPointerUp", "onPointerCancel", "onLostPointerCapture"]);
    const canvas = useContext(CanvasContext), group = useContext(GroupContext);
    let box!: HTMLDivElement, pointer: number | null = null, removePressListeners: (() => void) | null = null;
    const [mounted, setMounted] = createSignal(false), [shape, setShape] = createSignal<GlassShape | null>(null), [member, setMember] = createSignal<GroupMember | null>(null), [down, setDown] = createSignal(false);
    onMount(() => setMounted(true));
    createEffect(() => {
        if (!mounted()) return;
        const instance = canvas?.glass, parent = group?.();
        if (group && !parent) return;
        if (!group && !instance) return;
        untrack(() => {
            if (parent) {
                const current = parent.add({ x: 0, y: 0, width: 0, height: 0, radius: local.radius, corner: local.corner ?? "smooth", mask: local.mask });
                if (!current) return;
                setMember(current);
                onCleanup(() => { setMember(null); current.remove(); });
            } else if (instance) {
                const current = instance.add({ x: 0, y: 0, width: 0, height: 0, radius: local.radius, corner: local.corner ?? "smooth", mask: local.mask,
                    preset: local.preset ?? "standard", appearance: local.appearance, tint: local.tint ?? null, opacity: local.opacity ?? 1,
                    chromaticAberration: local.chromaticAberration ?? null, visible: local.visible ?? true, adaptive: local.adaptive ?? true,
                    pressed: local.pressed ?? false, transition: local.transition ?? "materialize", onScheme: scheme => local.onScheme?.(scheme) });
                setShape(current);
                onCleanup(() => { setShape(null); current.remove(); });
            }
        });
    });
    createEffect(() => { const everyFrame = local.everyFrame ?? false; shape()?.follow(box, everyFrame); member()?.follow(box, everyFrame); });
    createEffect(() => { shape()?.set({ preset: local.preset ?? "standard" }); });
    createEffect(() => { if (local.appearance !== undefined) shape()?.set({ appearance: local.appearance }); });
    createEffect(() => { const radius = local.radius ?? null; shape()?.set({ radius }); member()?.set({ radius }); });
    createEffect(() => { if (local.mask !== undefined) { shape()?.set({ mask: local.mask }); member()?.set({ mask: local.mask }); } });
    createEffect(() => { shape()?.set({ corner: local.corner ?? "smooth" }); });
    createEffect(() => { shape()?.set({ adaptive: local.adaptive ?? true }); });
    createEffect(() => { shape()?.set({ tint: local.tint ?? null }); });
    createEffect(() => { shape()?.set({ opacity: local.opacity ?? 1 }); });
    createEffect(() => { shape()?.set({ chromaticAberration: local.chromaticAberration ?? null }); });
    createEffect(() => { shape()?.set({ visible: local.visible ?? true }); });
    createEffect(() => { shape()?.set({ transition: local.transition ?? "materialize" }); });
    createEffect(() => { shape()?.press((local.pressed ?? false) || down()); });
    const release = (id?: number): void => {
        if (id !== undefined && id !== pointer) return;
        removePressListeners?.(); setDown(false);
    };
    onCleanup(() => removePressListeners?.());
    createEffect(() => { if (!local.interactive) release(); });
    type Event = PointerEvent & { currentTarget: HTMLDivElement; target: Element };
    const call = (handler: JSX.EventHandlerUnion<HTMLDivElement, PointerEvent> | undefined, event: Event): void => {
        if (typeof handler === "function") handler(event); else if (handler) handler[0](handler[1], event);
    };
    const pointerDown: JSX.EventHandler<HTMLDivElement, PointerEvent> = event => {
        call(local.onPointerDown, event);
        if (!local.interactive || event.defaultPrevented || pointer !== null) return;
        const doc = box.ownerDocument, win = doc.defaultView;
        const finish = (e: PointerEvent): void => release(e.pointerId), blur = (): void => release();
        pointer = event.pointerId;
        removePressListeners = () => { doc.removeEventListener("pointerup", finish, true); doc.removeEventListener("pointercancel", finish, true);
            win?.removeEventListener("blur", blur); pointer = null; removePressListeners = null; };
        doc.addEventListener("pointerup", finish, true); doc.addEventListener("pointercancel", finish, true); win?.addEventListener("blur", blur); setDown(true);
    };
    const style = (): JSX.CSSProperties | string => typeof local.style === "string"
        ? "border-radius:" + rounding(local.radius) + ";" + local.style : { "border-radius": rounding(local.radius), ...local.style };
    return <div {...dom} ref={el => { box = el; if (typeof local.ref === "function") local.ref(el); }}
        class={"glass-box" + (local.class ? " " + local.class : "")} style={style()} onPointerDown={pointerDown}
        onPointerUp={event => { call(local.onPointerUp, event); release(event.pointerId); }}
        onPointerCancel={event => { call(local.onPointerCancel, event); release(event.pointerId); }}
        onLostPointerCapture={event => { call(local.onLostPointerCapture, event); release(event.pointerId); }}>
        {local.children}
    </div>;
}
