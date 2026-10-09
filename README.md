<div align="center">

<img src=".github/assets/reel.avif" width="880" alt="GlassRender: a lens passes over the wordmark, the page slides upward to a scrolling Guns N’ Roses newspaper with a fixed glass navigation bar, the camera moves in as the bar grows and comes down toward the middle, cycling through the built-in materials with each one named under its title, and pulls back out, the newspaper slides upward to a glass clock over monstera leaves, playback controls over poppies flow together into a tab bar with a sliding selector, the bar gathers into a button that opens into a menu, the button splits into four tinted buttons, a press brings up a sheet whose two small buttons, seen up close, turn light and dark as the page scrolls and then run together into one drop, which rises to the middle as a growing lens, lands on the grid, draws out a pill and gathers back into the first lens">

<br>

**Real-time refractive glass for the web, drawn on a WebGL2 canvas.**

Blur, refraction, rim light, shadow and color fringes over any image, canvas or video,<br>
with React, Svelte and Vue components that keep the glass under your layout.

[![version](https://img.shields.io/badge/version-0.1.1_Beta-8a5cff?style=flat-square)](https://www.npmjs.com/package/glassrender/v/0.1.1-beta)
[![WebGL2](https://img.shields.io/badge/WebGL2-renderer-3d8bff?style=flat-square)](#browser-support)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?style=flat-square)](src)
[![runtime dependencies](https://img.shields.io/badge/runtime_dependencies-0-2ea44f?style=flat-square)](package.json)
[![license](https://img.shields.io/badge/license-MIT-ff6f91?style=flat-square)](LICENSE)

[Install](#install) · [Quick start](#quick-start) · [Materials](#materials) · [Frameworks](#frameworks) · [Demos](#demos) · [API guide](api.md)

</div>

## Features

Choose a `preset`; the renderer resolves its values for the shape's size, appearance and surroundings.

- **Refraction, blur and light.** Every pixel of glass refracts, blurs and lights the backdrop you supply: an image, a canvas or a playing video.
- **28 built-in materials.** `standard`, `clear`, `menu`, `sidebar`, `dock`, `widget` and more, with size, appearance and environment rules. Some role names share the same profile.
- **Glass that follows the DOM.** `Glass` components for React, Svelte and Vue track their boxes as the page lays out, scrolls, resizes and animates.
- **Groups and masks.** Neighboring shapes flow into one piece of glass, and any alpha mask becomes an outline.
- **Chromatic aberration.** Control and lens profiles include color separation around their edges. `chromaticAberration` adjusts it from `0` to `1`, with a subtle default of `0.25`.
- **Accessibility settings.** Follows reduced transparency, increased contrast and reduced motion, or set them yourself.
- **HDR pixel input.** Upload encoded-sRGB premultiplied float32 or binary16 pixels directly with `setBackdropPixels()`, retaining a snapshot through context loss.
- **No runtime dependencies.** One WebGL2 context, recovery from context loss, and float output where supported. Physical HDR presentation depends on browser compositing and display support.

## Materials

Choose `standard` for a frosted surface, `clear` for transparent glass, or a role such as `control`, `menu` or `dock`. Set `chromaticAberration` on a shape, group or canvas to control color separation independently of other optical effects. Profiles respond to size, appearance and environment settings. Some role names share a profile.

Leave `tint` unset, rim-light rotation at `0` and `chromaticAberration` at `1` to use a preset unchanged. The default color-separation multiplier is `0.25`. Geometry, visibility and interaction remain ordinary application options.

```js
import { MATERIALS, getMaterialInfo } from "glassrender/materials";

console.log(MATERIALS.map(material => material.name)); // All 28 names.
console.log(getMaterialInfo("player")?.canonical); // "clear"
```

| Import | Use it for |
| --- | --- |
| `glassrender/core` | `createGlass`, shape/group options and convenience API types. |
| `glassrender/materials` | Preset names, material catalog and snapshot inspection. |
| `glassrender/advanced` | `createRenderer`, numeric helpers, constants and GPU block layout. |
| `glassrender` | Existing root exports; the catalog and layout have the dedicated entries above. |

Older material recipes, raw `material` overrides and the synthetic `prominent` preset are no longer accepted. See the [migration notes](api.md#migrating-older-examples) before adapting an older example.

## Showcase

<img src=".github/assets/hero.jpg" alt="The React component demo: a glass card, a music player, a merged toolbar and a settings panel over an aurora wallpaper">

<p align="center"><sub><b>Component demo</b>: glass under ordinary DOM boxes, a toolbar that merges, cards you can drag, and a notification moved by CSS</sub></p>

<table>
<tr>
<td width="50%"><img src=".github/assets/playground.jpg" alt="GlassRender core playground over large background lettering"></td>
<td width="50%"><img src=".github/assets/light.jpg" alt="The Svelte component demo in light appearance over a geometric poster"></td>
</tr>
<tr>
<td align="center"><sub><b>Core playground</b>: shapes and material profiles</sub></td>
<td align="center"><sub><b>Light appearance</b>: the same demo in Svelte</sub></td>
</tr>
</table>

## Install

GlassRender and its framework adapters are available on npm. The current release is **0.1.1 Beta** (`0.1.1-beta`), published under the `beta` tag.

```sh
npm install glassrender@beta
```

For a framework app, install the core together with the adapter you use:

| Framework | Install command |
| --- | --- |
| React | `npm install glassrender@beta glassrender-react@beta` |
| Svelte | `npm install glassrender@beta glassrender-svelte@beta` |
| Vue | `npm install glassrender@beta glassrender-vue@beta` |

The framework itself must already be installed in your app. To pin this release, replace `@beta` with `@0.1.1-beta` on both packages.

| Package | npm |
| --- | --- |
| Core | [glassrender](https://www.npmjs.com/package/glassrender) |
| React adapter | [glassrender-react](https://www.npmjs.com/package/glassrender-react) |
| Svelte adapter | [glassrender-svelte](https://www.npmjs.com/package/glassrender-svelte) |
| Vue adapter | [glassrender-vue](https://www.npmjs.com/package/glassrender-vue) |

## Quick start

After installing the package, draw glass on a canvas in your app. These imports work with your app's bundler:

```js
import { createGlass } from "glassrender/core";

// The picture the glass refracts: an image, a canvas or a video.
const made = createGlass(document.querySelector("canvas"), { backdrop: image });
if (!made.ok) throw new Error(made.error);

const glass = made.value;
const panel = glass.add({ x: 40, y: 40, width: 320, height: 160, radius: 24, preset: "standard" });

// set() changes only what you pass and schedules the next frame.
panel.set({ preset: "clear" });
```

Coordinates are CSS pixels from the top-left corner of the canvas. The backdrop is yours to supply: GlassRender does not capture the page behind the canvas.

<details>
<summary><b>The repository browser example</b>, <code>examples/quick-start.html</code></summary>
<br>

```html
<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <link rel="icon" href="data:,">
    <title>GlassRender browser quick start</title>
    <style>
        body { margin: 0; font: 16px/1.5 system-ui, sans-serif; }
        canvas { position: fixed; inset: 0; display: block; width: 100vw; height: 100vh; pointer-events: none; }
        main { position: relative; min-height: 100vh; padding: 24px; box-sizing: border-box; display: grid; place-items: center; }
        #panel { width: 320px; max-width: 100%; padding: 32px; box-sizing: border-box; color: var(--glass-foreground); }
        button { width: 100%; min-height: 48px; padding: 12px 16px; border: 0; border-radius: 24px; background: transparent; color: var(--glass-title); font: inherit; cursor: pointer; }
    </style>
</head>
<body>
    <canvas id="glass"></canvas>
    <main>
        <section id="panel">
            <h1>GlassRender</h1>
            <p>Material: <strong data-preset>standard</strong>.</p>
            <button id="switch" type="button">Switch to clear</button>
        </section>
    </main>
    <script type="module">
        import { createGlass } from "../dist/core.js";

        const backdrop = "data:image/svg+xml," + encodeURIComponent(
            '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800">' +
            '<rect width="1200" height="800" fill="#163350"/>' +
            '<circle cx="350" cy="300" r="260" fill="#7960e8"/>' +
            '<path d="M0 600L1200 200V800H0Z" fill="#e58c53"/>' +
            '<path d="M0 0L1200 800M0 200L900 800" stroke="white" stroke-width="24"/>' +
            '</svg>'
        );
        const image = new Image();
        image.src = backdrop;
        await image.decode();

        const canvas = document.getElementById("glass");
        const result = createGlass(canvas, { backdrop: image });
        if (!result.ok) throw new Error(result.error);

        const glass = result.value;
        const panel = glass.add({
            x: 0, y: 0, width: 0, height: 0,
            radius: 24, preset: "standard",
        }).follow(document.getElementById("panel"));
        const button = document.getElementById("switch");
        glass.add({ x: 0, y: 0, width: 0, height: 0, radius: 24, preset: "control" }).follow(button);
        let preset = "standard";
        button.addEventListener("click", () => {
            preset = preset === "standard" ? "clear" : "standard";
            panel.set({ preset });
            document.querySelector("[data-preset]").textContent = preset;
            button.textContent = "Switch to " + (preset === "standard" ? "clear" : "standard");
        });
        window.addEventListener("pagehide", () => glass.destroy(), { once: true });
    </script>
</body>
</html>
```

This standalone repository example imports the locally built `dist/` module. Follow [Run the repository demos](#run-the-repository-demos), then open http://127.0.0.1:5173/examples/quick-start.html.

</details>

The **[API guide](api.md)** covers options and defaults, all 28 presets, groups, masks, framework events, material metadata and the low-level renderer.

## Frameworks

| Package | Version | Requires |
| --- | --- | --- |
| [`glassrender-react`](https://www.npmjs.com/package/glassrender-react) | 0.1.1 Beta | React 18 or later |
| [`glassrender-svelte`](https://www.npmjs.com/package/glassrender-svelte) | 0.1.1 Beta | Svelte 5 |
| [`glassrender-vue`](https://www.npmjs.com/package/glassrender-vue) | 0.1.1 Beta | Vue 3.4 or later |

The three adapters share one model. `GlassCanvas` owns the canvas and the render loop, each `Glass` inside it draws glass under its own box, and `GlassGroup` merges the boxes inside it into one piece of glass. With `fixed={false}` (`:fixed="false"` in Vue), the canvas stays inside a container of your own size.

Install the core and your adapter in an existing framework app, then use the examples below. For the full local showcase, see [Run the repository demos](#run-the-repository-demos).

<details open>
<summary><b>React</b></summary>
<br>

```sh
npm install glassrender@beta glassrender-react@beta
```

Use this entry point in a React app whose HTML provides an element with `id="app"`:

```tsx
import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { Glass, GlassCanvas } from "glassrender-react";
import type { Preset } from "glassrender/materials";

const backdrop = "data:image/svg+xml," + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800">' +
    '<rect width="1200" height="800" fill="#163350"/>' +
    '<circle cx="350" cy="300" r="260" fill="#7960e8"/>' +
    '<path d="M0 600L1200 200V800H0Z" fill="#e58c53"/>' +
    '<path d="M0 0L1200 800M0 200L900 800" stroke="white" stroke-width="24"/>' +
    '</svg>'
);

function App() {
    const [preset, setPreset] = useState<Preset>("standard");
    const next = preset === "standard" ? "clear" : "standard";
    return (
        <GlassCanvas backdrop={backdrop}>
            <main style={{ minHeight: "100vh", padding: 24, boxSizing: "border-box", display: "grid", placeItems: "center" }}>
                <Glass preset={preset} radius={24} style={{ width: 320, maxWidth: "100%", padding: 32, boxSizing: "border-box", color: "var(--glass-foreground)" }}>
                    <h1>GlassRender</h1>
                    <p>Material: <strong data-preset>{preset}</strong>.</p>
                    <Glass preset="control" radius={24} interactive>
                        <button type="button" onClick={() => setPreset(next)}
                            style={{ width: "100%", minHeight: 48, padding: "12px 16px", border: 0, background: "transparent", color: "var(--glass-title)", font: "inherit", cursor: "pointer" }}>
                            Switch to {next}
                        </button>
                    </Glass>
                </Glass>
            </main>
        </GlassCanvas>
    );
}

const container = document.getElementById("app");
if (!container) throw new Error("The #app element is missing.");
createRoot(container).render(<StrictMode><App /></StrictMode>);
```

</details>

<details>
<summary><b>Svelte</b></summary>
<br>

```sh
npm install glassrender@beta glassrender-svelte@beta
```

In a Svelte 5 app, put the component below in `QuickStart.svelte` and mount it from an entry point. The app HTML provides an element with `id="app"`:

```ts
import { mount } from "svelte";
import QuickStart from "./QuickStart.svelte";

const target = document.getElementById("app");
if (!target) throw new Error("The #app element is missing.");
mount(QuickStart, { target });
```

```svelte
<script lang="ts">
    import { Glass, GlassCanvas } from "glassrender-svelte";
    import type { Preset } from "glassrender/materials";

    let preset: Preset = $state("standard");
    const next = $derived(preset === "standard" ? "clear" : "standard");

    const backdrop = "data:image/svg+xml," + encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800">' +
        '<rect width="1200" height="800" fill="#163350"/>' +
        '<circle cx="350" cy="300" r="260" fill="#7960e8"/>' +
        '<path d="M0 600L1200 200V800H0Z" fill="#e58c53"/>' +
        '<path d="M0 0L1200 800M0 200L900 800" stroke="white" stroke-width="24"/>' +
        '</svg>'
    );
</script>

<GlassCanvas {backdrop}>
    <main style="min-height: 100vh; padding: 24px; box-sizing: border-box; display: grid; place-items: center;">
        <Glass {preset} radius={24} style="width: 320px; max-width: 100%; padding: 32px; box-sizing: border-box; color: var(--glass-foreground);">
            <h1>GlassRender</h1>
            <p>Material: <strong data-preset>{preset}</strong>.</p>
            <Glass preset="control" radius={24} interactive>
                <button type="button" onclick={() => (preset = next)}
                    style="width: 100%; min-height: 48px; padding: 12px 16px; border: 0; background: transparent; color: var(--glass-title); font: inherit; cursor: pointer;">
                    Switch to {next}
                </button>
            </Glass>
        </Glass>
    </main>
</GlassCanvas>
```

</details>

<details>
<summary><b>Vue</b></summary>
<br>

```sh
npm install glassrender@beta glassrender-vue@beta
```

In a Vue app, put the component below in `QuickStart.vue` and mount it from an entry point. The app HTML provides an element with `id="app"`:

```ts
import { createApp } from "vue";
import QuickStart from "./QuickStart.vue";

createApp(QuickStart).mount("#app");
```

```vue
<script setup lang="ts">
import { computed, ref } from "vue";
import { Glass, GlassCanvas } from "glassrender-vue";
import type { Preset } from "glassrender/materials";

const preset = ref<Preset>("standard");
const next = computed(() => preset.value === "standard" ? "clear" : "standard");

const backdrop = "data:image/svg+xml," + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800">' +
    '<rect width="1200" height="800" fill="#163350"/>' +
    '<circle cx="350" cy="300" r="260" fill="#7960e8"/>' +
    '<path d="M0 600L1200 200V800H0Z" fill="#e58c53"/>' +
    '<path d="M0 0L1200 800M0 200L900 800" stroke="white" stroke-width="24"/>' +
    '</svg>'
);
</script>

<template>
    <GlassCanvas :backdrop="backdrop">
        <main style="min-height: 100vh; padding: 24px; box-sizing: border-box; display: grid; place-items: center;">
            <Glass :preset="preset" :radius="24" style="width: 320px; max-width: 100%; padding: 32px; box-sizing: border-box; color: var(--glass-foreground);">
                <h1>GlassRender</h1>
                <p>Material: <strong data-preset>{{ preset }}</strong>.</p>
                <Glass preset="control" :radius="24" interactive>
                    <button type="button" @click="preset = next"
                        style="width: 100%; min-height: 48px; padding: 12px 16px; border: 0; background: transparent; color: var(--glass-title); font: inherit; cursor: pointer;">
                        Switch to {{ next }}
                    </button>
                </Glass>
            </Glass>
        </main>
    </GlassCanvas>
</template>
```

</details>

## Demos

| Demo | Source | Address |
| --- | --- | --- |
| Showcase reel | [`examples/showcase.html`](examples/showcase.html) | http://127.0.0.1:5173/examples/showcase.html |
| Renderer example | [`examples/renderer.html`](examples/renderer.html) | http://127.0.0.1:5173/examples/renderer.html |
| Core playground | [`examples/index.html`](examples/index.html) | http://127.0.0.1:5173/examples/ |
| React | [`demo/react/demo/App.tsx`](demo/react/demo/App.tsx) | http://127.0.0.1:5175/ |
| Svelte | [`demo/svelte/demo/App.svelte`](demo/svelte/demo/App.svelte) | http://127.0.0.1:5174/ |
| Vue | [`demo/vue/demo/App.vue`](demo/vue/demo/App.vue) | http://127.0.0.1:5176/ |

The showcase reel uses built-in presets and ordinary RGBA tints; run it from the source above to reproduce the banner. The playground offers the built-in material catalog, shape kinds and environment settings. Its optical values come from the selected preset. The component demos show the same page in each framework, with draggable cards and a `control` lens. Move the lens across sharp backdrop edges to see its built-in color separation. The `standard` and `clear` profiles do not add color separation. Start them with the commands above. Each framework also has `quick-start.html`; `npm run build:demo` includes both pages in `demo-dist/`. The quick starts switch between built-in `standard` and `clear` profiles using a real button inside a `control` surface.

### Run the repository demos

Clone the repository to run the showcase and playground. The demo toolchain needs Node.js 22.12 or later and npm:

```sh
git clone https://github.com/Feralthedogg/GlassRender.git
cd GlassRender
npm ci
npm run build
npm run demo
```

The core examples are served at http://127.0.0.1:5173/examples/. Run a framework demo from a separate terminal in the repository root:

```sh
# React: http://127.0.0.1:5175/
npm --prefix demo/react ci
npm --prefix demo/react run demo -- --host 127.0.0.1 --strictPort

# Svelte: http://127.0.0.1:5174/
npm --prefix demo/svelte ci
npm --prefix demo/svelte run demo -- --host 127.0.0.1 --strictPort

# Vue: http://127.0.0.1:5176/
npm --prefix demo/vue ci
npm --prefix demo/vue run demo -- --host 127.0.0.1 --strictPort
```

Each framework server also provides `/quick-start.html`. These repository commands run local demo sources; the npm commands in [Install](#install) are for adding GlassRender to your own app.

## Project layout

```text
src/        built-in profile data, core API, catalog and WebGL2 renderer
demo/react/  glassrender-react and React demo
demo/svelte/ glassrender-svelte and Svelte demo
demo/vue/    glassrender-vue and Vue demo
examples/   the core playground, the quick start and the assets the demos share
api.md      the API guide
```

## Browser support

GlassRender runs wherever WebGL2 does. Mask outlines need `EXT_color_buffer_float`, and extended-range output needs a screen and a browser that support it. When WebGL2 is missing, `createGlass` returns an error instead of throwing.

## License

[MIT](LICENSE) © 2026 Feralthedogg

The photographs in the reel are from Pexels, under the [Pexels License](https://www.pexels.com/license/): [monstera leaves](https://www.pexels.com/photo/dark-green-leaves-of-monstera-20432992/) by Balázs Gábor and [California poppies](https://www.pexels.com/photo/close-up-of-orange-poppies-under-blue-sky-18591317/) by Soly Moses.
