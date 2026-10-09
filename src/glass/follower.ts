/**
 * @file follower.ts
 * @brief DOM bounds tracking for shapes and group members.
 */

/**
 * @brief An element whose box gives the frame of a shape or a group member.
 * @internal
 */
export interface Follower {
    element: Element | null;
    everyFrame: boolean;
    place(x: number, y: number, w: number, h: number): void;
}

/**
 * @brief The followers of one glass with their observers.
 * @internal
 */
export class Followers {
    private readonly list: Follower[];
    private readonly onMove: () => void;
    private observer: ResizeObserver | null;
    private moving: number;

    /** @param onMove Called when a followed box may have moved (measure again and draw). */
    constructor(onMove: () => void) {
        this.list = [];
        this.onMove = onMove;
        this.observer = null;
        this.moving = 0;
    }

    /** @brief Number of followers. */
    get size(): number {
        return this.list.length;
    }

    /** @brief Some follower wants to be measured on every frame. */
    get everyFrame(): boolean {
        return this.moving > 0;
    }

    add(f: Follower): void {
        if (this.list.length === 0 && typeof addEventListener === "function") {
            addEventListener("scroll", this.onMove, { capture: true, passive: true });
            addEventListener("resize", this.onMove);
        }
        this.list.push(f);
        if (f.everyFrame) this.moving++;
        if (f.element !== null && typeof ResizeObserver === "function") {
            if (this.observer === null) this.observer = new ResizeObserver(this.onMove);
            this.observer.observe(f.element);
        }
    }

    remove(f: Follower): void {
        const i = this.list.indexOf(f);
        if (i < 0) return;
        this.list.splice(i, 1);
        if (f.everyFrame) this.moving--;
        if (f.element !== null && this.observer !== null) this.observer.unobserve(f.element);
        if (this.list.length === 0) this.unlisten();
    }

    /**
     * @brief Place every follower by the box of its element, relative to the content box of the
     * canvas.
     */
    measure(canvas: HTMLCanvasElement): void {
        const fs = this.list, c = canvas.getBoundingClientRect(), ox = c.left + canvas.clientLeft, oy = c.top + canvas.clientTop;
        for (let i = 0; i < fs.length; i++) {
            const f = fs[i] as Follower, e = f.element;
            if (e === null) continue;
            const b = e.getBoundingClientRect();
            f.place(b.left - ox, b.top - oy, b.width, b.height);
        }
    }

    /** @brief Drop every follower, observer and listener. */
    release(): void {
        if (this.observer !== null) { this.observer.disconnect(); this.observer = null; }
        if (this.list.length > 0) this.unlisten();
        this.list.length = 0;
        this.moving = 0;
    }

    private unlisten(): void {
        if (typeof removeEventListener !== "function") return;
        removeEventListener("scroll", this.onMove, true);
        removeEventListener("resize", this.onMove);
    }
}
