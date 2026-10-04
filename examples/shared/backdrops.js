// Procedural wallpapers shared by the demos. Each one mixes soft colour fields, where the blur shows, with a few crisp
// lines and edges, where the refraction shows. They are painted at the size of the screen, so the lines stay sharp.

/** The wallpapers, in the order the demos offer them, with the appearance that suits each one. */
export const BACKDROPS = [
    { id: "aurora", name: "Aurora", scheme: "dark" },
    { id: "dunes", name: "Dunes", scheme: "dark" },
    { id: "poster", name: "Poster", scheme: "light" },
    { id: "type", name: "Type", scheme: "dark" }
];

function random(seed) {
    let s = seed >>> 0;
    return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
}

// a soft colour field: `rgb` is "r, g, b"
function glow(g, x, y, r, rgb, alpha) {
    const f = g.createRadialGradient(x, y, 0, x, y, r);
    f.addColorStop(0, `rgba(${rgb}, ${alpha})`);
    f.addColorStop(0.45, `rgba(${rgb}, ${alpha * 0.55})`);
    f.addColorStop(1, `rgba(${rgb}, 0)`);
    g.fillStyle = f;
    g.fillRect(x - r, y - r, r * 2, r * 2);
}

// fine film grain: hides banding in the gradients and gives the blur something to soften
function grain(g, w, h, amount) {
    const tile = document.createElement("canvas");
    tile.width = tile.height = 192;
    const t = tile.getContext("2d"), img = t.createImageData(192, 192), d = img.data, rnd = random(7);
    for (let i = 0; i < d.length; i += 4) {
        d[i] = d[i + 1] = d[i + 2] = rnd() * 255;
        d[i + 3] = 255;
    }
    t.putImageData(img, 0, 0);
    g.save();
    g.globalAlpha = amount;
    g.globalCompositeOperation = "overlay";
    g.fillStyle = g.createPattern(tile, "repeat");
    g.fillRect(0, 0, w, h);
    g.restore();
}

// a ribbon across the screen: layered bands that sum to a soft falloff below a crisp, bright upper edge
function silk(g, w, h, y, amp, thick, left, right) {
    const curve = (o) => [-w * 0.05, y + o, w * 0.3, y - amp + o * 0.6, w * 0.65, y + amp + o * 1.3, w * 1.05, y - amp * 0.3 + o];
    const colour = (alpha) => {
        const f = g.createLinearGradient(0, 0, w, 0);
        f.addColorStop(0, `rgba(${left}, 0)`);
        f.addColorStop(0.3, `rgba(${left}, ${alpha})`);
        f.addColorStop(0.72, `rgba(${right}, ${alpha})`);
        f.addColorStop(1, `rgba(${right}, 0)`);
        return f;
    };
    const top = curve(0);
    g.fillStyle = colour(0.016);
    for (let i = 1; i <= 24; i++) {
        const b = curve(thick * i / 24);
        g.beginPath();
        g.moveTo(top[0], top[1]);
        g.bezierCurveTo(top[2], top[3], top[4], top[5], top[6], top[7]);
        g.lineTo(b[6], b[7]);
        g.bezierCurveTo(b[4], b[5], b[2], b[3], b[0], b[1]);
        g.closePath();
        g.fill();
    }
    g.strokeStyle = colour(0.55);
    g.lineWidth = Math.max(1, Math.min(w, h) / 500);
    g.beginPath();
    g.moveTo(top[0], top[1]);
    g.bezierCurveTo(top[2], top[3], top[4], top[5], top[6], top[7]);
    g.stroke();
}

