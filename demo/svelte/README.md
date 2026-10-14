# GlassRender Svelte

Svelte 5 components for GlassRender: `GlassCanvas`, `Glass`, `GlassGroup` and `getGlass()`.

Requires Svelte 5 and GlassRender 0.1.2 Beta.

Install the core and adapter in your existing Svelte app:

```sh
npm install glassrender@beta glassrender-svelte@beta
```

To pin this release, use `glassrender@0.1.2-beta glassrender-svelte@0.1.2-beta`.

```svelte
<script lang="ts">
    import { GlassCanvas, Glass } from "glassrender-svelte";

    let opacity = $state(1);
</script>

<GlassCanvas>
    <Glass preset="standard" radius={24} {opacity} style="padding: 24px; width: 320px;">
        <button onclick={() => (opacity = opacity === 1 ? 0.6 : 1)}>Change opacity</button>
    </Glass>
</GlassCanvas>
```

`backdrop` is optional: omit it for the built-in SVG background, supply your own URL, image, canvas or video, or pass `null` to clear it.

`GlassCanvas` owns the renderer and cleans it up when it is destroyed. `Glass` follows its DOM box; set `everyFrame` for CSS animations. Inside `GlassGroup`, its children supply outlines and the group supplies their material. Callback names are lowercase: `onscheme`, `onerror`, `oncontextlost` and `oncontextrestored`.

Call `getGlass()` during component initialization inside a canvas. It returns `undefined` outside one; inside, its `glass` field is reactive and stays `null` until the canvas is ready. WebGL initialization runs after mount, so server rendering produces markup without creating a canvas context.

For a checkout, build the core from the repository root with `npm ci && npm run build`. Then run the demo from `demo/svelte`:

```sh
npm ci
npm run package
npm run check
npm run demo
```

The local demo runs at http://127.0.0.1:5174/. `/quick-start.html` contains the minimal example. The [API guide](https://github.com/Feralthedogg/GlassRender/blob/main/api.md#svelte-components) lists every prop.
