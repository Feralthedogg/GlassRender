# GlassRender Solid

Solid components for GlassRender: `GlassCanvas`, `Glass`, `GlassGroup` and `useGlass()`.

Requires Solid 1.9 or later and GlassRender 0.1.1 Beta. The generated JSX is compiled by your Solid application toolchain.

Install the core and adapter in your existing Solid app:

```sh
npm install glassrender@beta glassrender-solid@beta
```

To pin this release, use `glassrender@0.1.1-beta glassrender-solid@0.1.1-beta`.

```tsx
import { createSignal } from "solid-js";
import { GlassCanvas, Glass } from "glassrender-solid";

export default function Panel() {
    const [opacity, setOpacity] = createSignal(1);
    return <GlassCanvas backdrop="/wallpaper.jpg">
        <Glass preset="standard" radius={24} opacity={opacity()} style={{ padding: "24px", width: "320px" }}>
            <button onClick={() => setOpacity(opacity() === 1 ? 0.6 : 1)}>Change opacity</button>
        </Glass>
    </GlassCanvas>;
}
```

`GlassCanvas` owns the renderer and cleans it up on unmount. `Glass` follows its DOM box; set `everyFrame` for CSS animations. Inside `GlassGroup`, its children supply outlines and the group supplies their material. Use `class` and Solid's DOM event names such as `onClick`.

`useGlass()` returns `null` outside a canvas. Inside it, `glass` and `error` are reactive getters; read them inside an effect without destructuring the state object. WebGL initialization runs after client mount, so server rendering produces markup without creating a canvas context.

From `demo/solid`, run the repository demo:

```sh
npm ci
npm run check
npm run build
npm run demo
```

The local demo runs at http://127.0.0.1:5177/. `/quick-start.html` contains the minimal example.
