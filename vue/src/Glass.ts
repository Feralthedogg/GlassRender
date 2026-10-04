// A box with glass under it. The glass follows the box as the page lays it out, scrolls and resizes; the content of
// the box sits on the glass and takes the colour for content on it (`--glass-foreground`; `--glass-title` is the
// colour for a control title). Inside a `GlassGroup` the box becomes a member of the group's glass and only its
// outline options (radius, corner, mask) apply.
import { defineComponent, h, inject, mergeProps, onBeforeUnmount, ref, shallowRef, watch, type PropType } from "vue";
import type {
    Appearance, CornerStyle, GlassShape, GroupMember, MaterialSpec, Preset, Radius, Rgba, ShownScheme, Transition
} from "glassrender";
import { CANVAS_KEY, GROUP_KEY } from "./context.js";

type Handler = ((e: PointerEvent) => void) | ((e: PointerEvent) => void)[] | undefined;

// the box keeps the corners of its glass, so its own background or outline matches
function rounding(radius: Radius | undefined): string {
    return radius === undefined ? "9999px" : typeof radius === "number" ? radius + "px" : radius.map((r) => r + "px").join(" ");
}

function call(handler: unknown, e: PointerEvent): void {
    const f = handler as Handler;
    if (typeof f === "function") f(e);
    else if (Array.isArray(f)) for (const g of f) g(e);
}

