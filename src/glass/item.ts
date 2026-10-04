// What shapes and groups share: material, tint, opacity, visibility, press state and the scheme they show.
import { SCHEME_DARK, SCHEME_LIGHT, type Scheme } from "../layout.js";
import type { MaterialSpec, Rgba } from "../material.js";
import { presetMaterial, presetNumber } from "../preset.js";
import type { Renderer } from "../renderer/renderer.js";
import { foregroundOf } from "./environment.js";
import type { Glass } from "./glass.js";
import type { Appearance, Foreground, MaterialOptions, Preset, ShownScheme, Transition } from "./types.js";

const VEIL = 0.08;

/**
 * @internal Give an element the colours for content on glass as the custom properties `--glass-foreground` and
 * `--glass-title` (null takes them away again).
 */
export function paintElement(e: Element | null, fg: Foreground | null): void {
    if (e === null || !(e instanceof HTMLElement || e instanceof SVGElement)) return;
    const st = e.style;
    if (fg === null) { st.removeProperty("--glass-foreground"); st.removeProperty("--glass-title"); }
    else { st.setProperty("--glass-foreground", fg.text); st.setProperty("--glass-title", fg.title); }
}

/** Material, tint, opacity, visibility and press state shared by shapes and groups. */
export abstract class GlassItem {
    /** The glass this belongs to. */
    readonly glass: Glass;
    protected readonly renderer: Renderer;
    protected id: number;
    protected preset: Preset;
    protected appearance: Appearance | null;
    protected material: Partial<MaterialSpec> | null;
    protected tint: Rgba | null;
    protected opacity: number;
    protected visible: boolean;
    protected pressed: boolean;
    protected transition: Transition;
    protected adaptive: boolean;
    protected onScheme: ((scheme: ShownScheme) => void) | null;
    protected side: number;
    protected removed: boolean;
    // scheme last reported: 0 dark, 1 light, -1 none yet
    protected shown: number;
    /** Why the last material or mask was rejected ("" when it was accepted). */
    error: string;

    /** @internal */
    constructor(glass: Glass, renderer: Renderer, o: MaterialOptions) {
        this.glass = glass;
        this.renderer = renderer;
        this.id = 0;
        this.preset = o.preset ?? "standard";
        this.appearance = o.appearance ?? null;
        this.material = o.material ?? null;
        this.tint = o.tint ?? null;
        this.opacity = o.opacity ?? 1;
        this.visible = o.visible ?? true;
        this.pressed = o.pressed ?? false;
        this.transition = o.transition ?? "materialize";
        this.adaptive = o.adaptive ?? true;
        this.onScheme = o.onScheme ?? null;
        this.side = -1;
        this.removed = false;
        this.shown = -1;
        this.error = "";
    }

    /** Handle of the shape in the renderer, for the low-level calls. It is dead once this is removed. */
    get handle(): number {
        return this.id;
    }

    /** False once removed (or while the removal is fading out). */
    get alive(): boolean {
        return !this.removed;
    }

    /**
     * The scheme the glass shows now: that of its surroundings, or for small adaptive glass the one it took from the
     * backdrop under it (light over a bright backdrop). Content on the glass should follow it.
     */
    get shownScheme(): ShownScheme {
        return this.current() === SCHEME_DARK ? "dark" : "light";
    }

    /**
     * Colours for content on this glass: near-white on dark glass, near-black on light glass, white on the
     * "prominent" preset. Elements the glass follows get them as the custom properties `--glass-foreground` and
     * `--glass-title`.
     */
    get foreground(): Foreground {
        return foregroundOf(this.current(), this.preset === "prominent");
    }

    /** Show the glass (with the transition of this item). */
    show(): this {
        return this.setVisible(true);
    }

    /** Hide the glass (with the transition of this item); it keeps its place and can be shown again. */
    hide(): this {
        return this.setVisible(false);
    }

    /** Set the press veil. */
    press(down: boolean): this {
        if (!this.removed && down !== this.pressed) { this.pressed = down; this.applyVeil(); this.glass.update(); }
        return this;
    }

    /** Remove the glass; with the "materialize" transition it fades out first. */
    remove(): void {
        if (this.removed) return;
        this.unfollow();
        this.removed = true;
        const r = this.renderer;
        if (this.transition === "materialize" && r.getPresence(this.id) > 0) { r.animatePresence(this.id, 0); this.glass.leave(this); }
        else { r.removeShape(this.id); this.glass.forget(this); }
        this.glass.update();
    }

    /** @internal */
    scheme(): Scheme {
        const a = this.appearance ?? this.glass.appearanceSetting();
        return a === "dark" ? SCHEME_DARK : a === "light" ? SCHEME_LIGHT : this.glass.prefersDark() ? SCHEME_DARK : SCHEME_LIGHT;
    }

    /** @internal Whether the item follows the page colour scheme. */
    automatic(): boolean {
        return (this.appearance ?? this.glass.appearanceSetting()) === "auto";
    }

