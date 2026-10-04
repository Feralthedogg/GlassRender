/** A wallpaper the demos offer, with the appearance that suits it. */
export interface Backdrop {
    readonly id: string;
    readonly name: string;
    readonly scheme: "dark" | "light";
}

/** The wallpapers, in the order the demos offer them, with the appearance that suits each one. */
export declare const BACKDROPS: readonly [Backdrop, ...Backdrop[]];
/** Paint the wallpaper `id` on a new canvas of `width` × `height` pixels and return the canvas. */
export declare function paintBackdrop(id: string, width: number, height: number): HTMLCanvasElement;
/** Paint the wallpaper `id` for the window: its size in device pixels, at most twice its CSS size. */
export declare function screenBackdrop(id: string): HTMLCanvasElement;
/** A small picture of the wallpaper `id`, as a data URL. */
export declare function backdropThumbnail(id: string): string;
