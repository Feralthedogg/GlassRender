/**
 * @file group.ts
 * @brief Shared glass materials and independently positioned group outlines.
 */

import type { Renderer } from "../renderer/renderer.js";
import type { Glass } from "./glass.js";
import { GlassItem, paintElement } from "./item.js";
import { kindOf, roundOf, type GroupOptions, type GroupUpdate, type MemberOptions, type MemberUpdate, type Radius } from "./types.js";

/**
 * @brief A member of a group: an outline merged into the group's glass.
 * @details Made by `GlassGroup.add`.
 */
export class GroupMember {
    /** @brief The group this belongs to. */
    readonly group: GlassGroup;
    /** @internal */
    index: number;
    /** @internal */
    x: number;
    /** @internal */
    y: number;
    /** @internal */
    width: number;
    /** @internal */
    height: number;
    /** @internal */
    radius: Radius | null;
    /**
     * @brief The outline comes from a mask.
     * @internal
     */
    readonly masked: boolean;
    /** @internal */
    element: Element | null;
    /** @internal */
    everyFrame: boolean;

    /**
     * @brief Use `GlassGroup.add`.
     * @internal
     */
    constructor(group: GlassGroup, index: number, o: MemberOptions) {
        this.group = group;
        this.index = index;
        this.x = o.x;
        this.y = o.y;
        this.width = o.width;
        this.height = o.height;
        this.radius = o.radius ?? null;
        this.masked = o.mask !== undefined;
        this.element = null;
        this.everyFrame = false;
    }

    /** @brief False once removed from its group. */
    get alive(): boolean {
        return this.index >= 0;
    }

    /** @brief Change the frame, the radius or the mask. */
    set(u: MemberUpdate): this {
        if (this.index < 0) return this;
        if (u.x !== undefined) this.x = u.x;
        if (u.y !== undefined) this.y = u.y;
        if (u.width !== undefined) this.width = u.width;
        if (u.height !== undefined) this.height = u.height;
        if (u.radius !== undefined) this.radius = u.radius;
        if (u.mask !== undefined) this.group.maskMember(this, u.mask);
        this.group.placeMember(this);
        return this;
    }

    /** @brief Move the member (CSS pixels). */
    move(x: number, y: number): this {
        if (this.index >= 0 && (x !== this.x || y !== this.y)) { this.x = x; this.y = y; this.group.placeMember(this); }
        return this;
    }

    /** @brief Take the frame from an element's box (see `GlassShape.follow`). */
    follow(element: Element, everyFrame = false): this {
        if (this.index < 0) return this;
        this.unfollow();
        this.element = element;
        this.everyFrame = everyFrame;
        this.group.glass.watch(this);
        paintElement(element, this.group.foreground);
        return this;
    }

    /** @brief Stop following an element. */
    unfollow(): void {
        if (this.element !== null) {
            this.group.glass.unwatch(this);
            paintElement(this.element, null);
            this.element = null; this.everyFrame = false;
        }
    }

    /** @brief Take the member out of its group. */
    remove(): void {
        if (this.index >= 0) { this.unfollow(); this.group.dropMember(this); }
    }

    /** @internal */
    round(): number {
        return roundOf(this.radius, this.width, this.height);
    }

    /** @internal */
    place(x: number, y: number, w: number, h: number): void {
        if (this.index < 0 || (x === this.x && y === this.y && w === this.width && h === this.height)) return;
        this.x = x; this.y = y; this.width = w; this.height = h;
        this.group.placeMember(this);
    }
}

/**
 * @brief Several outlines drawn as one piece of glass whose edges flow into each other.
 * @details Made by `Glass.addGroup`.
 */
export class GlassGroup extends GlassItem {
    private spacing: number;
    private readonly members: GroupMember[];

    /**
     * @brief Use `Glass.addGroup`.
     * @internal
     */
    constructor(glass: Glass, renderer: Renderer, o: GroupOptions) {
        super(glass, renderer, o);
        this.spacing = o.spacing ?? 0;
        this.members = [];
        this.id = renderer.addUnion(this.spacing, this.scheme());
        this.start();
    }

    /** @brief Number of members. */
    get size(): number {
        return this.members.length;
    }

    /**
     * @brief Add a member (at most 16 per group, at most 4 of them with a mask).
     * @returns The member, or null when the group is full or removed or the mask cannot be used
     * (see `error`).
     */
    add(o: MemberOptions): GroupMember | null {
        if (this.removed) return null;
        const m = new GroupMember(this, this.members.length, o), r = this.renderer;
        if (o.mask !== undefined) {
            const made = r.addMemberMask(this.id, o.mask, m.x, m.y, m.width, m.height);
            if (!made.ok) { this.error = made.error; return null; }
        } else {
            if (r.addMember(this.id, m.x, m.y, m.width, m.height, m.round(), kindOf(o.corner)) < 0) return null;
            this.corners(m);
        }
        this.members.push(m);
        this.glass.update();
        return m;
    }

    /** @brief Change any options of the group. */
    set(u: GroupUpdate): this {
        if (this.removed) return this;
        if (u.spacing !== undefined && u.spacing !== this.spacing) { this.spacing = u.spacing; this.renderer.setSpacing(this.id, u.spacing); }
        if (this.takeMaterial(u)) this.applyMaterial();
        if (u.visible !== undefined) this.setVisible(u.visible);
        this.glass.update();
        return this;
    }

    /** @internal */
    placeMember(m: GroupMember): void {
        this.renderer.setMember(this.id, m.index, m.x, m.y, m.width, m.height, m.round());
        this.corners(m);
        this.glass.update();
    }

    /** @internal */
    maskMember(m: GroupMember, mask: TexImageSource): void {
        if (m.masked) { this.renderer.setMemberMask(this.id, m.index, mask); this.error = ""; }
        else this.error = "only a member made with a mask can get another mask";
    }

    /**
     * @brief The renderer moves its last member into the gap; the objects follow.
     * @internal
     */
    dropMember(m: GroupMember): void {
        const ms = this.members, i = m.index, last = ms.length - 1;
        this.renderer.removeMember(this.id, i);
        const tail = ms[last] as GroupMember;
        ms[i] = tail; tail.index = i;
        ms.pop();
        m.index = -1;
        this.glass.update();
    }

    override unfollow(): void {
        for (const m of this.members) m.unfollow();
    }

    /**
     * @brief The first followed element of the members in document order.
     * @internal
     */
    override anchor(): Element | null {
        let a: Element | null = null;
        for (const m of this.members) {
            const e = m.element;
            if (e !== null && (a === null || (a.compareDocumentPosition(e) & 2) !== 0)) a = e;
        }
        return a;
    }

    protected paint(): void {
        const fg = this.foreground;
        for (const m of this.members) paintElement(m.element, fg);
    }

    // four radii of a member (the renderer goes back to one radius whenever the frame is set)
    private corners(m: GroupMember): void {
        const r = m.radius;
        if (!m.masked && r !== null && typeof r !== "number") this.renderer.setMemberCorners(this.id, m.index, r[0], r[1], r[2], r[3]);
    }

}
