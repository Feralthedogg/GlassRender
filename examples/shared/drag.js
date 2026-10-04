// Dragging for the demos: a press that travels a few pixels moves the box instead of clicking what it started on.

/**
 * Follow the press `press` (a pointerdown event). Once it has travelled more than four pixels it is a drag: `move` gets
 * `from` plus the distance travelled on every pointer move, and the click the press ends with is swallowed, so the
 * button or link it started on does not fire. A press that stays put remains an ordinary click.
 */
export function drag(press, from, move) {
    if (press.button !== 0 || !press.isPrimary) return;
    const id = press.pointerId, x0 = press.clientX, y0 = press.clientY, fx = from.x, fy = from.y, root = document.documentElement;
    let dragging = false;
    const step = (e) => {
        if (e.pointerId !== id) return;
        const dx = e.clientX - x0, dy = e.clientY - y0;
        if (!dragging && dx * dx + dy * dy < 16) return;
        if (!dragging) { dragging = true; root.classList.add("dragging"); }
        move({ x: fx + dx, y: fy + dy });
    };
    const end = (e) => {
        if (e.pointerId !== id) return;
        removeEventListener("pointermove", step, true);
        removeEventListener("pointerup", end, true);
        removeEventListener("pointercancel", end, true);
        if (!dragging) return;
        root.classList.remove("dragging");
        const swallow = (c) => { c.preventDefault(); c.stopPropagation(); };
        addEventListener("click", swallow, { capture: true, once: true });
        setTimeout(() => removeEventListener("click", swallow, true));
    };
    addEventListener("pointermove", step, true);
    addEventListener("pointerup", end, true);
    addEventListener("pointercancel", end, true);
}