function aurora(g, w, h) {
    const m = Math.max(w, h), n = Math.min(w, h);
    const base = g.createLinearGradient(0, 0, w * 0.3, h);
    base.addColorStop(0, "#060a1c");
    base.addColorStop(1, "#12071f");
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    g.globalCompositeOperation = "lighter";
    glow(g, w * 0.12, h * 0.18, m * 0.42, "0, 140, 255", 0.55);
    glow(g, w * 0.55, h * 0.30, m * 0.40, "118, 70, 255", 0.55);
    glow(g, w * 0.28, h * 0.92, m * 0.48, "255, 40, 130", 0.55);
    glow(g, w * 0.88, h * 0.78, m * 0.46, "255, 105, 55", 0.6);
    glow(g, w * 0.95, h * 0.08, m * 0.26, "255, 196, 80", 0.4);
    // two silk ribbons: soft bands that fade downward from a crisp, glossy upper edge
    silk(g, w, h, h * 0.36, h * 0.13, n * 0.16, "110, 190, 255", "230, 120, 255");
    silk(g, w, h, h * 0.63, h * 0.09, n * 0.12, "255, 130, 200", "255, 180, 110");
    g.globalCompositeOperation = "source-over";
    // orbit rings around a point below the screen
    g.strokeStyle = "rgba(255, 255, 255, 0.13)";
    g.lineWidth = Math.max(1, n / 650);
    for (let i = 0; i < 12; i++) {
        g.beginPath();
        g.arc(w * 0.5, h * 1.55, m * (0.62 + i * 0.055), 0, Math.PI * 2);
        g.stroke();
    }
    const rnd = random(3);
    for (let i = 0; i < 110; i++) {
        const x = rnd() * w, y = rnd() * h * 0.75, r = (0.4 + rnd() * 1.2) * n / 900;
        g.fillStyle = `rgba(255, 255, 255, ${0.25 + rnd() * 0.6})`;
        g.beginPath();
        g.arc(x, y, r, 0, Math.PI * 2);
        g.fill();
    }
    grain(g, w, h, 0.07);
}

