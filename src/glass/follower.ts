/**
 * @file follower.ts
 * @brief DOM bounds tracking for shapes and group members.
 * @details A box can move without resizing (content above it changes, a font or an image loads, a
 * transition runs), so followers are measured again after DOM changes, loads and transitions as well
 * as after resizes and scrolling.
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

// Transitions of these properties repaint without moving any box.
const PAINT_ONLY = /color|opacity|shadow|background|outline|filter|fill|stroke|visibility|cursor|clip-path|mask/;
const WATCH: MutationObserverInit = { subtree: true, childList: true, attributes: true, characterData: true };
// A transition without an end event (its element left the document) stops counting after this long.
const TRANSITION_TIMEOUT = 2000;

/**
 * @brief The followers of one glass with their observers.
 * @internal
 */
export class Followers {
    private readonly list: Follower[];
    private readonly onMove: () => void;
    private readonly onTransitionRun: (event: TransitionEvent) => void;
    private readonly onTransitionEnd: (event: TransitionEvent) => void;
    private observer: ResizeObserver | null;
    private mutations: MutationObserver | null;
    private moving: number;
    private transitions: number;
    private transitionTime: number;

    /** @param onMove Called when a followed box may have moved (measure again and draw). */
    constructor(onMove: () => void) {
        this.list = [];
        this.onMove = onMove;
        this.onTransitionRun = (event: TransitionEvent): void => { this.transitionRun(event); };
        this.onTransitionEnd = (event: TransitionEvent): void => { this.transitionEnd(event); };
        this.observer = null;
        this.mutations = null;
        this.moving = 0;
        this.transitions = 0;
        this.transitionTime = 0;
    }

    /** @brief Number of followers. */
    get size(): number {
        return this.list.length;
    }

    /**
     * @brief Some follower wants to be measured on every frame, or a transition that can move boxes
     * is running.
     */
    get everyFrame(): boolean {
        return this.moving > 0 || this.transitions > 0;
    }

    add(f: Follower): void {
        if (this.list.length === 0) this.listen();
        this.list.push(f);
        if (f.everyFrame) this.moving++;
        const e = f.element;
        if (e === null) return;
        if (typeof ResizeObserver === "function") {
            if (this.observer === null) this.observer = new ResizeObserver(this.onMove);
            this.observer.observe(e);
        }
        if (typeof MutationObserver === "function") {
            if (this.mutations === null) this.mutations = new MutationObserver(this.onMove);
            // The tree of the element, and the document around it when that tree is a shadow root.
            const root = e.getRootNode(), doc = e.ownerDocument;
            this.mutations.observe(root, WATCH);
            if (root !== doc) this.mutations.observe(doc, WATCH);
        }
    }

    remove(f: Follower): void {
        const i = this.list.indexOf(f);
        if (i < 0) return;
        this.list.splice(i, 1);
        if (f.everyFrame) this.moving--;
        const e = f.element;
        if (e !== null && this.observer !== null && !this.follows(e)) this.observer.unobserve(e);
        if (this.list.length === 0) this.unlisten();
    }

    /**
     * @brief Place every follower by the box of its element, relative to the content box of the
     * canvas.
     */
    measure(canvas: HTMLCanvasElement): void {
        if (this.transitions > 0 && performance.now() - this.transitionTime > TRANSITION_TIMEOUT) this.transitions = 0;
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
        this.mutations = null;
        this.list.length = 0;
        this.moving = 0;
    }

    // Whether another follower still follows the element.
    private follows(e: Element): boolean {
        const fs = this.list;
        for (let i = 0; i < fs.length; i++) if ((fs[i] as Follower).element === e) return true;
        return false;
    }

    private transitionRun(event: TransitionEvent): void {
        if (PAINT_ONLY.test(event.propertyName)) return;
        this.transitions++;
        this.transitionTime = performance.now();
        this.onMove();
    }

    private transitionEnd(event: TransitionEvent): void {
        if (PAINT_ONLY.test(event.propertyName)) return;
        if (this.transitions > 0) this.transitions--;
        this.transitionTime = performance.now();
        this.onMove();
    }

    private listen(): void {
        if (typeof addEventListener !== "function") return;
        addEventListener("scroll", this.onMove, { capture: true, passive: true });
        addEventListener("resize", this.onMove);
        // Loads and transitions move boxes without resizing them; load events of elements reach the window while capturing.
        addEventListener("load", this.onMove, true);
        addEventListener("loadedmetadata", this.onMove, true);
        addEventListener("animationend", this.onMove, true);
        addEventListener("transitionrun", this.onTransitionRun, true);
        addEventListener("transitionend", this.onTransitionEnd, true);
        addEventListener("transitioncancel", this.onTransitionEnd, true);
        if (typeof document !== "undefined" && document.fonts !== undefined) document.fonts.addEventListener("loadingdone", this.onMove);
    }

    private unlisten(): void {
        if (this.mutations !== null) this.mutations.disconnect();
        this.transitions = 0;
        if (typeof removeEventListener !== "function") return;
        removeEventListener("scroll", this.onMove, true);
        removeEventListener("resize", this.onMove);
        removeEventListener("load", this.onMove, true);
        removeEventListener("loadedmetadata", this.onMove, true);
        removeEventListener("animationend", this.onMove, true);
        removeEventListener("transitionrun", this.onTransitionRun, true);
        removeEventListener("transitionend", this.onTransitionEnd, true);
        removeEventListener("transitioncancel", this.onTransitionEnd, true);
        if (typeof document !== "undefined" && document.fonts !== undefined) document.fonts.removeEventListener("loadingdone", this.onMove);
    }
}
