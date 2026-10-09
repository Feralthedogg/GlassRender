# GlassRender API Guide

GlassRender renders glass material presets over an image, canvas or video using WebGL2. This guide covers `glassrender` 0.1.1 Beta and its React, Svelte, Vue and Solid adapters, all at version `0.1.1-beta`. Select one of the 28 presets with the `preset` option.

To get started, create a canvas with `createGlass()` and add a piece of glass with `glass.add()`. In a React, Svelte, Vue or Solid app, place `Glass` components inside `GlassCanvas`. The components follow their DOM boxes, so you do not have to calculate their positions and sizes yourself.

Jump to the section you need:

- [Runnable example](#runnable-example)
- [createGlass options](#createglass-options)
- [Creating and updating a shape](#creating-and-updating-a-shape)
- [Adjusting color separation](#adjusting-color-separation)
- [All presets](#all-presets)
- [Merging shapes in a group](#merging-shapes-in-a-group)
- [Custom outlines with masks](#custom-outlines-with-masks)
- [Material catalog](#material-catalog)
- [Migrating older examples](#migrating-older-examples)
- [React components](#react-components)
- [Svelte components](#svelte-components)
- [Vue components](#vue-components)
- [Using the WebGL renderer directly](#using-the-webgl-renderer-directly)
- [Material calculation and packing](#material-calculation-and-packing)
- [Troubleshooting](#troubleshooting)

## Finding the right API

Import `createGlass` and convenience types from `glassrender/core`, preset names and metadata from `glassrender/materials`, and renderer/numeric APIs from `glassrender/advanced`. Existing root exports remain available; the material catalog is exported by `glassrender/materials`, and `MATERIAL_LAYOUT` by `glassrender/advanced`.

| What you want to do | API | What it does |
| --- | --- | --- |
| Start drawing glass on a canvas | `createGlass(canvas, options)` | Manages resizing, the render loop, appearance and context recovery. |
| Create a panel or button surface | `glass.add(options)` | Returns a `GlassShape`. |
| Merge several outlines into one piece of glass | `glass.addGroup(options)` | Creates a `GlassGroup`; add its members with `group.add()`. |
| Change a shape's position or size | `shape.set()`, `move()`, `resize()` | Updates the supplied values and schedules a frame. |
| Follow an HTML element | `shape.follow(element)` | Keeps the glass aligned when the page scrolls or the element resizes. |
| Adjust color separation | `chromaticAberration` | Scales the selected profile's color offsets without changing refraction, rim lighting or shadow. |
| Change the color or material | `preset`, `tint` | Selects a built-in profile; an optional tint is a separate color layer. |
| Use a moving backdrop | `setBackdrop(source, fit, true)` | Uploads a video or animated canvas on every frame. |
| Use a framework | `GlassCanvas`, `Glass`, `GlassGroup` | Provides the backdrop canvas and glass that follows your DOM layout. |
| Connect an existing WebGL renderer | `createRenderer(gl)` | Lets you manage the render loop and backdrop texture yourself. |
| Calculate or inspect material values | `presetMaterial()`, `packMaterial()` and related helpers | Produces material descriptions, numeric vectors and GPU inputs. |

## Basic concepts

Coordinates are in **CSS pixels from the top-left corner of the canvas**. `x` increases to the right and `y` increases downward. Shape `width`, `height` and `radius` use CSS pixels too. Angles such as `lightAngle` use radians; `Math.PI / 2` is 90 degrees.

Optional color transforms use `Rgb` or `Rgba` arrays rather than CSS strings. Channels range from 0 to 1 and use gamma-encoded values; `Rgba` uses straight alpha, so RGB channels are not multiplied by alpha. Leave `tint` unset and `lightAngle` at `0` to use the selected profile without color or light-angle overrides. `chromaticAberration` defaults to `0.25` for a subtle edge; set it to `1` to use the profile's full color separation. The environment setting `tinted` selects a more opaque preset variant; it is separate from an explicit RGBA color layer.

Supply the picture the glass reads through `backdrop`. To show HTML, text or a CSS background through the glass, provide an image, canvas or video of that scene; the library does not automatically capture the page's DOM. Run the examples in a browser with WebGL2 support.

Build and installation instructions are in the [README](README.md). After building the checkout, save the HTML below as `examples/api-start.html`, run `npm run demo` and open `http://127.0.0.1:5173/examples/api-start.html`.

## Runnable example

This example draws its own backdrop on a small 2D canvas, so it needs no external image.

```html
<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>GlassRender quick start</title>
    <style>
        body { margin: 0; }
        #glass { display: block; width: 100vw; height: 100vh; }
    </style>
</head>
<body>
    <canvas id="glass"></canvas>
    <script type="module">
        import { createGlass } from "../dist/core.js";

        // The picture the glass will sample and refract.
        const background = document.createElement("canvas");
        background.width = 1200;
        background.height = 800;
        const ctx = background.getContext("2d");
        if (!ctx) throw new Error("Could not create a 2D canvas.");
        const gradient = ctx.createLinearGradient(0, 0, 1200, 800);
        gradient.addColorStop(0, "#163350");
        gradient.addColorStop(0.5, "#7960e8");
        gradient.addColorStop(1, "#e58c53");
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 1200, 800);
        ctx.fillStyle = "white";
        ctx.fillRect(200, 0, 24, 800);
        ctx.fillRect(0, 300, 1200, 24);

        const canvas = document.querySelector("#glass");
        if (!(canvas instanceof HTMLCanvasElement)) throw new Error("Canvas not found.");
        const result = createGlass(canvas, {
            backdrop: background,
            appearance: "light",
            fit: "cover",
        });
        if (!result.ok) throw new Error(result.error);

        const glass = result.value;
        const panel = glass.add({
            x: 48,
            y: 48,
            width: 320,
            height: 160,
            radius: 24,
            preset: "standard",
        });

        // set() changes only the supplied values and schedules rendering for you.
        panel.set({ preset: "clear" });

        window.addEventListener("pagehide", () => glass.destroy(), { once: true });
    </script>
</body>
</html>
```

In the core examples that follow, `glass` and `panel` refer to the instances created above. In an app with a bundler, import `createGlass` from `glassrender/core` instead of `../dist/core.js`. Use the framework examples as components in an app with the corresponding adapter installed.

## Handling success and failure

Calls that can fail, such as initialization and mask configuration, return `Result<T>`.

```ts
import { createGlass } from "glassrender/core";

const canvas = document.querySelector<HTMLCanvasElement>("#glass");
if (!canvas) throw new Error("The #glass canvas is missing.");

const result = createGlass(canvas);
if (!result.ok) {
    console.error("Could not start glass rendering:", result.error);
} else {
    const glass = result.value;
    glass.add({ x: 20, y: 20, width: 200, height: 100, radius: 20 });
    window.addEventListener("pagehide", () => glass.destroy(), { once: true });
}
```

| Type | Shape | What to read |
| --- | --- | --- |
| `Ok<T>` | `{ ok: true, value: T }` | `value` contains the result. |
| `Err` | `{ ok: false, error: string }` | `error` explains the failure. |
| `Result<T>` | `Ok<T>` or `Err` | Check `ok` before reading the corresponding field. |

The convenience API's `shape.set()` returns the shape so you can chain calls. Read `shape.error` to check whether a preset name, removed override or mask was rejected. `group.add()` returns `null` when it cannot add a member, so check that result separately.

## createGlass options

`createGlass(canvas: HTMLCanvasElement, options?: GlassOptions): Result<Glass>` creates a `Glass` instance that manages your scene. Create it through this function rather than calling `new Glass()`.

| Option | Type or values | Default | Purpose |
| --- | --- | --- | --- |
| `backdrop` | `TexImageSource` | Omitted | The image, canvas, video or other source the glass reads. The core API takes an object rather than a URL string. |
| `fit` | `"cover"`, `"contain"`, `"stretch"` | `"cover"` | How the backdrop fits the canvas. |
| `live` | `boolean` | `false` | Uploads the backdrop again on every frame. |
| `appearance` | `"auto"`, `"light"`, `"dark"` | `"auto"` | Default appearance for the shapes. `auto` follows the page's preferred color scheme. |
| `autoResize` | `boolean` | `true` | Matches the drawing buffer to the displayed canvas size and device pixel ratio. |
| `maxPixelRatio` | Positive number | `2` | Maximum drawing-buffer pixels per CSS pixel. Set it at creation; there is no setter. |
| `stacking` | `"exact"`, `"flat"` | `"exact"` | Whether overlapping glass refracts the glass beneath it or only the original backdrop. |
| `lightAngle` | Radians | `0` | Rotates all rim lights clockwise. |
| `chromaticAberration` | Number from `0` to `1` | `0.25` | Default color-separation multiplier for shapes and groups. |
| `environment` | `EnvironmentOptions` | See below | Window activity and accessibility settings. |
| `extendedRange` | `boolean` or `"auto"` | `false` | Requests output brighter than standard white where supported. |
| `displayHeadroom` | Finite Float32 number at least `1` | `1` | Current screen brightness multiplier supplied by the host; takes precedence over `headroom`. Hardware potential is a separate value. |
| `headroom` | Finite Float32 number at least `1` | `1` | Compatibility name for the display brightness multiplier. |
| `onContextLost` | `() => void` | Omitted | Called when WebGL context loss pauses drawing. |
| `onContextRestored` | `(error: string) => void` | Omitted | Receives `""` on successful reconstruction, or the reason it failed. |

`cover` preserves the backdrop's aspect ratio and fills the canvas, cropping when necessary. `contain` shows the entire backdrop and fills unused space with black. `stretch` scales the backdrop to the canvas without preserving its aspect ratio.

To enable extended range later, create the glass with `extendedRange: true` or `"auto"`: the WebGL context configuration is chosen at creation. Check `glass.extendedRange` or the return value of `setExtendedRange()` to see whether it is actually active. A numeric `MaterialSpec` snapshot uses `rangeShare` (or its `headroom` compatibility field) for a separate 0-to-1 blend share; do not pass the display multiplier as that share.

### EnvironmentOptions

`"auto"` follows the relevant browser media query or page focus. Pass `true` or `false` to choose a setting explicitly.

| Option | Default | Behavior |
| --- | --- | --- |
| `active` | `true` | `false` uses flatter glass for an inactive window. `"auto"` follows page focus. |
| `tinted` | `false` | Uses a more opaque, more saturated variant of the standard material. |
| `reduceTransparency` | `"auto"` | Follows `prefers-reduced-transparency`; uses strong blur and high opacity without refraction. |
| `increaseContrast` | `"auto"` | Follows `prefers-contrast: more`; uses a stronger, more opaque tone. |
| `reduceMotion` | `"auto"` | Follows `prefers-reduced-motion: reduce`; removes interior refraction and increases blur. |
| `buttonShapes` | `false` | Draws rim lights as a plain outline instead of shaded bands. |

```ts
glass.setEnvironment({ active: "auto", increaseContrast: true });
glass.setEnvironment({ reduceMotion: true }); // Keeps active and increaseContrast unchanged.
glass.setAppearance("dark");
```

## Glass methods and state

| Method | Returns | Purpose |
| --- | --- | --- |
| `add(options: ShapeOptions)` | `GlassShape` | Creates a piece of glass. |
| `addGroup(options?: GroupOptions)` | `GlassGroup` | Creates a group that shares one material. |
| `setBackdrop(source, fit = "cover", live = false)` | `void` | Sets the source, fit and live-upload setting. `null` removes uploaded pixels and the retained source. |
| `setBackdropPixels(pixels: BackdropPixels)` | `Result<number>` | Uploads target-sized premultiplied float32 or binary16 encoded-sRGB pixels. Takes a snapshot for restoration; bypasses 2D canvas fitting. |
| `clearBackdrop()` | `void` | Removes pixels and retained sources, returning to the empty backdrop. |
| `setAppearance(appearance)` | `void` | Changes the default appearance. Shapes with an explicit appearance keep that setting. |
| `setEnvironment(options)` | `void` | Updates only the supplied environment fields. |
| `setLightAngle(radians)` | `void` | Rotates rim lights. |
| `setChromaticAberration(strength)` | `void` | Changes the canvas default for items that inherit it. |
| `setStacking("exact" or "flat")` | `void` | Changes how overlapping glass is drawn. |
| `setExtendedRange(on, headroom?)` | `boolean` | Sets extended range and returns whether it is active now. |
| `setDisplayBrightness(state)` | `Result<number>` | Resolves host-supplied brightness state into display headroom without changing the selected output range. Invalid input preserves the prior headroom and frame. |
| `resize(width?, height?, ratio?)` | `void` | Sets the buffer size from CSS dimensions and pixel ratio. With no arguments, reads the DOM size and device ratio. |
| `render(now?)` | `void` | Processes a frame immediately. `now` is in milliseconds. |
| `update()` | `void` | Schedules a frame after direct changes to the low-level renderer. |
| `destroy()` | `void` | Cancels frame requests, releases observers and frees GPU resources. |

| Property | Meaning |
| --- | --- |
| `canvas` | The connected `HTMLCanvasElement`. |
| `renderer` | The underlying `Renderer`. Call `glass.update()` after changing it directly. |
| `width`, `height` | Canvas dimensions in CSS pixels. |
| `environment` | Resolved environment settings as `ENV_*` bits. |
| `chromaticAberration` | Current canvas color-separation default. |
| `extendedRange` | Whether extended-range output is active. |
| `displayHeadroom` | Current supplied display multiplier, initially `1`. Browser capability does not supply a numeric current headroom. |
| `contextLost` | Whether the WebGL context is currently lost. |
| `error` | The reason reconstruction failed after context restoration; otherwise an empty string. |

For manual sizing, create the glass with `autoResize: false` and call `resize()` yourself. `resize(800, 600, 2)` requests a 1600×1200 buffer for an 800×600 CSS area; the ratio is capped by `maxPixelRatio`. Set the canvas's displayed CSS size separately, because `resize()` only changes its drawing buffer.

For a static scene, the convenience API schedules frames when something changes. A video backdrop, animation or `follow(element, true)` keeps frames running while needed. Framework adapters call `destroy()` when their canvas component unmounts.

## Creating and updating a shape

`glass.add(options)` requires four fields: `x`, `y`, `width` and `height`.

| Shape option | Default | Description |
| --- | --- | --- |
| `x`, `y` | Required | Position relative to the top-left corner of the canvas. |
| `width`, `height` | Required | The size of the glass. |
| `radius` | Half the short side | One number or four radii in `[topLeft, topRight, bottomRight, bottomLeft]` order. |
| `corner` | `"smooth"` | Corners that ease into the edges. `"circular"` uses circular arcs. |
| `mask` | Omitted | An image or canvas whose alpha channel defines the outline. A mask supplies the outline in place of `radius` and `corner`. |

With the default radius, a wide rectangle becomes a capsule and a square becomes a circle. For a card, set a radius explicitly, such as `radius: 24`.

### Material options shared by shapes and groups

`ShapeOptions` and `GroupOptions` share these `MaterialOptions`.

| Option | Default | Description |
| --- | --- | --- |
| `preset` | `"standard"` | Selects a built-in material. See the full preset list below. |
| `appearance` | Inherits the `Glass` setting | Sets `"light"`, `"dark"` or `"auto"` for this item. |
| `tint` | `null` | Applies an `Rgba` tint. The last channel is its strength; `null` removes it. |
| `opacity` | `1` | Overall opacity of the glass and its shadow, from 0 to 1. |
| `chromaticAberration` | Inherits `0.25` | Color-separation multiplier: `0` disables it, `1` uses the original profile distance. `null` restores canvas inheritance. |
| `visible` | `true` | Whether the item is shown. Hiding it keeps the object. |
| `pressed` | `false` | Adds a faint white or black veil to indicate a pressed surface. |
| `transition` | `"materialize"` | Uses a material transition of about half a second for visibility changes and removal. `"none"` applies them immediately. |
| `adaptive` | `true` | Allows supported presets with a short side up to 64 to follow backdrop luminance. |
| `onScheme` | `null` | Receives `"dark"` or `"light"` when the shown scheme changes, including the initial synchronization. |

Backdrop adaptation is currently supported by `standard` and `menu`. It also depends on size and environment: `tinted`, `reduceTransparency` and `increaseContrast` keep the scheme fixed.

```ts
const card = glass.add({
    x: 40, y: 40, width: 320, height: 180,
    radius: [32, 32, 12, 12],
    preset: "standard",
});

card.move(80, 60).resize(360, 200);
card.set({ radius: 20, opacity: 0.85 });
card.press(true);
card.press(false);
card.hide();
card.show();
// Remove the object when you are finished with it.
card.remove();
```

### GlassShape and GlassItem

`GlassShape` and `GlassGroup` inherit shared behavior from `GlassItem`. Create them with `glass.add()` and `glass.addGroup()`.

| Method | Returns | Behavior |
| --- | --- | --- |
| `shape.set(update: ShapeUpdate)` | The shape | Changes only the supplied shape and material options. |
| `shape.move(x, y)` | The shape | Changes the top-left position. |
| `shape.resize(width, height)` | The shape | Changes size while keeping the top-left position. |
| `shape.follow(element, everyFrame = false)` | The shape | Matches position and size to the element's DOM box. |
| `shape.unfollow()` | `void` | Stops following the element and keeps the current frame. |
| `item.show()`, `item.hide()` | The item | Shows or hides it using its `transition` setting. |
| `item.press(down)` | The item | Changes the pressed state. |
| `item.remove()` | `void` | Removes the object. Create a new one if you need it again. |

| Shared property | Meaning |
| --- | --- |
| `glass` | The `Glass` instance this item belongs to. |
| `handle` | Numeric handle for low-level renderer calls. It becomes invalid after removal. |
| `alive` | `true` until `remove()` is called; already `false` while removal is animating. |
| `shownScheme` | The currently shown `"light"` or `"dark"` scheme. Adaptive glass may differ from the configured appearance. |
| `foreground` | Content colors as CSS strings: `{ text, title }`. |
| `chromaticAberration` | Effective color-separation multiplier, including an inherited canvas default. |
| `error` | The reason a preset name, removed override or mask was rejected; a successfully applied setting clears it. |

A hidden item can be shown again. A removed item must be created again. `opacity` blends the finished glass as a whole, while `transition` controls how its material appears or disappears.

## Adjusting color separation

`chromaticAberration` controls color separation independently of glass opacity, refraction, rim lighting and shadows. Its range is `0` to `1`; the default is `0.25`. `0` disables the effect, while `1` preserves the selected preset's original separation distance. Finite values outside the range are clamped; nonfinite values restore `0.25`.

The option scales separation already present in a profile. Start with `control` for visible rainbow fringes along sharp backdrop edges. `loupe` has a weaker separation profile; `standard` and `clear` have no color separation to scale. A canvas default applies to shapes and groups that omit the option. An explicit value, including zero, overrides it. Set an item back to `null` to inherit the canvas again.

Numeric helpers such as `presetMaterial()` and `packPreset()` return the original profile values. The renderer applies the multiplier after packing, without changing those source values.

```ts
const lens = glass.add({
    x: 40, y: 40, width: 160, height: 160,
    preset: "control", // inherits the subtle default
});
lens.set({ chromaticAberration: 0.4 });
glass.setChromaticAberration(0.2);
lens.set({ chromaticAberration: null }); // now follows 0.2
```

Read `glass.chromaticAberration` for the canvas default or `lens.chromaticAberration` for the item's effective value. `createGlass(canvas, { chromaticAberration: 0.2 })` sets the initial default. `DEFAULT_CHROMATIC_ABERRATION` is exported from `glassrender/core`, the root entry, and `glassrender/advanced`.

The React, Svelte, Vue and Solid adapters expose the same property on `GlassCanvas`, `Glass` and `GlassGroup`. A group owns its material, so its members inherit the group setting.

```tsx
<GlassCanvas chromaticAberration={0.2}>
    <Glass preset="control" chromaticAberration={0.1}>...</Glass>
    <GlassGroup preset="control" chromaticAberration={0.3}>...</GlassGroup>
</GlassCanvas>
```

```svelte
<GlassCanvas chromaticAberration={0.2}>
    <Glass preset="control" chromaticAberration={0.1}>...</Glass>
</GlassCanvas>
```

```vue
<GlassCanvas :chromatic-aberration="0.2">
    <Glass preset="control" :chromatic-aberration="0.1">...</Glass>
</GlassCanvas>
```

## Following an HTML element

Keep text and interactions in a DOM element and draw glass beneath it. Add this button after the canvas in the quick-start HTML, then connect it in the script. Its position and stacking order place it above the canvas.

```html
<button id="glass-button" style="position: fixed; left: 48px; top: 48px;
    width: 240px; height: 64px; z-index: 1; background: transparent;
    border: 0; border-radius: 20px; color: var(--glass-title, black);">
    Save
</button>
```

```ts
const element = document.querySelector<HTMLButtonElement>("#glass-button");
if (!element) throw new Error("Button not found.");

const buttonGlass = glass.add({
    x: 0, y: 0, width: 0, height: 0,
    radius: 20,
    preset: "standard",
}).follow(element);

element.addEventListener("pointerdown", (event) => {
    buttonGlass.press(true);
    element.setPointerCapture(event.pointerId);
});
const release = () => { buttonGlass.press(false); };
element.addEventListener("pointerup", release);
element.addEventListener("pointercancel", release);
element.addEventListener("lostpointercapture", release);
```

Followed elements receive the CSS custom properties `--glass-foreground` and `--glass-title`. Use `color: var(--glass-foreground)` for ordinary content and `color: var(--glass-title)` for a control title. Unfollowing or removing the glass clears these properties.

For elements moving through CSS animations or transforms, use `follow(element, true)` to measure on every frame. The measurement uses the element's axis-aligned bounding box; it does not reproduce a rotated outline.

## All presets

Presets resolve their values from size, appearance and environment. `PRESET_NAMES` contains 28 preset names. Some roles share a profile: `player` and `call` use the `clear` profile, `inspector` shares `attachedSidebar`, and `focusBackground` shares `focusRing`. Pass a name from the first column to `preset`.

| Name | Low-level constant | Purpose and characteristics |
| --- | --- | --- |
| `standard` | `PRESET_STANDARD` | General-purpose frosted glass. A useful starting point. |
| `clear` | `PRESET_CLEAR` | Clear glass with little blur and no shadow. |
| `identity` | `PRESET_IDENTITY` | Shows the backdrop without applying an effect. |
| `menu` | `PRESET_MENU` | A menu surface that can adapt to backdrop luminance at small sizes. |
| `notification` | `PRESET_NOTIFICATION` | A notification surface. |
| `popover` | `PRESET_POPOVER` | A popover surface. |
| `sidebar` | `PRESET_SIDEBAR` | A sidebar surface. |
| `attachedSidebar` | `PRESET_ATTACHED_SIDEBAR` | An attached sidebar surface. |
| `inspector` | `PRESET_INSPECTOR` | An inspector panel. |
| `dock` | `PRESET_DOCK` | A dock surface, evaluated at short-side size class 160 regardless of the bar's actual height. |
| `controlPanel` | `PRESET_CONTROL_PANEL` | A control-panel surface. |
| `keyboard` | `PRESET_KEYBOARD` | A keyboard surface. |
| `widget` | `PRESET_WIDGET` | A widget surface. |
| `icon` | `PRESET_ICON` | An icon material. |
| `player` | `PRESET_PLAYER` | Clear glass for player controls over video. |
| `call` | `PRESET_CALL` | Clear glass for a call interface. |
| `camera` | `PRESET_CAMERA` | A camera surface. |
| `control` | `PRESET_CONTROL` | A control lens with color fringes. |
| `loupe` | `PRESET_LOUPE` | An edge-refraction lens with built-in color separation; it does not implement application zoom. |
| `slider` | `PRESET_SLIDER` | A slider lens. |
| `monogram` | `PRESET_MONOGRAM` | A lens drawn with bright lights only. |
| `bubble` | `PRESET_BUBBLE` | A bubble surface. |
| `text` | `PRESET_TEXT` | A text-field material. |
| `assistant` | `PRESET_ASSISTANT` | An assistant surface. |
| `assistantCard` | `PRESET_ASSISTANT_CARD` | An assistant card. |
| `focusRing` | `PRESET_FOCUS_RING` | Focus-border material; your app supplies ring geometry and focus behavior. |
| `focusBackground` | `PRESET_FOCUS_BACKGROUND` | Focus-platter role; your app supplies geometry and focus behavior. |
| `vehicle` | `PRESET_VEHICLE` | Experimental vehicle-oriented profile. |

```ts
panel.set({ preset: "clear" }); // The clear preset.
panel.set({ preset: "standard" }); // The standard preset.
```


## Merging shapes in a group

A group shares its material, tint, opacity and visibility across its members. Each member supplies its position and outline. `spacing` is the distance over which neighboring outlines flow into one another. With the default `0`, they share a material without a smooth connecting region.

```ts
const group = glass.addGroup({
    preset: "standard",
    spacing: 20,
});

const left = group.add({ x: 40, y: 260, width: 120, height: 72, radius: 24 });
const right = group.add({ x: 168, y: 260, width: 120, height: 72, radius: 24 });
if (!left || !right) throw new Error(group.error || "Could not add a group member.");

right.move(152, 260); // Brings the outlines closer together.
left.set({ width: 144, radius: [24, 12, 12, 24] });
group.set({ spacing: 28, opacity: 0.9 });
console.log(group.size); // 2
right.remove(); // Removes just this member.
group.hide();
group.show();
group.remove(); // Removes the group's glass.
```

| API | Description |
| --- | --- |
| `glass.addGroup(options?: GroupOptions)` | Takes `MaterialOptions` plus `spacing`. |
| `group.add(options: MemberOptions)` | Returns the member, or `null` on failure. |
| `group.set(update: GroupUpdate)` | Changes the supplied material or spacing fields. |
| `group.size` | Number of members. |
| `group.show()`, `hide()`, `press()`, `remove()` | Uses the shared `GlassItem` behavior. |
| `member.set(update: MemberUpdate)` | Updates `x`, `y`, `width`, `height`, `radius` or `mask`. |
| `member.move(x, y)` | Changes the member's position. |
| `member.follow(element, everyFrame = false)` | Follows a DOM bounding box. |
| `member.unfollow()` | Stops following the element. |
| `member.remove()` | Removes this member from its group. |
| `member.group`, `member.alive` | Reads the owning group and whether the member has been removed. |

A group holds at most 16 members, including at most 4 mask members. `MemberOptions` requires `x`, `y`, `width` and `height`, with optional `radius`, `corner` and `mask`. A member's `corner` kind is fixed when it is added. Resize a member with `member.set({ width, height })`.

## Custom outlines with masks

The mask's alpha channel defines the glass outline; its RGB color does not. This example draws a white diamond on a transparent canvas and uses it as a mask.

```ts
const mask = document.createElement("canvas");
mask.width = 128;
mask.height = 128;
const ctx = mask.getContext("2d");
if (!ctx) throw new Error("Could not create the mask canvas.");
ctx.fillStyle = "white";
ctx.beginPath();
ctx.moveTo(64, 4);
ctx.lineTo(124, 64);
ctx.lineTo(64, 124);
ctx.lineTo(4, 64);
ctx.closePath();
ctx.fill();

const diamond = glass.add({
    x: 380, y: 40, width: 160, height: 160,
    mask,
    preset: "clear",
});
if (diamond.error) console.error(diamond.error);

// Request another upload after changing the canvas's contents.
ctx.clearRect(0, 0, 128, 128);
ctx.beginPath();
ctx.arc(64, 64, 56, 0, Math.PI * 2);
ctx.fill();
diamond.set({ mask });
```

Provide the mask when creating the shape. You can replace the mask of an existing mask shape, but you cannot convert a rounded rectangle into a mask shape later. Masks require `EXT_color_buffer_float`. If creating a standalone mask shape fails, the convenience API creates a rounded rectangle and records the reason in `shape.error`. Adding a mask member to a group returns `null` on failure.

## Image and video backdrops

### Loading an image

The core takes an `Image` object. Replace `src` with an image path served by your app.

```ts
const image = new Image();
image.src = "/images/background.jpg";
await image.decode();
glass.setBackdrop(image, "cover");
```

For an image from another origin, set `image.crossOrigin = "anonymous"` before assigning `src`, and make sure its server permits your app to load it. The framework adapters use this setting when loading image URLs.

### Using video or an animated canvas

```ts
const video = document.createElement("video");
video.muted = true;
video.playsInline = true;
video.loop = true;
video.src = "/videos/background.mp4";
await video.play();

glass.setBackdrop(video, "cover", true);
// The glass keeps reading new frames from this source.
const controls = glass.add({
    x: 40, y: 360, width: 300, height: 64,
    radius: 24, preset: "player",
});

window.addEventListener("pagehide", () => {
    video.pause();
    controls.remove();
    glass.destroy();
}, { once: true });
```

Connect an animated 2D canvas in the same way: `glass.setBackdrop(animatedCanvas, "cover", true)`. `live` repeatedly uploads the source; your app still handles video playback or the canvas animation. After manually editing a static canvas, call `setBackdrop()` again to upload its new contents.

### Raw HDR pixels

Create the glass with `extendedRange: true` or `"auto"` when float output is needed. `setBackdropPixels()` accepts a target-sized `BackdropPixels` descriptor. `Float32Array` values are stored in RGBA16F; `Uint16Array` contains raw binary16 words. The method returns `Result<number>` with `0` on success.

```ts
import type { BackdropPixels } from "glassrender";

const width = glass.canvas.width, height = glass.canvas.height;
const data = new Float32Array(width * height * 4);
for (let i = 0; i < data.length; i += 4) {
    data[i] = 1.5; data[i + 1] = 1; data[i + 2] = 0.75; data[i + 3] = 1;
}
const pixels: BackdropPixels = { width, height, data };
const uploaded = glass.setBackdropPixels(pixels);
if (!uploaded.ok) throw new Error(uploaded.error);
glass.setExtendedRange(true, 1.25); // A current multiplier supplied by your host.
```

Pixels use **encoded extended sRGB with premultiplied alpha**. RGB may be negative or exceed `1`, within the finite binary16 range `[-65504, 65504]`. Alpha is `0..1`; zero-alpha pixels have zero RGB. Linear RGB and Display P3 screenshots need conversion before upload. `rows` defaults to `ROWS_TOP_DOWN`; use `ROWS_BOTTOM_UP` for bottom-first arrays. No color conversion, additional premultiplication, fit or live DOM upload occurs.

The renderer snapshots a successful upload for context restoration. Changing the caller's array or submitting invalid data does not change that snapshot. Upload again after edits or resizing. `setBackdrop(null)` and `clearBackdrop()` both remove uploaded pixels and retained sources. DOM and raw sources can replace each other.

`extendedRange` reports float drawing-buffer support. Values above `1` can be verified with `gl.readPixels(..., gl.RGBA, gl.FLOAT, ...)`; physical HDR presentation also depends on browser compositing and the current display state. The browser's `dynamic-range: high` capability is not a numeric current headroom. The default is `1`; supply a measured host value to select the material's HDR share. Context/surface coefficients supplied by `setSurfaceScale()` remain independent.

When the host supplies current brightness state, `glass.setDisplayBrightness(state)` computes and applies its display multiplier. `resolveDisplayHeadroom(state)` from `glassrender/core` or the root entry point performs the same calculation without changing a renderer. Both return `Result<number>`.

`DisplayBrightness` requires `panelMax`, `brightnessCap`, `sdrBrightness` and `maxHeadroom`. Brightness values are nonnegative finite Float32 numbers in the same units. `minHeadroom` defaults to `1`; both headroom bounds must be at least `1`, with `maxHeadroom >= minHeadroom`. Optional `requestedHeadroom` selects a capped requested multiplier; omission selects the available multiplier. The calculation clips SDR brightness to the panel maximum, uses the lower panel/brightness cap, and retains Float32 division and product boundaries.

```ts
const headroom = glass.setDisplayBrightness({
    panelMax: 600,
    brightnessCap: 500,
    sdrBrightness: 400,
    maxHeadroom: 2,
});
if (!headroom.ok) throw new Error(headroom.error);
console.log(headroom.value); // 1.25 for these supplied values.
```

Invalid state preserves the previous headroom and pixels. Updating brightness state keeps the selected SDR/HDR mode and independent surface/context coefficients. Device state discovery, brightness modulation curves and ramp scheduling remain with the host.

## Material catalog

`glassrender/materials` exports the preset catalog and helpers for selecting or inspecting a material.

```js
import { MATERIALS, getMaterialInfo } from "glassrender/materials";

console.log(MATERIALS.map(material => material.name));
const player = getMaterialInfo("player");
console.log(player?.canonical); // "clear"
console.log(player?.aliases); // Related role names.
```

| Export | Purpose |
| --- | --- |
| `MATERIALS` | Frozen metadata array for all 28 presets. |
| `getMaterialInfo(name)` | Returns a preset's metadata or `null` for an unknown name. |
| `PRESET_NAMES`, `PRESET_COUNT` | All preset names and their count. |
| `presetNumber(name)` | Returns the numeric preset ID, or `-1` for an unknown name. |
| `presetMaterial(number, side, scheme, ...)` | Returns a resolved numeric snapshot; see the calculation reference. |

Each `MaterialInfo` has `name`, `canonical`, `aliases`, `category`, `description`, `recommendedUses`, `adaptation`, `fixedShortSide` and `status`. Aliases share a profile and keep separate role names. The catalog and its entries are frozen. Use `name` for a role and `canonical` for its shared profile.

Choose a material with `preset`. Authored recipes, raw `material` overrides and the synthetic `prominent` preset are no longer accepted. See [migration notes](#migrating-older-examples) for replacement APIs.

For resolved numeric snapshots, see [MaterialSpec fields](#all-materialspec-fields) and [calculation/packing helpers](#material-calculation-and-packing). These helpers inspect profile values or support an independent renderer; they do not apply authored overrides to this renderer.

## Migrating older examples

Choose a built-in preset and keep geometry, visibility and interactions as separate options. These changes intentionally remove material authoring from the renderer.

| Older usage | Current usage |
| --- | --- |
| `createMaterial()` or `material: {...}` | Use `preset: "standard"`, `"clear"` or another preset name. |
| `prominent` | Choose an actual built-in control profile such as `standard` or `control`. |
| `Renderer.setMaterial()` / `setRecipe()` | Use `Renderer.setPreset(handle, presetNumber(name), scheme)`. |
| `Renderer.getRecipe()` | Use `Renderer.getPreset(handle)`; inspect metadata with `getMaterialInfo(name)`. |
| `setAccent()` / `GlassCanvas.accent` | Remove the old synthetic-preset accent option. Built-in examples use the profile unchanged. |

```ts
import type { Preset } from "glassrender/materials";

const preset: Preset = "clear";
panel.set({ preset });
if (panel.error) throw new Error(panel.error);
```

Unknown names are rejected. An existing item retains its accepted preset on rejection; a newly created item falls back to `standard` while reporting the error. Numeric preset snapshots remain available through `presetMaterial()`, but they are not accepted as runtime overrides.

## React components

`glassrender-react` exports `GlassCanvas`, `Glass`, `GlassGroup` and `useGlass`. Use the following as `App.tsx`. The README's React example covers the app entry point and npm installation.

```tsx
import { useState } from "react";
import { Glass, GlassCanvas } from "glassrender-react";

const backdrop = "data:image/svg+xml," + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500">' +
    '<rect width="800" height="500" fill="#163350"/>' +
    '<circle cx="300" cy="200" r="180" fill="#7960e8"/>' +
    '<path d="M0 400L800 100V500H0Z" fill="#e58c53"/>' +
    '</svg>'
);

export default function App() {
    const [visible, setVisible] = useState(true);
    const [count, setCount] = useState(0);
    return (
        <>
            <button onClick={() => setVisible((value) => !value)}>Toggle glass</button>
            <GlassCanvas
                backdrop={backdrop}
                fixed={false}
                style={{ height: 420 }}
                onError={(message) => console.error(message)}
            >
                <main style={{ height: "100%", display: "grid", placeItems: "center" }}>
                    <Glass
                        preset="standard"
                        radius={24}
                        visible={visible}
                        onScheme={(scheme) => console.log("Shown scheme:", scheme)}
                        style={{ width: 280, padding: 24 }}
                    >
                        <h1>Glass card</h1>
                        <p>Clicked {count} times.</p>
                        <button onClick={() => setCount((value) => value + 1)}>Click me</button>
                    </Glass>
                </main>
            </GlassCanvas>
        </>
    );
}
```

`visible={false}` hides the glass effect. Use conditional rendering or CSS to hide its DOM content too. `Glass` renders a `div`; put an actual button or link inside it when you need an interactive control.

Place the following group component inside `GlassCanvas`. `GlassGroup` supplies group context without adding a layout element, so use a separate element's CSS for layout and spacing.

```tsx
import { Glass, GlassGroup } from "glassrender-react";

export function Toolbar() {
    return (
        <GlassGroup preset="standard" spacing={20}>
            <div style={{ display: "flex", gap: 8 }}>
                <Glass radius={20} style={{ width: 88, padding: 16 }}>Previous</Glass>
                <Glass radius={20} style={{ width: 88, padding: 16 }}>Next</Glass>
            </div>
        </GlassGroup>
    );
}
```

### Getting the core instance with useGlass

`useGlass()` returns `{ glass, error }` from the nearest `GlassCanvas`. It returns `null` outside a canvas, and `glass` is `null` until initialization completes. Call it in a **child component** of `GlassCanvas`.

```tsx
import { useGlass } from "glassrender-react";

export function DarkModeButton() {
    const state = useGlass();
    return (
        <button
            disabled={!state?.glass}
            onClick={() => state?.glass?.setAppearance("dark")}
        >
            Use dark glass
        </button>
    );
}
```

The React adapter also exports the types `GlassProps`, `GlassCanvasProps`, `GlassGroupProps` and `CanvasState`. A `Glass` ref points to the rendered `HTMLDivElement`, rather than a core `GlassShape`.

## Svelte components

Use `glassrender-svelte` with Svelte 5. The following is an `App.svelte` example.

```svelte
<script lang="ts">
    import { Glass, GlassCanvas } from "glassrender-svelte";

    let visible = $state(true);
    let count = $state(0);
    const backdrop = "data:image/svg+xml," + encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500">' +
        '<rect width="800" height="500" fill="#163350"/>' +
        '<circle cx="300" cy="200" r="180" fill="#7960e8"/>' +
        '<path d="M0 400L800 100V500H0Z" fill="#e58c53"/>' +
        '</svg>'
    );
</script>

<button onclick={() => { visible = !visible; }}>Toggle glass</button>
<div style="height: 420px;">
    <GlassCanvas {backdrop} fixed={false} onerror={(message) => console.error(message)}>
        <main style="height: 420px; display: grid; place-items: center;">
            <Glass preset="standard" radius={24} {visible}
                onscheme={(scheme) => console.log("Shown scheme:", scheme)}
                style="width: 280px; padding: 24px;">
                <h1>Glass card</h1>
                <p>Clicked {count} times.</p>
                <button onclick={() => { count += 1; }}>Click me</button>
            </Glass>
        </main>
    </GlassCanvas>
</div>
```

To use a group, place this component inside `GlassCanvas`.

```svelte
<script lang="ts">
    import { Glass, GlassGroup } from "glassrender-svelte";
</script>

<GlassGroup preset="standard" spacing={20}>
    <div style="display: flex; gap: 8px;">
        <Glass radius={20} style="width: 88px; padding: 16px;">Previous</Glass>
        <Glass radius={20} style="width: 88px; padding: 16px;">Next</Glass>
    </div>
</GlassGroup>
```

### Getting the core instance with getGlass

Call `getGlass()` during component initialization. The returned `CanvasState` has a reactive `glass` field, initially `null`. Outside a canvas it returns `undefined`. Use this as a separate child component inside `GlassCanvas`.

```svelte
<script lang="ts">
    import { getGlass } from "glassrender-svelte";
    const state = getGlass();
</script>

<button disabled={!state?.glass} onclick={() => state?.glass?.setAppearance("dark")}>
    Use dark glass
</button>
```

Svelte callback names are lowercase: `onscheme`, `onerror`, `oncontextlost` and `oncontextrestored`. Content is passed as a `children` snippet using the usual component-child syntax.

## Vue components

Use `glassrender-vue` with Vue 3.4 or later. The following is an `App.vue` example.

```vue
<script setup lang="ts">
import { ref } from "vue";
import { Glass, GlassCanvas } from "glassrender-vue";

const visible = ref(true);
const count = ref(0);
const backdrop = "data:image/svg+xml," + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500">' +
    '<rect width="800" height="500" fill="#163350"/>' +
    '<circle cx="300" cy="200" r="180" fill="#7960e8"/>' +
    '<path d="M0 400L800 100V500H0Z" fill="#e58c53"/>' +
    '</svg>'
);

function logError(message: string) { console.error(message); }
function logScheme(scheme: "dark" | "light") { console.log("Shown scheme:", scheme); }
</script>

<template>
    <button @click="visible = !visible">Toggle glass</button>
    <GlassCanvas :backdrop="backdrop" :fixed="false" style="height: 420px;" @error="logError">
        <main style="height: 100%; display: grid; place-items: center;">
            <Glass preset="standard" :radius="24" :visible="visible" @scheme="logScheme"
                style="width: 280px; padding: 24px;">
                <h1>Glass card</h1>
                <p>Clicked {{ count }} times.</p>
                <button @click="count += 1">Click me</button>
            </Glass>
        </main>
    </GlassCanvas>
</template>
```

Place this group component inside `GlassCanvas`.

```vue
<script setup lang="ts">
import { Glass, GlassGroup } from "glassrender-vue";
</script>

<template>
    <GlassGroup preset="standard" :spacing="20">
        <div style="display: flex; gap: 8px;">
            <Glass :radius="20" style="width: 88px; padding: 16px;">Previous</Glass>
            <Glass :radius="20" style="width: 88px; padding: 16px;">Next</Glass>
        </div>
    </GlassGroup>
</template>
```

### Getting the core instance with useGlass

Call Vue's `useGlass()` in `setup`. It returns a reactive `{ glass, error }` state, or `undefined` outside a canvas. `glass` is initially `null`. Use this example as a child component inside `GlassCanvas`.

```vue
<script setup lang="ts">
import { useGlass } from "glassrender-vue";
const state = useGlass();
</script>

<template>
    <button :disabled="!state?.glass" @click="state?.glass?.setAppearance('dark')">
        Use dark glass
    </button>
</template>
```

## Framework component options

All four adapters use the same roles: `GlassCanvas` manages the canvas and core instance, `Glass` draws within its DOM box, and a `Glass` inside `GlassGroup` becomes a member of that group.

### Solid

`glassrender-solid` exposes `GlassCanvas`, `Glass`, `GlassGroup`, `useGlass()` and their props types. It uses Solid 1.9 or later and your application's Solid JSX compiler. Install the adapter with `npm install glassrender@beta glassrender-solid@beta`; see the [usage example](README.md#solid).

```tsx
import { createEffect, createSignal } from "solid-js";
import { GlassCanvas, Glass, useGlass } from "glassrender-solid";

function Status() {
    const state = useGlass();
    createEffect(() => console.log(state?.glass, state?.error));
    return null;
}

function Panel() {
    const [opacity, setOpacity] = createSignal(1);
    return <GlassCanvas backdrop="/wallpaper.jpg">
        <Status />
        <Glass preset="standard" radius={24} opacity={opacity()} style={{ padding: "24px" }}>
            <button onClick={() => setOpacity(opacity() === 1 ? 0.5 : 1)}>Change opacity</button>
        </Glass>
    </GlassCanvas>;
}
```

`useGlass()` returns `null` outside `GlassCanvas`. Within it, `glass` is initially `null` and becomes ready after client mount. Its `glass` and `error` properties are reactive getters: keep the state object intact and read them within an effect. Components accept Solid's `class`, `style`, `ref` and DOM event props. `GlassGroup` supplies the material to descendant `Glass` outlines. SSR produces markup; WebGL is initialized only on client mount, and unmount releases shapes, members, pointer listeners and the renderer.

### GlassCanvas props

| Prop | Default | Description |
| --- | --- | --- |
| `backdrop` | `null` | An image URL string or a `TexImageSource` object. |
| `fit` | `"cover"` | `cover`, `contain` or `stretch`. |
| `live` | `false` | Uploads a video or canvas object on every frame. URL strings are loaded as static images. |
| `appearance` | `"auto"` | Default appearance. |
| `stacking` | `"exact"` | How overlapping glass is drawn. |
| `lightAngle` | `0` | Rim-light rotation in radians. |
| `chromaticAberration` | `0.25` | Default color-separation multiplier for descendant glass (`0..1`). |
| `maxPixelRatio` | `2` | Maximum drawing-buffer pixels per CSS pixel. |
| `active` | `true` | Window activity; also accepts `"auto"`. |
| `tinted` | `false` | A more opaque, more saturated variant. |
| `reduceTransparency`, `increaseContrast`, `reduceMotion` | Each `"auto"` | Follows accessibility settings or explicitly enables or disables them. |
| `buttonShapes` | `false` | Draws rim lights as a plain outline. |
| `extendedRange` | `false` | Requests extended range; also accepts `"auto"`. |
| `headroom` | `2` | Legacy display brightness multiplier. |
| `displayHeadroom` | Omitted | Preferred display multiplier name; takes precedence over `headroom`. |
| `fixed` | `true` | The canvas covers the viewport; `false` makes it cover the component's area. |
| Content and styling | Framework syntax | React uses `children`, `className`, `style`; Svelte uses `children`, `class`; Vue uses its default slot and `class`, `style` attributes; Solid uses `children`, `class`, `style` and `ref`. |

Pass environment settings as individual `GlassCanvas` props. The core API instead groups them under `environment`. Adapters resize automatically. With `fixed: false`, give the container an actual height. Svelte's `GlassCanvas` has no `style` prop, so size it through an outer container or a class, as in the example above.

`maxPixelRatio` is read at initial creation. Extended range must start as `true` or `"auto"` if you want to enable it later. Other settings such as the backdrop, appearance, tint and visibility can be updated through their props.

### Glass props

`preset`, `appearance`, `tint`, `opacity`, `chromaticAberration`, `visible`, `pressed`, `transition` and `adaptive` have the same meanings as the material options described above. `radius`, `corner` and `mask` match the shape options. Position and size come from the DOM, so the components have no `x`, `y`, `width` or `height` props.

| Additional prop | Default | Description |
| --- | --- | --- |
| `interactive` | `false` | Automatically shows the pressed veil while a pointer is down, preserving clicks on child buttons and links. Use a real button or link for HTML control and keyboard behavior. |
| `everyFrame` | `false` | Measures a box moving through CSS animation on every frame. |
| DOM attributes | Standard DOM defaults | Accepts `className` or `class`, `style`, DOM events and content. |

Put click handlers on the actual button or link inside `Glass`. `interactive` tracks the press without taking pointer capture from the child, and clears the veil on release outside the box, cancellation or window blur.

Mask geometry is chosen when the shape is first created. A group member's `corner` is also chosen at initial attachment; remount the component to change it. React, Svelte, Vue and Solid update the follower when `everyFrame` changes, for both shapes and group members. The default radius is half the short side; removing the `radius` prop restores that automatic radius in all four adapters. Set the `radius` prop to change the glass outline; a CSS `border-radius` alone changes only the DOM styling. Low-level shape and member updates can use `radius: null` to restore the automatic radius.

### GlassGroup props

Provides `spacing = 0`, `preset`, `appearance`, `tint`, `opacity`, `chromaticAberration`, `visible`, `transition`, `adaptive` and the scheme-change event. Children share the group's material and contribute their DOM boxes, `radius`, `corner` and `mask` as outlines. The group adapters have no `pressed` or `interactive` props.

### Callback and event names

| Event or action | React | Svelte | Vue |
| --- | --- | --- | --- |
| Shown scheme changes | `onScheme={callback}` | `onscheme={callback}` | `@scheme="callback"` |
| Canvas initialization fails | `onError={callback}` | `onerror={callback}` | `@error="callback"` |
| Context is lost | `onContextLost={callback}` | `oncontextlost={callback}` | `@contextlost="callback"` |
| Context is restored | `onContextRestored={callback}` | `oncontextrestored={callback}` | `@contextrestored="callback"` |
| Read the core instance | `useGlass()` | `getGlass()` | `useGlass()` |

Set scheme callbacks on `Glass` or `GlassGroup`, and initialization and context callbacks on `GlassCanvas`. Scheme callbacks receive `"dark"` or `"light"`; error callbacks receive a string. Context-loss callbacks have no arguments. Context-restoration callbacks receive an empty string on success.

## Using the WebGL renderer directly

`createRenderer(gl: WebGL2RenderingContext): Result<Renderer>` connects glass to an existing WebGL2 context. `Renderer.create(gl)` does the same thing. Use it when supplying your own WebGL backdrop texture or integrating glass into your own render loop.

With this API, you manage canvas dimensions, pixel ratio, backdrop sizing and uploads, frame requests and context recovery. Width and height passed to `renderer.resize()` are device pixels. Shape positions and sizes remain in points corresponding to CSS pixels.

```ts
import { createRenderer, CORNER_SMOOTH, SCHEME_LIGHT } from "glassrender/advanced";

const canvas = document.createElement("canvas");
canvas.style.width = "800px";
canvas.style.height = "500px";
canvas.width = 1600;
canvas.height = 1000;
document.body.append(canvas);

const gl = canvas.getContext("webgl2", {
    alpha: false, antialias: false, depth: false, stencil: false,
});
if (!gl) throw new Error("WebGL2 is not available.");
const result = createRenderer(gl);
if (!result.ok) throw new Error(result.error);
const renderer = result.value;
renderer.resize(canvas.width, canvas.height, 2);

// Prepare a backdrop with the same dimensions as the output buffer.
const background = document.createElement("canvas");
background.width = canvas.width;
background.height = canvas.height;
const ctx = background.getContext("2d");
if (!ctx) throw new Error("Could not create the backdrop.");
ctx.fillStyle = "#7960e8";
ctx.fillRect(0, 0, background.width, background.height);
ctx.fillStyle = "#e58c53";
ctx.fillRect(0, 300, background.width, 160);
renderer.setBackdropSource(background);

const handle = renderer.addShape(48, 48, 320, 160, 24, CORNER_SMOOTH, SCHEME_LIGHT);
// addShape starts with the built-in standard profile; no authored material is applied.
renderer.setPresence(handle, 0);
renderer.animatePresence(handle, 1);

let frameId = 0;
const draw = (now: number) => {
    frameId = 0;
    // true means a transition or luminance reading needs another frame.
    if (renderer.render(now)) frameId = requestAnimationFrame(draw);
};
frameId = requestAnimationFrame(draw);

window.addEventListener("pagehide", () => {
    if (frameId) cancelAnimationFrame(frameId);
    renderer.dispose();
}, { once: true });
```

This draws the initial scene and the materialization animation. Schedule a new frame yourself after a later call such as `setShape()` or a backdrop change. For continuously changing sources such as video, keep requesting frames regardless of the return value from `render()`.

### Connecting a backdrop texture

You can connect a texture drawn by other WebGL code. It must be created in the **same WebGL context** and match the output-buffer dimensions. In this example, `renderer` and `gl` are the instances above, and `texture` is supplied by your app.

```ts
import { ROWS_BOTTOM_UP } from "glassrender/advanced";

renderer.setBackdropTexture(texture, ROWS_BOTTOM_UP);
// Call this after the app draws a new scene into texture.
renderer.markBackdropDirty();
renderer.render(performance.now());
```

Use `ROWS_TOP_DOWN` for typical DOM image uploads and `ROWS_BOTTOM_UP` for framebuffer renders. The caller owns the texture and must recreate and reconnect it after context restoration. The renderer changes WebGL bindings and render state, so reset any state your own code needs before drawing again in the same context.

For an integration that already provides a context color multiplier and a surface EDR factor, use `renderer.setSurfaceScale(contextScale, factor)`. These values configure color normalization independently of `headroom`. The default `(1, 1)` leaves normalization inactive; ordinary image and canvas backdrops do not need this method. The browser does not discover these coefficients.

```ts
// Only use coefficients supplied by the rendering surface you are integrating.
const scales = renderer.setSurfaceScale(contextScale, surfaceEDRFactor);
if (!scales.ok) throw new Error(scales.error);
renderer.render(performance.now());
```

This returns `Result<boolean>`: the boolean reports whether context normalization is active in extended output. The surface resolve factor is applied independently. A factor of `0` selects the default `1`; negative factors become `0`, and factors above `1` become `1`. Invalid scales are rejected without changing the accepted configuration. The optional third argument, `stateFactor` (default `1`), multiplies the surface factor before EDR resolve. It must be a nonnegative finite Float32 value and does not select context normalization. The coefficients are retained across output-range changes and context restoration. HDR texture samples preserve premultiplied alpha through the blur pyramid and normalize it during color lookup; the output canvas remains opaque.

### All Renderer methods

In the following tables, `h` is a glass handle and `i` is a group member index. `w`, `height` and `r` describe shape dimensions and radius. Use the constants listed below for `scheme`, `corner`, `preset`, `rows` and `mode`.

| Creation and frame method | Result and behavior |
| --- | --- |
| `Renderer.create(gl)`, `createRenderer(gl)` | Returns `Result<Renderer>`. |
| `resize(width, height, scale)` | Sets output dimensions in device pixels and scale in device pixels per point. Also set the canvas's `width` and `height` yourself. |
| `render(now?)` | Draws into the default framebuffer. Returns `true` if another frame is needed. Time is in milliseconds. |
| `restore()` | Recreates GPU objects after context restoration. Success is a `Result<number>` with value `0`. |
| `dispose()` | Releases the GPU objects it created. Caller-supplied backdrop textures remain the caller's responsibility. |

| Backdrop and scene method | Behavior |
| --- | --- |
| `setBackdropSource(source)` | Uploads an output-sized `TexImageSource`. It has no `fit` or `live` arguments. |
| `setBackdropPixels(pixels)` | Uploads target-sized `BackdropPixels` as RGBA16F. Returns `Result<number>`; preserves prior source on invalid data. Retains a snapshot for restoration. |
| `clearBackdrop()` | Clears the owned backdrop and retained upload sources. |
| `setBackdropTexture(texture, rows)` | Uses a caller-owned, output-sized texture as the backdrop. |
| `markBackdropDirty()` | Marks the backdrop texture as changed. |
| `setStacking(mode)` | Chooses `STACKING_EXACT` or `STACKING_FLAT`. |
| `setEnvironment(bits)`, `getEnvironment()` | Sets or reads environment bits. The low-level API leaves media-query tracking to your app. |
| `setLightAngle(radians)` | Rotates all rim lights. |
| `setExtendedRange(on, headroom)` | Configures extended range and returns whether it is active. Requires a context created with `alpha: true` and browser output support. |
| `setDisplayBrightness(state)` | Resolves supplied brightness state using the same Float32 calculation as `Glass.setDisplayBrightness()`. Returns `Result<number>` and keeps the selected output range and surface coefficients. |
| `setSurfaceScale(contextScale, factor, stateFactor = 1)` | Supplies explicit context/surface color coefficients and an optional nonnegative state multiplier. Returns `Result<boolean>` and leaves display-headroom selection to the caller. Identity coefficients are the default. |

| Shape method | Result and behavior |
| --- | --- |
| `addShape(x, y, w, height, r, corner, scheme)` | Adds a shape with the standard material and returns a numeric handle. |
| `setShape(h, x, y, w, height, r)` | Changes position and size; resets all corners to the single radius. |
| `setCorners(h, topLeft, topRight, bottomRight, bottomLeft)` | Sets four individual corner radii. |
| `setCorner(h, corner)` | Changes the corner construction. |
| `addMask(source, x, y, w, height, scheme)` | Adds a mask shape and returns its handle as `Result<number>`. |
| `setMask(h, source)` | Replaces the mask of a shape created with a mask. |
| `raise(h)` | Draws this glass last, above other shapes. |
| `removeShape(h)` | Removes it immediately. The old handle will not refer to a subsequently added shape. |
| `isAlive(h)` | Returns `true` if the handle is valid. |

| Material and state method | Result and behavior |
| --- | --- |
| `setStandard(h, scheme)`, `setClear(h, scheme)` | Applies the standard or clear preset. |
| `setPreset(h, preset, scheme)`, `getPreset(h)` | Sets or reads a preset number. Reading a removed handle returns `-1`. |
| `setTint(h, r, g, b, strength)` | Applies a tint; strength 0 removes it. |
| `setOpacity(h, opacity)` | Sets overall opacity, including the shadow. |
| `setDefaultChromaticAberration(strength)` | Sets the inherited color-separation multiplier (initially `0.25`). |
| `getDefaultChromaticAberration()` | Reads the current default. |
| `setChromaticAberration(h, strength)` | Overrides one shape or group; `null` restores inheritance. |
| `getChromaticAberration(h)` | Reads effective strength, or `-1` for a dead handle. |
| `setVeil(h, level, strength)` | Sets a flat gray veil over the glass. Level 0 is black; 1 is white. |
| `setPresence(h, presence)` | Immediately sets materialization progress: 0 hidden, 1 fully shown. |
| `animatePresence(h, presence)` | Changes presence through a damped spring of about half a second. |
| `getPresence(h)` | Returns current presence from 0 to 1, or `-1` for a removed handle. |
| `setAdaptive(h, enabled)` | Enables or disables backdrop adaptation for supported small presets. |
| `getScheme(h)` | Returns the shown scheme from 0 to 1, including intermediate transition values; `-1` for removed handles. |

| Group method | Result and behavior |
| --- | --- |
| `addUnion(spacing, scheme)` | Creates a group and returns its handle. It becomes visible once it has members. |
| `addMember(h, x, y, w, height, r, corner)` | Returns a member index, or `-1` on failure. |
| `addMemberMask(h, source, x, y, w, height)` | Returns a mask member index as `Result<number>`. |
| `setMember(h, i, x, y, w, height, r)` | Changes the member's frame and resets its corners to a single radius. |
| `setMemberCorners(h, i, topLeft, topRight, bottomRight, bottomLeft)` | Sets four corner radii for a member. |
| `setMemberMask(h, i, source)` | Replaces a mask member's source. |
| `removeMember(h, i)` | Removes a member and moves the last member into its index. Update any stored member indices accordingly. |
| `setSpacing(h, spacing)` | Changes the distance over which outlines merge. |

Low-level groups have the same limit of 16 members, including at most 4 masks. The convenience API's `GroupMember` objects track index changes for you.

If you handle context loss yourself, call `event.preventDefault()` in `webglcontextlost` and pause drawing. In `webglcontextrestored`, check the result of `restore()`, reconnect caller-owned textures and resume drawing. `createGlass()` manages this lifecycle automatically.

## Material calculation and packing

Import these helpers from `glassrender/advanced`; they also remain available through the root `glassrender` entry. Most apps need only `preset`; these helpers expose built-in values for inspection or independent rendering pipelines.

### Preset descriptions and numeric vectors

| API | Result and purpose |
| --- | --- |
| `PRESET_NAMES` | Array of the 28 built-in preset names. |
| `PRESET_COUNT` | The built-in preset count, `28`. |
| `presetNumber(name)` | The preset number, or `-1` for an unknown name. |
| `presetSide(preset)` | Its fixed size-class length, or `0` if it follows the shape's size. |
| `presetFollows(preset, environment)` | Whether this preset supports backdrop adaptation for small glass in the given environment. |
| `surroundings(environment)` | The preset table's environment row for the supplied bits. |
| `presetMaterial(preset, side, scheme, environment = 0, headroom = 0, least = side)` | Creates a `MaterialSpec`. `side` is the largest member's short side; `least` is the smallest short side. `headroom` is a blend share from 0 to 1. |
| `standardMaterial(side, scheme, environment = 0, headroom = 0)` | Creates the standard material description. |
| `clearMaterial(side, scheme, environment = 0, headroom = 0)` | Creates the clear material description. |
| `VECTOR` | Number of values in a material vector. Allocate it with `new Float64Array(VECTOR)`. |
| `presetVector(out, preset, scheme, environment, least, side)` | Writes a material vector into a `Float64Array` and returns its preset table row. |
| `vectorOf(out, spec)` | Converts a `MaterialSpec` into a `Float64Array` vector. Validate separately with `explainMaterial()` first. |
| `explainMaterial(spec)` | Returns the first validation error by field path, including unknown keys, missing required fields, invalid types, list lengths/order and non-finite numbers; `""` on success. |

```ts
import {
    PRESET_NAMES, presetNumber, presetMaterial, presetSide, presetFollows,
    clearMaterial, SCHEME_LIGHT,
} from "glassrender/advanced";

console.log(PRESET_NAMES);
const number = presetNumber("dock");
console.log(presetSide(number)); // 160
console.log(presetFollows(number, 0)); // false
const dock = presetMaterial(number, 64, SCHEME_LIGHT);
const clear = clearMaterial(64, SCHEME_LIGHT);
console.log(dock.blur, clear.refraction);
```

Descriptions are snapshots for the specified context. Rendering accepts only a preset name or number and resolves it again as the context changes. Check names when `presetNumber()` returns `-1`.

### Packing GPU inputs

`MATERIAL_LAYOUT` is exported by `glassrender/advanced`. It records `version = 2`, `floats = 200`, `infoFloats = 6` and the named metadata offsets `shadowSpread`, `maxBlur`, `margin`, `backdropScale`, `shadowX` and `shadowY`. This is the renderer's GPU block layout. The same entry exposes `MATERIAL_FLOATS`, `BLOCK_FLOATS`, `ROW_TINT` and `ROW_RIM_ALPHA` for integrations that need numeric offsets.

The material portion stays at 200 floats. The full renderer block uses `BLOCK_FLOATS = 276`: material values, shape data and 36 grid-coordinate values. Grid coordinates are uploaded with the shape's existing buffer updates. Use the exported size constants when allocating a full renderer block.

Packing functions write a GPU material block and metadata into arrays. `o` and `io` are **element offsets, not byte offsets**. In this version, a material block uses 200 `Float32` values and its metadata uses 6. The renderer manages additional geometry data, such as shape position, outside that material block.

| API | Behavior |
| --- | --- |
| `packMaterial(out, o, info, io, spec, presence = 1, share = 0, scale = 2)` | Packs a description and returns feature bits, or `-1` if a checked array length or converted value is invalid. |
| `packPreset(out, o, info, io, preset, side, least, mix, presence, environment = 0, headroom = 0, scale = 2)` | Packs a size-dependent preset. `mix` 0 is dark, 1 is light. |
| `packParams(out, o, info, io, vector, presence, share, scale, estimate)` | Packs an already calculated vector. `estimate: true` estimates backdrop resolution from blur. |
| `packTint(out, o, r, g, b, strength, mix)` | Writes the tint area of the same block and returns the tint feature bit, or `0`. |

`presence` is materialization progress from 0 to 1. `share` and material `headroom` are extended-range blend shares from 0 to 1. `scale` is device pixels per point.

The six `info` values are, in order: shadow spread beyond the outline, largest backdrop-lookup blur radius, capture margin, backdrop texels per device pixel, and shadow x and y offsets. Distances and offsets are in points, with positive y downward.

```ts
import {
    packMaterial, packTint, standardMaterial, SCHEME_LIGHT,
    VECTOR, vectorOf, packParams, packPreset, PRESET_STANDARD,
} from "glassrender/advanced";

const block = new Float32Array(200);
const info = new Float32Array(6);
const spec = standardMaterial(160, SCHEME_LIGHT);

let features = packMaterial(block, 0, info, 0, spec);
if (features < 0) throw new Error("Could not pack the material.");
// Clear the optional color layer to retain the unmodified built-in profile.
features |= packTint(block, 0, 0, 0, 0, 0, SCHEME_LIGHT);
console.log({ features, margin: info[2], backdropScale: info[3] });

// Calculate a vector first. These calls overwrite the material and metadata.
const vector = new Float64Array(VECTOR);
vectorOf(vector, spec);
packParams(block, 0, info, 0, vector, 1, 0, 2, false);

// Or pack the preset directly.
packPreset(block, 0, info, 0, PRESET_STANDARD, 160, 160, SCHEME_LIGHT, 1);
```

`packMaterial()`, `packParams()` and `packPreset()` leave the tint area untouched. Use `packTint()` to set the desired tint, or pass strength 0 to clear a previous one. Use `explainMaterial()` for description validation; packing helpers do not apply overrides to the renderer.

### Calculating resolution and backdrop regions

| API | Return value or output |
| --- | --- |
| `estimateScale(blur, fill, faceFill, fillShare, pixelLength)` | Chooses backdrop texels per device pixel based on blur. `blur` and `fill` are actual lookup blur radii; `pixelLength` is points per device pixel. |
| `extentFactor(opacity)` | Converts opacity into a capture-margin factor: 0 at or below 0.005, about 1.7 at 1. |
| `blurRegion(out, o, w, h, x, y, r0, r1, scale, six)` | Writes 7 values into an `Int32Array`: level count, alignment, region x, y, width, height, and starting level. Input dimensions and radii are in texels. |
| `backdropRegion(out, o, x, y, w, h, margin, scale, texel, r0, r1, backdropScale, six, width, height, maxLevels)` | Writes 10 values into an `Int32Array`: capture x, y, width, height; pyramid-region x, y, width, height; level count and starting level. |

For `blurRegion`, `scale` means backdrop texels per device pixel. `six` selects six stable levels for a material with blur fill.

For `backdropRegion`, shape dimensions and margin are in points, `scale` is device pixels per point, and `texel` is device pixels per texel. Supply `r0` and `r1` as the actual minimum and maximum lookup blur radii in points. `width` and `height` are output dimensions in device pixels. Its output uses **texel coordinates from the bottom-left, with y increasing upward**, unlike the convenience API's shape coordinates.

```ts
import { estimateScale, extentFactor, blurRegion, backdropRegion } from "glassrender/advanced";

const captureScale = estimateScale(12, 8, 0.1, 0.5, 0.5);
console.log(captureScale, extentFactor(1));

const blur = new Int32Array(7);
blurRegion(blur, 0, 192, 128, 0, 0, 0, 12, 0.25, true);
console.log("Blur region:", [...blur]);

const region = new Int32Array(10);
backdropRegion(
    region, 0,
    40, 40, 320, 160, 32, // Position, dimensions and margin in points.
    2, 4,                 // Device pixels per point and per texel.
    0, 12, 0.25, true,    // Lookup radii, backdrop scale and blur fill.
    1600, 1000, 8,        // Output device-pixel dimensions and maximum levels.
);
console.log("Backdrop capture and pyramid:", [...region]);
```

### Adaptation and color matrices

| API | Purpose |
| --- | --- |
| `ADAPTIVE_SIDE` | Maximum short-side length for backdrop adaptation: `64`. |
| `luminanceLevel(y)` | Quantizes mean luminance from 0 to 1 into the levels used by adaptive glass. |
| `adaptScheme(level, scheme)` | Chooses shown scheme 0 or 1 from the luminance level and surrounding scheme. |
| `adapts(environment)` | Whether the environment permits adaptation. Check the preset's support with `presetFollows()`. |
| `headroomShare(headroom)` | Converts a brightness multiplier to a blend share: 0 at 1, 1 at 1.2 and above. |
| `limitOf(white)` | Derives the output limit from face white; returns 1 for inputs at or below 1. |
| `yccMatrix(out, o, white, black, saturation, r, g, b, a)` | Writes a 4×5 color matrix for luminance, saturation and an overlaid fill. |
| `vibrantMatrix(out, o, white, black, saturation, fr, fg, fb, fa, dr, dg, db, da)` | Adds fill and color dodge, rounding the matrix to four decimal places. |

Color matrices use 20 values in a row-major `Float64Array`. Each row holds four input RGBA coefficients and one constant. For both matrix functions, `o` is an element offset; `f*` and `d*` denote fill and dodge RGBA channels, respectively.

```ts
import {
    luminanceLevel, adaptScheme, headroomShare,
    yccMatrix, vibrantMatrix, standardMaterial, SCHEME_DARK,
} from "glassrender/advanced";

const level = luminanceLevel(0.95);
console.log(adaptScheme(level, SCHEME_DARK)); // 1: light glass over a bright backdrop.
console.log(headroomShare(2)); // 1

const matrix = new Float64Array(20);
const material = standardMaterial(160, SCHEME_DARK);
const face = material.face, key = material.rim?.key;
if (!face || !key) throw new Error("The standard profile must contain face and rim effects.");
const fill = face.fill ?? [0, 0, 0, 0];
yccMatrix(matrix, 0, face.white ?? 1, face.black ?? 0, face.saturation ?? 1, fill[0], fill[1], fill[2], fill[3]);
console.log("Color transform:", [...matrix]);
const rimFill = key.fill ?? [0, 0, 0, 0], dodge = key.dodge ?? [0, 0, 0, 0];
vibrantMatrix(matrix, 0, key.white ?? 1, key.black ?? 0, key.saturation ?? 1,
    rimFill[0], rimFill[1], rimFill[2], rimFill[3], dodge[0], dodge[1], dodge[2], dodge[3]);
console.log("Vibrant rim transform:", [...matrix]);
```

### All MaterialSpec fields

Material distances use points, which correspond to CSS pixels in the core API. `EdgeShadeSpec.height` and `offset` are exceptions: they use device pixels. Descriptions are numerical snapshots for inspection; they are not accepted as runtime material overrides. Defaults below are numeric-packing fallbacks, not universal values shared by the built-in presets. A snapshot contains the values resolved for its own preset and context.

| Field | Type | Purpose |
| --- | --- | --- |
| `backdropScale` | `number` | Backdrop texels per device pixel. Default 0.25; use 0.125, 0.25, 1/3, 0.5 or 1. |
| `blur` | `BlurSpec` | Backdrop blur that varies with distance from the outline. |
| `blurFill` | `BlurFillSpec` | A separately blurred, undisplaced backdrop lookup mixed into the face. |
| `refraction` | `RefractionSpec` | Displaces backdrop samples inside the glass and near the outer rim. |
| `face` | `FaceSpec` | Face brightness, saturation, fill color and maximum luminance. |
| `bleed` | `BleedSpec` | Mixes wide-blur backdrop color in from the rim. |
| `shadow` | `ShadowSpec` | A shadow outside the glass. |
| `ringShadow` | `RingShadowSpec` | A blurred black stroke inside the shape. |
| `edgeShade` | `EdgeShadeSpec` | Two opposing lobes that darken or lighten a thin rim band. |
| `rim` | `RimSpec` | A key light and an opposite fill light. |
| `aberration` | `AberrationSpec` | Separates red and blue in the face lookup to create color fringes. |
| `lens` | `LensLayerSpec` | A lens layer using the unblurred backdrop with color fringes. |
| `hold` | `HoldSpec` | Holds color just inside the rim in standard-range output. |
| `limit` | `number` | Output channel limit. Defaults to a value derived from face white; 0 disables it. |
| `keepHue` | `boolean` | Scales channels together to the limit rather than clamping them individually. |
| `roundness` | `number` | 0 uses corner normals; 1 uses the shape's ellipse direction. Defaults to 0.5 with bleed, otherwise 0. |
| `headroom` | `number` | Legacy extended-range share from 0 to 1. |
| `rangeShare` | `number` | Preferred name for the material share; takes precedence over `headroom`. |
| `margin` | `number` | Backdrop capture margin beyond the outline. Defaults to the reach of the material's lookups. |

### Tone and blur fields

| Type | Fields and defaults |
| --- | --- |
| `ToneSpec` | `white = 1`, `black = 0`, `saturation = 1`, `fill?: Rgba`. Output levels at the bright and dark ends, chroma gain and an overlaid fill color. |
| `BlurSpec` | Required `radius`; `opacities = [1, 1, 1, 1]`, `distances = [0, 0, 0, 0]`. Blur weights at four distances. Distances must be non-decreasing; negative values are inside the outline. |
| `BlurFillSpec` | Required `radius`; `darken = 0`, `lighten = 0`, `normal = 0`. Shares of the darker value, the lighter value or the fill itself mixed with the face. |
| `FaceSpec` | The `ToneSpec` fields plus `opacity = 1`, `maxLuminance = 1`, `maxLuminanceStandard = maxLuminance`. Controls tone-transform strength and the level white is reduced to in extended and standard range. |

`blur.radius`, `blurFill.radius`, `bleed.radius` and `shadow.blur` are twice the radius used by the actual backdrop lookup. `shadow.radius` instead controls how far the shape's shadow spreads.

### Refraction and bleed fields

| Type | Fields and defaults |
| --- | --- |
| `LensSpec` | Required `amount`, `height`. Displacement at the rim and the depth over which it falls to zero. Negative displacement samples farther inside, producing magnification. A height of 0 leaves the lookup in place. |
| `RefractionSpec` | `inner?: LensSpec`, `outer?: LensSpec`, `outerOpacity = 0`, `outerDistances = [-1, 0]`. The outer lens and its opacity together determine whether outer refraction is visible. |
| `BleedSpec` | Required `opacity`, `amount`, `height`, `radius`; the `ToneSpec` color fields, `distances = [1, 0]`, `darken = false`. `darken: true` gives brighter face areas more weight. |
| `AberrationSpec` | Required `amount`; `angle = 0`, `height = 0`, `offset = 0`. Separation, direction, falloff depth and depth of the band at full separation. |
| `LensLayerSpec` | Required `amount`; `angle = 0`, `height = 0`, `inset = 0`, `distances = [-1, 0]`, `opacities = [1, 0]`. Color separation and fade toward the boundary for a separate lens layer. |
| `HoldSpec` | Required `start`, `end`, `white`. The interval and white level for the holding tone. |

### Shadow and lighting fields

| Type | Fields and defaults |
| --- | --- |
| `ShadowSpec` | Required `opacity`, `radius`; the `ToneSpec` color fields, `offsetX = 0`, `offsetY = 0`, `amount = 0`, `height = 0`, `inset = 0`, `blur = 0`, `backdropMix = 0`. `backdropMix` is the share of shadow color taken from the backdrop. |
| `RingShadowSpec` | Required `opacity`, `radius`, `width`, `offset`; `mask = 1`. Blur radius, stroke width and downward offset. |
| `EdgeShadeSpec` | Required `amount`, `bias`, `height`, `spread`; `angle = Math.PI / 2`, `offset = 0`, `spreadStandard = spread`. `amount` is a brightness bias between 0 and 1, with 0.5 linear. The sign of `bias` determines darkening or lightening. |
| `LightSpec` | Required `height`, `spread`; the `ToneSpec` fields, `opacity = 1`, `amount = 0.5`, `curvature = 0`, `dodge?: Rgba`. Band width, arc half-width and color. A curvature of 1 fades linearly across the band. |
| `RimSpec` | Required `key: LightSpec`, `fill: LightSpec`; `angle = 0`, `inset = 0`, `diffuse?: { amount, height, spread }`. The diffuse values multiply each light's strength, height and spread to produce a wider band. |

Array lengths are 4 for `blur.opacities` and `blur.distances`; 2 for `refraction.outerDistances`, `bleed.distances`, `lens.distances` and `lens.opacities`; 4 for RGBA colors. Non-finite numbers such as `NaN` and infinity are rejected. Use `explainMaterial()` before packing an inspected description. For this renderer, select a `preset` and check the item's `error` if that selection is rejected.

## Constants and TypeScript types

The convenience API uses string settings. The low-level API uses these numeric constants.

| Constant | Value | Type or meaning |
| --- | --- | --- |
| `SCHEME_DARK`, `SCHEME_LIGHT` | `0`, `1` | `Scheme` |
| `CORNER_CIRCULAR`, `CORNER_SMOOTH` | `0`, `1` | `CornerKind` |
| `ROWS_BOTTOM_UP`, `ROWS_TOP_DOWN` | `0`, `1` | `RowOrder` |
| `STACKING_FLAT`, `STACKING_EXACT` | `0`, `1` | `Stacking` |
| `ENV_INACTIVE` | `1` | Inactive window |
| `ENV_TINTED` | `2` | More opaque, more saturated glass |
| `ENV_REDUCE_TRANSPARENCY` | `4` | Reduced transparency |
| `ENV_INCREASE_CONTRAST` | `8` | Increased contrast |
| `ENV_REDUCE_MOTION` | `16` | Reduced motion |
| `ENV_BUTTON_SHAPES` | `32` | Button outlines |

Combine environment bits with bitwise OR, for example `renderer.setEnvironment(ENV_INACTIVE | ENV_INCREASE_CONTRAST)`. The default active environment is `0`. All preset-number constants appear in the preset list above.

Convenience option types are exported by `glassrender/core`. `Preset` is also exported by `glassrender/materials`, while numeric material types are exported by `glassrender/advanced` and the root entry. Use `import type` to avoid runtime imports.

| Type | Meaning |
| --- | --- |
| `GlassOptions`, `EnvironmentOptions` | Initial canvas and environment settings. |
| `FrameOptions` | Required position and dimensions, plus optional radius and corner kind. |
| `MaterialOptions` | Preset, tint and visibility options shared by shapes and groups. |
| `ShapeOptions`, `ShapeUpdate` | Shape creation options and partial updates. |
| `GroupOptions`, `GroupUpdate` | Group creation options and partial updates. |
| `MemberOptions`, `MemberUpdate` | Member creation options and supported geometry or mask updates. |
| `MaterialSpec` | A complete material description, from blur to lighting. |
| `Rgb`, `Rgba` | Readonly tuples of 3 or 4 color channels. |
| `Appearance` | `"dark"`, `"light"` or `"auto"`. |
| `ShownScheme` | The displayed `"dark"` or `"light"` scheme. |
| `Preset` | One of the 28 built-in preset names. |
| `CornerStyle` | `"smooth"` or `"circular"`. |
| `Radius` | One number or a readonly tuple of four radii. |
| `Transition` | `"materialize"` or `"none"`. |
| `Fit` | `"cover"`, `"contain"` or `"stretch"`. |
| `StackingMode` | `"exact"` or `"flat"`. |
| `Follow` | `boolean` or `"auto"`. |
| `Foreground` | CSS color strings for `text` and `title`. |
| `Ok<T>`, `Err`, `Result<T>` | Success and failure result types. |

`BlurSpec`, `BlurFillSpec`, `LensSpec`, `RefractionSpec`, `ToneSpec`, `FaceSpec`, `BleedSpec`, `ShadowSpec`, `RingShadowSpec`, `EdgeShadeSpec`, `LightSpec`, `RimSpec`, `AberrationSpec`, `LensLayerSpec` and `HoldSpec` describe the individual material effects explained above. The advanced and root entries export the runtime classes `Glass`, `GlassItem`, `GlassShape`, `GlassGroup`, `GroupMember` and `Renderer`; the core entry exposes convenience classes as types. Material metadata types such as `MaterialInfo` come from `glassrender/materials`.

```ts
import type { ShapeOptions } from "glassrender/core";
import type { Preset } from "glassrender/materials";

const preset: Preset = "standard";
const options: ShapeOptions = {
    x: 40, y: 40, width: 320, height: 160, radius: 24,
    preset,
};
glass.add(options);
```

## Troubleshooting

| Symptom | What to check |
| --- | --- |
| `WebGL2 is not available` | Check the `Result` from `createGlass()`. The browser must be able to create a WebGL2 context. |
| An old recipe or `prominent` name fails | Select a built-in `preset`; see the migration section. Check `shape.error`. |
| The glass effect is barely visible | Blur and refraction are harder to see over a solid color. Supply a backdrop with lines or varied colors, like the quick-start example. |
| CSS backgrounds or HTML do not show through the glass | Supply an image, canvas or video of that scene as the backdrop. DOM content is not captured automatically. |
| Glass is missing inside a container | With `fixed: false`, check the container's actual width and height. An opaque DOM background can also cover the glass. |
| The shape is rounder than expected | The default radius is half the short side. Set `radius` explicitly. |
| Glass is misaligned with its element | Use `follow()` or a framework adapter. For CSS movement animations, set `everyFrame: true`; React, Svelte, Vue and Solid support changing this prop after attachment. |
| A mask does not work | Check that the mask was supplied at creation, float render targets are supported, and inspect `shape.error` or a `null` result from `group.add()`. |
| No more members can be added | A group holds at most 16 members, including at most 4 masks. Also check whether the group was removed. |
| Small glass does not follow backdrop brightness | Check preset support, a short side up to 64, `adaptive` and environment settings. |
| Video or canvas updates do not appear | Check `live: true`. With `Renderer`, manage uploads or dirty notifications and frame requests yourself. |
| Removing a backdrop | `setBackdrop(null)`, `clearBackdrop()` and the component canvas's `backdrop={null}` remove uploaded pixels and retained sources. |
| Text remains when the glass is hidden | `visible` controls the glass effect. Manage DOM visibility in your app. |
| Many overlapping shapes are slow | `stacking: "flat"` reduces overlap work by making each shape read the original backdrop. Adjust output resolution with `maxPixelRatio`. |
| Direct renderer changes do not appear | After changing `glass.renderer`, call `glass.update()`. With a standalone `Renderer`, schedule a render frame. |
| Extended range stays disabled | Check the initial creation option and browser output support, and read the actual return value. |

The public surface is defined by the [core exports](src/index.ts), options and defaults by the [option types](src/glass/types.ts), and low-level methods by [Renderer](src/renderer/renderer.ts). Existing runnable examples and installation commands are in the [README](README.md).