export const Glass = defineComponent({
    name: "Glass",
    inheritAttrs: false,
    props: {
        /** Built-in material: "standard" (default), "clear", "prominent" (tinted with the accent colour), "menu", "dock", ... */
        preset: { type: String as PropType<Preset>, default: "standard" },
        /** Surroundings (default: the canvas setting). */
        appearance: { type: String as PropType<Appearance | undefined>, default: undefined },
        /** Corner radius in CSS pixels, or four radii (top-left, top-right, bottom-right, bottom-left). Default: half the short side. */
        radius: { type: [Number, Array] as unknown as PropType<Radius | undefined>, default: undefined },
        /** Corner construction (default "smooth"). */
        corner: { type: String as PropType<CornerStyle>, default: "smooth" },
        /**
         * Outline of any shape instead of a rounded rectangle: the alpha channel of an image or canvas, stretched over
         * the box. It has to be there when the box is first drawn; later values replace the mask.
         */
        mask: { type: Object as PropType<TexImageSource | undefined>, default: undefined },
        /** Small glass follows the luminance of the backdrop under it (default true). */
        adaptive: { type: Boolean, default: true },
        /** Fields replacing those of the preset's description. */
        material: { type: Object as PropType<Partial<MaterialSpec> | null>, default: null },
        /** Colour laid over the glass; its alpha is the strength. */
        tint: { type: Array as unknown as PropType<Rgba | null>, default: null },
        /** Opacity of the glass with its shadow (default 1). */
        opacity: { type: Number, default: 1 },
        /** Shown (default) or hidden. */
        visible: { type: Boolean, default: true },
        /** Pressed veil. */
        pressed: { type: Boolean, default: false },
        /** Show the pressed veil while a pointer is down on the box. */
        interactive: { type: Boolean, default: false },
        /** How visibility changes and removal look (default "materialize"). */
        transition: { type: String as PropType<Transition>, default: "materialize" },
        /** Measure the box on every frame (for boxes moved by CSS animations or transforms). */
        everyFrame: { type: Boolean, default: false }
    },
    emits: {
        /** "dark" or "light" when the scheme the glass shows changes (and once at the start). */
        scheme: (_scheme: ShownScheme) => true
    },
    setup(props, { attrs, emit, slots }) {
        const canvas = inject(CANVAS_KEY, undefined), group = inject(GROUP_KEY, undefined);
        const box = shallowRef<HTMLDivElement | null>(null);
        const down = ref(false);
        let pressPointer: number | null = null;
        let pressCleanup: (() => void) | null = null;
        let shape: GlassShape | null = null, member: GroupMember | null = null;

        onBeforeUnmount(() => { pressCleanup?.(); });

        // the shape (or the member of the group around it) once the box and the glass are there
        watch(() => [box.value, canvas === undefined ? null : canvas.glass, group === undefined ? null : group.group] as const, ([el, glass, g], _old, onCleanup) => {
            if (el === null) return;
            if (group !== undefined) {
                if (g === null) return;
                const m = g.add({
                    x: 0, y: 0, width: 0, height: 0, corner: props.corner, ...(props.radius === undefined ? {} : { radius: props.radius }),
                    ...(props.mask === undefined ? {} : { mask: props.mask })
                });
                if (m === null) return;
                m.follow(el, props.everyFrame);
                member = m;
                onCleanup(() => {
                    member = null;
                    m.remove();
                });
                return;
            }
            if (glass === null) return;
            const s = glass.add({
                x: 0, y: 0, width: 0, height: 0, preset: props.preset, corner: props.corner, material: props.material, tint: props.tint,
                opacity: props.opacity, visible: props.visible, transition: props.transition, adaptive: props.adaptive,
                pressed: props.pressed || down.value,
                onScheme: (scheme: ShownScheme) => emit("scheme", scheme),
                ...(props.radius === undefined ? {} : { radius: props.radius }), ...(props.appearance === undefined ? {} : { appearance: props.appearance }),
                ...(props.mask === undefined ? {} : { mask: props.mask })
            });
            s.follow(el, props.everyFrame);
            shape = s;
            onCleanup(() => {
                shape = null;
                s.remove();
            });
        }, { immediate: true, flush: "post" });

        watch(() => props.preset, (v) => { shape?.set({ preset: v }); });
        watch(() => props.appearance, (v) => { if (v !== undefined) shape?.set({ appearance: v }); });
        watch(() => (props.radius === undefined ? "" : typeof props.radius === "number" ? String(props.radius) : props.radius.join(" ")), () => {
            const v = props.radius;
            if (v === undefined) return;
            shape?.set({ radius: v });
            member?.set({ radius: v });
        });
        watch(() => props.mask, (v) => {
            if (v === undefined) return;
            shape?.set({ mask: v });
            member?.set({ mask: v });
        });
        watch(() => props.adaptive, (v) => { shape?.set({ adaptive: v }); });
        watch(() => props.corner, (v) => { shape?.set({ corner: v }); });
        watch(() => props.material, (v) => { shape?.set({ material: v }); });
        watch(() => (props.tint === null ? "" : props.tint.join(",")), () => { shape?.set({ tint: props.tint }); });
        watch(() => props.opacity, (v) => { shape?.set({ opacity: v }); });
        watch(() => props.visible, (v) => { shape?.set({ visible: v }); });
        watch(() => props.transition, (v) => { shape?.set({ transition: v }); });
        watch(() => props.pressed || down.value, (v) => { shape?.press(v); });

        const releasePress = (pointerId?: number): void => {
            if (pointerId !== undefined && pointerId !== pressPointer) return;
            pressCleanup?.();
            down.value = false;
        };

        // Observe releases without capturing the pointer away from a child button or link.
        const pointerdown = (e: PointerEvent): void => {
            call(attrs.onPointerdown, e);
            if (!props.interactive || e.defaultPrevented || pressPointer !== null) return;
            const doc = (e.currentTarget as HTMLElement).ownerDocument, win = doc.defaultView;
            const finish = (event: PointerEvent): void => { releasePress(event.pointerId); };
            const blur = (): void => { releasePress(); };
            pressPointer = e.pointerId;
            pressCleanup = () => {
                doc.removeEventListener("pointerup", finish, true);
                doc.removeEventListener("pointercancel", finish, true);
                win?.removeEventListener("blur", blur);
                pressPointer = null;
                pressCleanup = null;
            };
            doc.addEventListener("pointerup", finish, true);
            doc.addEventListener("pointercancel", finish, true);
            win?.addEventListener("blur", blur);
            down.value = true;
        };
        const pointerup = (e: PointerEvent): void => { call(attrs.onPointerup, e); releasePress(e.pointerId); };
        const pointercancel = (e: PointerEvent): void => { call(attrs.onPointercancel, e); releasePress(e.pointerId); };
        const lostcapture = (e: PointerEvent): void => { call(attrs.onLostpointercapture, e); releasePress(e.pointerId); };

        return () => {
            const { onPointerdown: _a, onPointerup: _b, onPointercancel: _c, onLostpointercapture: _d, ...rest } = attrs;
            return h("div", mergeProps({ class: "glass-box", style: { borderRadius: rounding(props.radius) } }, rest, {
                ref: box, onPointerdown: pointerdown, onPointerup: pointerup, onPointercancel: pointercancel, onLostpointercapture: lostcapture
            }), slots.default === undefined ? undefined : slots.default());
        };
    }
});