    /** @internal Whether the material is a description built here (it has to be built again when the surroundings change). */
    described(): boolean {
        return this.material !== null;
    }

    /** @internal Whether the tint is the accent colour of the glass. */
    accented(): boolean {
        return this.preset === "prominent" && this.tint === null;
    }

    /** @internal Material, tint and veil again (the colour scheme or the surroundings changed). */
    restyle(): void {
        if (this.removed) return;
        this.applyMaterial();
        this.applyVeil();
    }

    /** @internal The tint again (the accent colour changed). */
    retint(): void {
        if (!this.removed) this.applyTint();
    }

    /** @internal Report a change of the shown scheme: colours on the followed elements, then the callback. */
    sync(): void {
        if (this.removed) return;
        const s = this.current();
        if (s === this.shown) return;
        this.shown = s;
        this.paint();
        const f = this.onScheme;
        if (f !== null) f(s === SCHEME_DARK ? "dark" : "light");
    }

    /** @internal The renderer finished fading this out. */
    drop(): void {
        this.renderer.removeShape(this.id);
    }

    /** @internal */
    unfollow(): void {
        // shapes and members override this
    }

    /** @internal The element that places this in the drawing order (document order), or null. */
    anchor(): Element | null {
        return null;
    }

    // Short side the preset description is made for.
    protected abstract shortSide(): number;

    // Colours for content on the followed elements.
    protected abstract paint(): void;

    // The scheme shown now: the adapted one of small built-in glass, else the scheme of the surroundings.
    protected current(): Scheme {
        const m = this.removed ? -1 : this.renderer.getScheme(this.id);
        return m < 0 ? this.scheme() : m >= 0.5 ? SCHEME_LIGHT : SCHEME_DARK;
    }

    protected setVisible(v: boolean): this {
        if (!this.removed && v !== this.visible) {
            this.visible = v;
            if (this.transition === "materialize") this.renderer.animatePresence(this.id, v ? 1 : 0);
            else this.renderer.setPresence(this.id, v ? 1 : 0);
            this.glass.update();
        }
        return this;
    }

    // Apply the fields of MaterialOptions present in `u`; returns true when the material has to be applied again.
    protected takeMaterial(u: Partial<MaterialOptions>): boolean {
        let mat = false;
        if (u.preset !== undefined && u.preset !== this.preset) { this.preset = u.preset; mat = true; this.shown = -1; }
        if (u.appearance !== undefined && u.appearance !== this.appearance) { this.appearance = u.appearance; mat = true; this.applyVeil(); }
        if (u.material !== undefined) { this.material = u.material; mat = true; }
        if (u.tint !== undefined) { this.tint = u.tint; if (!mat) this.applyTint(); }
        if (u.opacity !== undefined && u.opacity !== this.opacity) { this.opacity = u.opacity; this.renderer.setOpacity(this.id, u.opacity); }
        if (u.transition !== undefined) this.transition = u.transition;
        if (u.pressed !== undefined && u.pressed !== this.pressed) { this.pressed = u.pressed; this.applyVeil(); }
        if (u.adaptive !== undefined && u.adaptive !== this.adaptive) { this.adaptive = u.adaptive; this.renderer.setAdaptive(this.id, u.adaptive); }
        if (u.onScheme !== undefined) { this.onScheme = u.onScheme; this.shown = -1; }
        return mat;
    }

    protected applyMaterial(): void {
        // "prominent" is the standard material under the accent; a name the table does not have is the standard material
        const r = this.renderer, s = this.scheme(), m = this.material, n = presetNumber(this.preset), p = n < 0 ? 0 : n;
        if (m !== null) {
            const side = this.shortSide(), env = this.glass.environment, share = this.glass.rangeShare();
            const made = r.setMaterial(this.id, { ...presetMaterial(p, side, s, env, share), ...m });
            this.error = made.ok ? "" : made.error;
            this.side = side;
        } else {
            r.setPreset(this.id, p, s);
            this.side = -1;
        }
        this.applyTint();
    }

    protected applyTint(): void {
        const t = this.tint, r = this.renderer;
        if (t !== null) r.setTint(this.id, t[0], t[1], t[2], t[3]);
        else if (this.preset === "prominent") { const a = this.glass.accentColour(); r.setTint(this.id, a[0], a[1], a[2], 1); }
        else r.setTint(this.id, 0, 0, 0, 0);
    }

    protected applyVeil(): void {
        this.renderer.setVeil(this.id, this.scheme() === SCHEME_DARK ? 1 : 0, this.pressed ? VEIL : 0);
    }

    // State after the renderer made the shape: everything that differs from its defaults.
    protected start(): void {
        const r = this.renderer;
        if (this.material !== null || this.preset !== "standard") this.applyMaterial();
        else if (this.tint !== null) this.applyTint();
        if (this.opacity !== 1) r.setOpacity(this.id, this.opacity);
        if (this.pressed) this.applyVeil();
        if (!this.adaptive) r.setAdaptive(this.id, false);
        if (!this.visible) r.setPresence(this.id, 0);
    }
}
