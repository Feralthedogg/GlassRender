export type IconName =
    | "logo" | "sun" | "moon" | "auto" | "left" | "right" | "down" | "play" | "pause" | "previous" | "next" | "pointer" | "bolt"
    | "keyboard" | "upload" | "external" | "book" | "bell" | "close" | "move" | "sparkle" | "layers" | "plus" | "check" | "eye"
    | "music" | "drop" | "help" | "shapes";

/** The markup of the icon `name`: an inline SVG element of class "icon". */
export declare function icon(name: IconName): string;
