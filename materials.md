# Material profiles

GlassRender provides 28 built-in material presets. Select a `preset`; the renderer resolves its optical values for the shape's size, appearance, environment and visibility. Resolved numeric packets are reused when those inputs repeat.

## Choosing a profile

Use `standard` for a frosted surface, `clear` for transparent glass, and a role such as `control`, `menu`, `sidebar` or `dock` for a specific kind of surface. Some role names share a profile. `glassrender/materials` provides the preset names and frozen catalog metadata.

```js
import { MATERIALS, getMaterialInfo } from "glassrender/materials";

console.log(MATERIALS.map(material => material.name));
console.log(getMaterialInfo("player")?.canonical); // "clear"
```

Leave `tint` unset and `lightAngle` at `0` to use the resolved profile unchanged. An optional RGBA tint supplies a color layer. Geometry and application interactions remain caller inputs.

## Catalog metadata

The catalog exposes public role names, canonical profiles, aliases, categories, descriptions, adaptation and size-class metadata. `name` selects a role and `canonical` identifies its shared profile.

The table contains 28 configurations, two appearance schemes and nine environment combinations. Numeric sizes are resolved using piecewise-linear laws. `presetMaterial()` returns a snapshot for inspection; the renderer selects and resolves profiles itself when their context changes.

## Validation

The independent numeric fixture contains 1,624 samples and 191,632 mapped parameter values. Comparisons use `2e-6 × max(1, abs(referenceValue))` to account for interpolation and Float32 rounding. Passing this comparison does not establish identical pixels for every shape, backdrop or browser.

The development checks cover type checking, initialization, profile selection, masks, groups, backdrop updates, context recovery, accessibility and extended output. Adapter regressions cover child buttons and links, keyboard activation, pointer release and touch cancellation across React, Svelte and Vue.

Image and intermediate-buffer comparisons are separate from functional tests. Mask outlines are reconstructed from raster coverage, so their corners and gradients can differ from a vector outline. Packed distance filtering retains a small precision discrepancy in the verified controls. Extended output also depends on the browser's presentation support and the supplied color-surface configuration.

## Runtime and integration

Profiles are resolved when geometry, appearance, environment or presence changes. Numeric packets are cached. Mask distance, filtering and normal reconstruction run during field rebuilding and reuse the field buffers. Updating a static mask requires an explicit source upload; a changing backdrop uses the live-upload option.

Rounded rectangles draw their grid in one call. Grid coordinates are retained in the per-shape buffer and updated with the geometry, avoiding separate coordinate uploads on each draw.

The retained coverage texture uses one R16F channel. The decoded mask field remains RGBA16F, including masks whose storage boundaries simulate a packed source. The renderer does not add a separate packed field texture to the frame path.

The `glassrender/advanced` entry provides numeric snapshot and packing helpers for inspection or independent rendering integrations. The runtime accepts preset selection. Older `material` overrides and the `prominent` name should be migrated to a built-in profile; check the item's `error` when a selection is rejected.

See the [README](README.md) for runnable examples and the [API guide](api.md) for options, defaults, adapter events and integration methods.