function dunes(g, w, h) {
    const n = Math.min(w, h);
    const sky = g.createLinearGradient(0, 0, 0, h * 0.75);
    sky.addColorStop(0, "#1d1442");
    sky.addColorStop(0.45, "#7a3a7a");
    sky.addColorStop(0.8, "#f07a5d");
    sky.addColorStop(1, "#ffc28a");
    g.fillStyle = sky;
    g.fillRect(0, 0, w, h);
    const sx = w * 0.66, sy = h * 0.5, sr = n * 0.13;
    glow(g, sx, sy, sr * 4.5, "255, 190, 120", 0.55);
    const sun = g.createLinearGradient(0, sy - sr, 0, sy + sr);
    sun.addColorStop(0, "#fff3c4");
    sun.addColorStop(1, "#ffb067");
    g.fillStyle = sun;
    g.beginPath();
    g.arc(sx, sy, sr, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#f8956b";
    for (let i = 0; i < 5; i++) g.fillRect(sx - sr, sy + sr * (0.15 + i * 0.18), sr * 2, sr * (0.03 + i * 0.018));
    // ridges from far to near: top colour, bottom colour, base height, amplitude, frequency
    const ridges = [
        ["#f6a07a", "#e2795f", 0.56, 0.05, 1.3],
        ["#d9645e", "#b34a58", 0.63, 0.07, 2.1],
        ["#9c3b5c", "#7a2b55", 0.71, 0.08, 1.7],
        ["#5e2152", "#43173f", 0.80, 0.09, 2.6],
        ["#2f1036", "#1c0a24", 0.90, 0.07, 1.9]
    ];
    for (let i = 0; i < ridges.length; i++) {
        const [top, bottom, base, amp, freq] = ridges[i];
        const fill = g.createLinearGradient(0, h * (base - amp), 0, h);
        fill.addColorStop(0, top);
        fill.addColorStop(1, bottom);
        g.fillStyle = fill;
        g.beginPath();
        g.moveTo(0, h);
        for (let x = 0; x <= w + 2; x += Math.max(2, w / 240)) {
            const t = x / w;
            g.lineTo(x, h * (base - amp * (0.55 * Math.sin(t * Math.PI * freq + i * 1.7) + 0.45 * Math.sin(t * Math.PI * freq * 2.3 + i))));
        }
        g.lineTo(w, h);
        g.closePath();
        g.fill();
        g.strokeStyle = "rgba(255, 220, 190, 0.35)";
        g.lineWidth = Math.max(1, n / 600);
        g.stroke();
    }
    grain(g, w, h, 0.06);
}

function poster(g, w, h) {
    const n = Math.min(w, h), u = n / 100;
    g.fillStyle = "#f2ede3";
    g.fillRect(0, 0, w, h);
    g.strokeStyle = "rgba(20, 20, 40, 0.07)";
    g.lineWidth = 1;
    const step = Math.round(n / 18);
    for (let x = step; x < w; x += step) { g.beginPath(); g.moveTo(x + 0.5, 0); g.lineTo(x + 0.5, h); g.stroke(); }
    for (let y = step; y < h; y += step) { g.beginPath(); g.moveTo(0, y + 0.5); g.lineTo(w, y + 0.5); g.stroke(); }
    g.fillStyle = "#ff5a36";
    g.beginPath(); g.arc(w * 0.26, h * 0.42, n * 0.3, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#1f3bff";
    g.beginPath(); g.moveTo(w, h); g.arc(w, h, n * 0.55, Math.PI, Math.PI * 1.5); g.closePath(); g.fill();
    g.fillStyle = "#ffc21a";
    g.fillRect(w * 0.56, h * 0.1, n * 0.34, n * 0.2);
    g.fillStyle = "#14141c";
    g.beginPath(); g.arc(w * 0.62, h * 0.62, n * 0.16, Math.PI, 0); g.closePath(); g.fill();
    for (let i = 0; i < 7; i++) g.fillRect(w * 0.06 + i * u * 4.2, h * 0.86, u * 2.1, n * 0.11);
    g.fillStyle = "#0f9d76";
    for (let i = 0; i < 5; i++) { g.beginPath(); g.arc(w * 0.82 + i * u * 4.5, h * 0.2, u * 1.4, 0, Math.PI * 2); g.fill(); }
    g.strokeStyle = "#14141c";
    g.lineWidth = u * 0.6;
    g.beginPath(); g.moveTo(w * 0.04, h * 0.08); g.lineTo(w * 0.5, h * 0.08); g.stroke();
    g.beginPath(); g.arc(w * 0.26, h * 0.42, n * 0.36, -0.6, 1.4); g.stroke();
    grain(g, w, h, 0.05);
}

function type(g, w, h) {
    const n = Math.min(w, h);
    g.fillStyle = "#0c2f26";
    g.fillRect(0, 0, w, h);
    glow(g, w * 0.8, h * 0.25, n * 0.9, "40, 140, 100", 0.45);
    g.fillStyle = "#ff7a3d";
    g.beginPath(); g.arc(w * 0.72, h * 0.58, n * 0.24, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#f4ead8";
    g.textBaseline = "alphabetic";
    const size = Math.min(h * 0.34, w * 0.27);
    g.font = `800 ${size}px ui-sans-serif, system-ui, sans-serif`;
    g.fillText("Glass", -size * 0.04, h * 0.43);
    g.fillText("Render", -size * 0.04, h * 0.43 + size * 1.03);
    grain(g, w, h, 0.06);
}

const PAINTERS = { aurora, dunes, poster, type };

/** Paint the wallpaper `id` on a new canvas of `width` × `height` pixels and return the canvas. */
export function paintBackdrop(id, width, height) {
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(width));
    c.height = Math.max(1, Math.round(height));
    (PAINTERS[id] ?? aurora)(c.getContext("2d"), c.width, c.height);
    return c;
}

/** Paint the wallpaper `id` for the window: its size in device pixels, at most twice its CSS size. */
export function screenBackdrop(id) {
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    return paintBackdrop(id, Math.min(4096, innerWidth * ratio), Math.min(4096, innerHeight * ratio));
}

const thumbs = new Map();

/** A small picture of the wallpaper `id`, as a data URL. */
export function backdropThumbnail(id) {
    let url = thumbs.get(id);
    if (url === undefined) {
        url = paintBackdrop(id, 240, 160).toDataURL();
        thumbs.set(id, url);
    }
    return url;
}
