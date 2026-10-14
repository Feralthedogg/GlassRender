# GlassRender Vue

Vue 3 components for GlassRender: `GlassCanvas`, `Glass`, `GlassGroup` and `useGlass()`.

Requires Vue 3.4 or later and GlassRender 0.1.2 Beta.

Install the core and adapter in your existing Vue app:

```sh
npm install glassrender@beta glassrender-vue@beta
```

To pin this release, use `glassrender@0.1.2-beta glassrender-vue@0.1.2-beta`.

```vue
<script setup lang="ts">
import { ref } from "vue";
import { GlassCanvas, Glass } from "glassrender-vue";

const opacity = ref(1);
</script>

<template>
    <GlassCanvas>
        <Glass preset="standard" :radius="24" :opacity="opacity" style="padding: 24px; width: 320px;">
            <button @click="opacity = opacity === 1 ? 0.6 : 1">Change opacity</button>
        </Glass>
    </GlassCanvas>
</template>
```

`backdrop` is optional: omit it for the built-in SVG background, supply your own URL, image, canvas or video, or pass `null` to clear it.

`GlassCanvas` owns the renderer and cleans it up on unmount. `Glass` follows its DOM box; set `everyFrame` for CSS animations. Inside `GlassGroup`, its children supply outlines and the group supplies their material. Events use Vue names such as `@scheme` and `@error`.

Call `useGlass()` in `setup` inside a canvas. It returns `undefined` outside one; inside, it returns a reactive `{ glass, error }` state whose `glass` stays `null` until the canvas is ready. WebGL initialization runs after mount, so server rendering produces markup without creating a canvas context.

For a checkout, build the core from the repository root with `npm ci && npm run build`. Then run the demo from `demo/vue`:

```sh
npm ci
npm run build
npm run check
npm run demo
```

The local demo runs at http://127.0.0.1:5176/. `/quick-start.html` contains the minimal example. The [API guide](https://github.com/Feralthedogg/GlassRender/blob/main/api.md#vue-components) lists every prop.
