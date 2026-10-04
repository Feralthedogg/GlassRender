/** A position in CSS pixels. */
export interface Point {
    readonly x: number;
    readonly y: number;
}

/** The fields of a pointerdown event a drag needs (a DOM event or a framework's wrapper of one). */
export interface Press {
    readonly pointerId: number;
    readonly clientX: number;
    readonly clientY: number;
    readonly button: number;
    readonly isPrimary: boolean;
}

/**
 * Follow the press `press`. Once it has travelled more than four pixels it is a drag: `move` gets `from` plus the
 * distance travelled on every pointer move, and the click the press ends with is swallowed. A press that stays put
 * remains an ordinary click.
 */
export declare function drag(press: Press, from: Point, move: (to: Point) => void): void;
