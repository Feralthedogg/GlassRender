// Built-in materials: names, catalog metadata and the packed rows the renderer draws with.
import assert from "node:assert/strict";
import { test } from "node:test";
import { MATERIALS, getMaterialInfo, PRESET_COUNT, PRESET_NAMES, presetNumber } from "../dist/materials.js";
import { packPreset, PRESET_STANDARD, PRESET_CLEAR, SCHEME_DARK, SCHEME_LIGHT, STACKING_EXACT, STACKING_FLAT, STACKING_OVERLAP } from "../dist/advanced.js";

test("the catalog lists every preset once, by number, with its shared profile", () => {
    assert.equal(PRESET_COUNT, 28);
    assert.equal(MATERIALS.length, PRESET_COUNT);
    assert.equal(new Set(PRESET_NAMES).size, PRESET_COUNT, "unique names");
    for (let i = 0; i < PRESET_COUNT; i++) {
        const info = MATERIALS[i], name = PRESET_NAMES[i];
        assert.equal(info.name, name);
        assert.equal(presetNumber(name), i);
        assert.equal(getMaterialInfo(name), info);
        assert.ok(PRESET_NAMES.includes(info.canonical), name + " canonical");
        for (const alias of info.aliases) assert.equal(getMaterialInfo(alias).canonical, info.canonical, name + " alias " + alias);
        assert.ok(Object.isFrozen(info), name + " frozen");
    }
    assert.equal(getMaterialInfo("player").canonical, "clear");
    assert.equal(getMaterialInfo("prominent"), null, "removed names are unknown");
    assert.equal(getMaterialInfo("toString"), null, "object keys are not names");
    assert.equal(presetNumber("nothing"), -1);
});

test("packing a preset repeats exactly and follows its scheme and size", () => {
    const pack = (preset, side, mix) => {
        const block = new Float32Array(276), info = new Float32Array(24);
        const flags = packPreset(block, 0, info, 0, preset, side, side, mix, 1);
        return { flags, rows: Array.from(block.subarray(0, 200)), info: Array.from(info.subarray(0, 6)) };
    };
    for (const preset of [PRESET_STANDARD, PRESET_CLEAR]) for (const side of [44, 160, 400]) {
        const first = pack(preset, side, SCHEME_DARK), again = pack(preset, side, SCHEME_DARK);
        assert.deepEqual(again, first, "a repeated pack (from the cache) equals the first");
        assert.ok(first.rows.every(Number.isFinite), "finite rows");
    }
    for (const side of [44, 160, 400]) assert.notDeepEqual(pack(PRESET_STANDARD, side, SCHEME_LIGHT).rows, pack(PRESET_STANDARD, side, SCHEME_DARK).rows, "light standard glass differs from dark at " + side);
    assert.notDeepEqual(pack(PRESET_STANDARD, 44, 0).rows, pack(PRESET_STANDARD, 400, 0).rows, "size laws");
});

test("stacking modes are numbered for the low-level renderer", () => {
    assert.deepEqual([STACKING_FLAT, STACKING_EXACT, STACKING_OVERLAP], [0, 1, 2]);
});

test("the root entry carries the canvas API, the catalog and the renderer; numeric helpers are in the advanced entry", async () => {
    const root = await import("../dist/index.js"), advanced = await import("../dist/advanced.js"), core = await import("../dist/core.js");
    for (const name of ["createGlass", "createRenderer", "Renderer", "MATERIALS", "getMaterialInfo", "presetNumber", "PRESET_CLEAR", "STACKING_OVERLAP", "ENV_TINTED"]) {
        assert.ok(name in root, "root " + name);
    }
    for (const name of ["packMaterial", "packPreset", "packParams", "presetMaterial", "presetVector", "vectorOf", "VECTOR", "estimateScale", "MATERIAL_LAYOUT"]) {
        assert.equal(name in root, false, "root without " + name);
        assert.ok(name in advanced, "advanced " + name);
    }
    for (const name of Object.keys(root)) assert.ok(name in advanced, "advanced repeats root " + name);
    assert.deepEqual(Object.keys(core).sort(), ["DEFAULT_CHROMATIC_ABERRATION", "createGlass", "resolveDisplayHeadroom"]);
});
