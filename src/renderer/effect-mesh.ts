import {SMOOTH_REACH} from "../layout.js";

/** Float positions are packed in scene space before projection into an effect surface. */
export function boxEffectMesh(vertices: Float32Array, cx: number, cy: number, hx: number, hy: number,
    radius: number, padding: number, scale: number, localYUp = true): void {
    const innerX = Math.max(0, hx - radius * SMOOTH_REACH), innerY = Math.max(0, hy - radius * SMOOTH_REACH);
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
        const qx = x === 0 ? -hx - padding : x === 1 ? -innerX : x === 2 ? innerX : hx + padding;
        const qy = y === 0 ? -hy - padding : y === 1 ? -innerY : y === 2 ? innerY : hy + padding;
        const i = (y * 4 + x) * 6;
        vertices[i] = (cx + qx) * scale; vertices[i + 1] = (cy + (localYUp ? -qy : qy)) * scale;
        vertices[i + 2] = 0; vertices[i + 3] = 1; vertices[i + 4] = qx; vertices[i + 5] = qy;
    }
}

export const BOX_CORNER_INDICES = new Uint16Array([
    0, 1, 5, 5, 4, 0, 3, 7, 6, 6, 2, 3, 10, 11, 15, 15, 14, 10, 9, 13, 12, 12, 8, 9
]);
export const BOX_FILL_INDICES = new Uint16Array([
    1, 2, 6, 6, 5, 1, 4, 5, 9, 9, 8, 4, 6, 7, 11, 11, 10, 6, 9, 10, 14, 14, 13, 9,
    5, 6, 10, 10, 9, 5
]);
