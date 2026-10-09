/**
 * @file shape.ts
 * @brief Standalone glass frames, masks and DOM bounds tracking.
 */

import type { Renderer } from "../renderer/renderer.js";
import type { Glass } from "./glass.js";
import { GlassItem, paintElement } from "./item.js";
import { kindOf, roundOf, type CornerStyle, type Radius, type ShapeOptions, type ShapeUpdate } from "./types.js";

/**
 * @brief One piece of glass on a canvas.
 * @details Made by `Glass.add`.
 */
export class GlassShape extends GlassItem {
    private x: number;
    private y: number;
    private width: number;
    private height: number;
    private radius: Radius | null;
    private corner: CornerStyle;
    private masked: boolean;
    /** @internal */
    element: Element | null;
    /** @internal */
    everyFrame: boolean;

    /**
     * @brief Use `Glass.add`.
     * @internal
     */
    constructor(glass: Glass, renderer: Renderer, o: ShapeOptions) {
        super(glass, renderer, o);
        this.x = o.x;
        this.y = o.y;
        this.width = o.width;
        this.height = o.height;
        this.radius = o.radius ?? null;
        this.corner = o.corner ?? "smooth";
        this.masked = false;
        this.element = null;
        this.everyFrame = false;
        if (o.mask !== undefined) {
            const made = renderer.addMask(o.mask, this.x, this.y, this.width, this.height, this.scheme());
            if (made.ok) { this.id = made.value; this.masked = true; } else this.error = made.error;
        }
        if (!this.masked) {
            this.id = renderer.addShape(this.x, this.y, this.width, this.height, this.round(), kindOf(this.corner), this.scheme());
            this.applyCorners();
        }
        this.start();
    }

    /** @brief Change any options; the ones left out keep their value. */
    set(u: ShapeUpdate): this {
        if (this.removed) return this;
        let geo = false;
        if (u.x !== undefined) { this.x = u.x; geo = true; }
        if (u.y !== undefined) { this.y = u.y; geo = true; }
        if (u.width !== undefined) { this.width = u.width; geo = true; }
        if (u.height !== undefined) { this.height = u.height; geo = true; }
        if (u.radius !== undefined) { this.radius = u.radius; geo = true; }
        if (u.corner !== undefined && u.corner !== this.corner) { this.corner = u.corner; this.renderer.setCorner(this.id, kindOf(u.corner)); }
        if (u.mask !== undefined) {
            if (this.masked) { this.renderer.setMask(this.id, u.mask); this.error = ""; }
            else this.error = "only a shape made with a mask can get another mask";
        }
        const mat = this.takeMaterial(u);
        if (geo) this.applyGeometry();
        if (mat) this.applyMaterial();
        if (u.visible !== undefined) this.setVisible(u.visible);
        this.glass.update();
        return this;
    }

    /** @brief Move the shape (CSS pixels). */
    move(x: number, y: number): this {
        if (!this.removed && (x !== this.x || y !== this.y)) { this.x = x; this.y = y; this.applyGeometry(); this.glass.update(); }
        return this;
    }

    /** @brief Resize the shape (CSS pixels), keeping its top-left corner. */
    resize(width: number, height: number): this {
        if (!this.removed && (width !== this.width || height !== this.height)) {
            this.width = width; this.height = height; this.applyGeometry(); this.glass.update();
        }
        return this;
    }

    /**
     * @brief Take the frame from an element's box, now and whenever the element is resized or the
     * page scrolls.
     * @details The element gets the colors for content on this glass as the custom properties
     * `--glass-foreground` and `--glass-title`.
     * @param everyFrame Measure it on every frame as well (for elements moved by CSS animations or
     * transforms).
     */
    follow(element: Element, everyFrame = false): this {
        if (this.removed) return this;
        this.unfollow();
        this.element = element;
        this.everyFrame = everyFrame;
        this.glass.watch(this);
        paintElement(element, this.foreground);
        return this;
    }

    /** @brief Stop following an element. */
    override unfollow(): void {
        if (this.element !== null) {
            this.glass.unwatch(this);
            paintElement(this.element, null);
            this.element = null; this.everyFrame = false;
        }
    }

    /** @internal */
    override anchor(): Element | null {
        return this.element;
    }

    /**
     * @brief Frame measured from the followed element.
     * @internal
     */
    place(x: number, y: number, w: number, h: number): void {
        if (this.removed || (x === this.x && y === this.y && w === this.width && h === this.height)) return;
        this.x = x; this.y = y; this.width = w; this.height = h;
        this.applyGeometry();
    }

    protected paint(): void {
        paintElement(this.element, this.foreground);
    }

    private round(): number {
        return roundOf(this.radius, this.width, this.height);
    }

    private applyCorners(): void {
        const r = this.radius;
        if (r !== null && typeof r !== "number") this.renderer.setCorners(this.id, r[0], r[1], r[2], r[3]);
    }

    // Frame and corners; the renderer resolves the native material for the new geometry.
    private applyGeometry(): void {
        this.renderer.setShape(this.id, this.x, this.y, this.width, this.height, this.round());
        if (!this.masked) this.applyCorners();
    }
}
