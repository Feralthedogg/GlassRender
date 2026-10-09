// The user's original newspaper scan stays intact; this canvas is the scrolling reader viewport, the whole stage tall.
export function makeNewspaper(W, H, R, image) {
    const u = H / 540, margin = 16 * u, width = W - margin * 2, readerHeight = H;
    const height = image.naturalHeight * width / image.naturalWidth;
    const page = document.createElement("canvas");
    page.width = W * R; page.height = Math.ceil(Math.max(readerHeight, height + margin * 2) * R);
    const g = page.getContext("2d", { willReadFrequently: true });
    g.scale(R, R); g.fillStyle = "#e5e4df"; g.fillRect(0, 0, W, page.height / R);
    g.drawImage(image, margin, margin, width, height);
    const distance = page.height / R - readerHeight;
    const view = document.createElement("canvas");
    view.width = W * R; view.height = H * R;
    const context = view.getContext("2d");
    context.fillStyle = "#e5e4df"; context.fillRect(0, 0, view.width, view.height);
    let sampledY = -1, appearance = "light";
    return {
        distance,
        appearanceAt(scroll, y) {
            const position = Math.min(page.height - 1, Math.max(0, Math.round((scroll + y) * R)));
            if (position < sampledY) appearance = "light";
            if (position !== sampledY) {
                const strip = g.getImageData(Math.floor(page.width * .28), position, Math.floor(page.width * .44), 1).data;
                let luminance = 0;
                for (let i = 0; i < strip.length; i += 4) luminance += .2126 * strip[i] + .7152 * strip[i + 1] + .0722 * strip[i + 2];
                luminance /= strip.length / 4;
                // Hysteresis keeps the reader controls steady over the grain in the photograph.
                if (luminance < 104) appearance = "dark";
                else if (luminance > 150) appearance = "light";
                sampledY = position;
            }
            return appearance;
        },
        at(scroll) {
            const y = Math.round(Math.max(0, Math.min(distance, scroll)) * R);
            context.drawImage(page, 0, y, W * R, readerHeight * R, 0, 0, W * R, readerHeight * R);
            return view;
        }
    };
}
