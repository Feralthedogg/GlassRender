# GlassRender React

React components for GlassRender: `GlassCanvas`, `Glass`, `GlassGroup` and `useGlass()`.

Requires React 18 or later and GlassRender 0.1.1 Beta.

Install the core and adapter in your existing React app:

```sh
npm install glassrender@beta glassrender-react@beta
```

To pin this release, use `glassrender@0.1.1-beta glassrender-react@0.1.1-beta`.

```tsx
import { useState } from "react";
import { GlassCanvas, Glass } from "glassrender-react";

export default function Panel() {
    const [opacity, setOpacity] = useState(1);
    return (
        <GlassCanvas backdrop="/wallpaper.jpg">
            <Glass preset="standard" radius={24} opacity={opacity} style={{ padding: 24, width: 320 }}>
                <button onClick={() => setOpacity(opacity === 1 ? 0.6 : 1)}>Change opacity</button>
            </Glass>
        </GlassCanvas>
    );
}
```

`GlassCanvas` owns the renderer and cleans it up on unmount. `Glass` follows its DOM box; set `everyFrame` for CSS animations. Inside `GlassGroup`, its children supply outlines and the group supplies their material. `Glass` renders a `div`, so put a real button or link inside it for an interactive control.

`useGlass()` returns `null` outside a canvas. Inside it, it returns `{ glass, error }`, and `glass` stays `null` until the canvas is ready. WebGL initialization runs in an effect after mount, so server rendering produces markup without creating a canvas context.

From `demo/react`, run the repository demo:

```sh
npm ci
npm run check
npm run build
npm run demo
```

The local demo runs at http://127.0.0.1:5175/. `/quick-start.html` contains the minimal example. The [API guide](https://github.com/Feralthedogg/GlassRender/blob/main/api.md#react-components) lists every prop.
