# GlassRender

## Build the checkout

Use Node.js 22.12 or later and npm. These instructions build and install local packages from this checkout.

```sh
git clone https://github.com/Feralthedogg/GlassRender
cd GlassRender
npm ci
npm run build
```

Build the core before running or packaging a framework adapter.

## Run the browser example

From the repository root:

```sh
npm run demo
```

Open [http://127.0.0.1:5173/examples/quick-start.html](http://127.0.0.1:5173/examples/quick-start.html).

The complete example is `examples/quick-start.html`. It defines the canvas size, supplies its own backdrop, and imports the built browser module. Serve it over HTTP.

```html
<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <link rel="icon" href="data:,">
    <title>GlassRender browser quick start</title>
    <style>
        body { margin: 0; }
        canvas { display: block; width: 100vw; height: 100vh; }
    </style>
</head>
<body>
    <canvas id="glass"></canvas>
    <script type="module">
        import { createGlass } from "../dist/index.js";

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
            x: 40, y: 40, width: 320, height: 160,
            radius: 24, preset: "standard",
        });
        panel.set({ x: 64 });
        window.addEventListener("pagehide", () => glass.destroy(), { once: true });
    </script>
</body>
</html>
```

Coordinates and sizes are in CSS pixels relative to the canvas. The backdrop is supplied explicitly as an image, canvas, or video.

## React

Requires React 18 or later. Run these commands from the repository root:

```sh
npm --prefix react ci
npm --prefix react run build
npm --prefix react run demo -- --host 127.0.0.1 --strictPort
```

Open [http://127.0.0.1:5175/quick-start.html](http://127.0.0.1:5175/quick-start.html).

`react/demo/quick-start.html` provides `#app` and loads this complete entry point, `react/demo/quick-start.tsx`:

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Glass, GlassCanvas } from "glassrender-react";

const backdrop = "data:image/svg+xml," + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800">' +
    '<rect width="1200" height="800" fill="#163350"/>' +
    '<circle cx="350" cy="300" r="260" fill="#7960e8"/>' +
    '<path d="M0 600L1200 200V800H0Z" fill="#e58c53"/>' +
    '<path d="M0 0L1200 800M0 200L900 800" stroke="white" stroke-width="24"/>' +
    '</svg>'
);

function App() {
    return (
        <GlassCanvas backdrop={backdrop}>
            <main style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
                <Glass preset="standard" radius={24} style={{ width: 320, padding: 32 }}>
                    <h1>GlassRender</h1>
                    <p>React local package example.</p>
                </Glass>
            </main>
        </GlassCanvas>
    );
}

const container = document.getElementById("app");
if (!container) throw new Error("The #app element is missing.");
createRoot(container).render(<StrictMode><App /></StrictMode>);
```

## Svelte

Requires Svelte 5. Run these commands from the repository root:

```sh
npm --prefix svelte ci
npm --prefix svelte run package
npm --prefix svelte run demo -- --host 127.0.0.1 --strictPort
```

Open [http://127.0.0.1:5174/quick-start.html](http://127.0.0.1:5174/quick-start.html).

`svelte/demo/quick-start.html` provides `#app`. Its entry point mounts `svelte/demo/QuickStart.svelte`:

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
    <main style="min-height: 100vh; display: grid; place-items: center;">
        <Glass preset="standard" radius={24} style="width: 320px; padding: 32px;">
            <h1>GlassRender</h1>
            <p>Svelte local package example.</p>
        </Glass>
    </main>
</GlassCanvas>
```

## Vue

Requires Vue 3.4 or later. Run these commands from the repository root:

```sh
npm --prefix vue ci
npm --prefix vue run build
npm --prefix vue run demo -- --host 127.0.0.1 --strictPort
```

Open [http://127.0.0.1:5176/quick-start.html](http://127.0.0.1:5176/quick-start.html).

`vue/demo/quick-start.html` provides `#app`. Its entry point mounts `vue/demo/QuickStart.vue`:

```ts
import { createApp } from "vue";
import QuickStart from "./QuickStart.vue";

createApp(QuickStart).mount("#app");
```

```vue
<script setup lang="ts">
import { Glass, GlassCanvas } from "glassrender-vue";

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
        <main style="min-height: 100vh; display: grid; place-items: center;">
            <Glass preset="standard" :radius="24" style="width: 320px; padding: 32px;">
                <h1>GlassRender</h1>
                <p>Vue local package example.</p>
            </Glass>
        </main>
    </GlassCanvas>
</template>
```

All three examples include their own SVG backdrop. `GlassCanvas` manages the canvas and render loop; `Glass` follows its DOM box. Use `fixed={false}` in React/Svelte or `:fixed="false"` in Vue to keep the canvas inside a container with a defined size.

## Install into an existing app

From the repository root, create the core archive after the checkout setup above:

```sh
npm pack
```

Then run the matching adapter command. Each command installs its dependencies and automatically builds the package before creating its archive:

```sh
# React
(cd react && npm ci && npm pack)

# Svelte
(cd svelte && npm ci && npm pack)

# Vue
(cd vue && npm ci && npm pack)
```

Run the matching install command from an existing app next to the `GlassRender` directory. Install the core archive and adapter archive together:

```sh
# React
npm install ../GlassRender/glassrender-0.6.0.tgz ../GlassRender/react/glassrender-react-0.2.0.tgz

# Svelte
npm install ../GlassRender/glassrender-0.6.0.tgz ../GlassRender/svelte/glassrender-svelte-0.4.0.tgz

# Vue
npm install ../GlassRender/glassrender-0.6.0.tgz ../GlassRender/vue/glassrender-vue-0.2.0.tgz
```

Keep your app's existing entry point and use the `GlassCanvas` and `Glass` imports shown above in your component. The framework must already be installed in that app. The examples run in a browser with WebGL2 support.
