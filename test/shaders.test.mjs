// Program sources: every program cut or patched from the glass program finds the pieces it is cut at, and a missing
// piece gives a source that fails to compile instead of a program that compiles and draws something else.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
    brokenSource, glassFragment, groupBodyFragment, groupCompositeFragment, groupRimFragment, GROUP_VERTEX, patch, patchAll, rimFragment,
    sdfFillMaskFragment, tintCompositeFragment, tintForegroundFragment
} from "../dist/kernels.js";
import { FEATURE_FADE, FEATURE_FIELD, FEATURE_LIGHTS, FEATURE_RIM_SPLIT, FEATURE_SHARP, FEATURE_TINT, FEATURE_UNEVEN, FEATURE_VEIL, MEMBER_SHIFT } from "../dist/layout.js";

// every feature alone, some materials, and unions of each program size with corners and masks
const KEYS = [0];
for (let bit = 0; bit < 22; bit++) KEYS.push(1 << bit);
KEYS.push(2 | 4 | 32 | 1024 | FEATURE_LIGHTS, 2 | 4 | 32 | 1024 | FEATURE_LIGHTS | FEATURE_TINT, FEATURE_LIGHTS | FEATURE_SHARP);
for (const n of [1, 2, 4, 8, 16]) for (const kind of [0, FEATURE_UNEVEN, FEATURE_FIELD]) KEYS.push((n << MEMBER_SHIFT) | FEATURE_LIGHTS | 32 | kind);

test("every program cut or patched from the glass program finds its pieces", () => {
    let sources = 0;
    const check = (name, source) => { sources++; assert.equal(brokenSource(source), false, name + ": " + source.slice(0, 160)); };
    for (const key of KEYS) for (const edr of [false, true]) for (const hdr of [false, true]) for (const world of [false, true]) {
        check("rim " + key, rimFragment(key, edr, hdr, world));
        check("group rim " + key, groupRimFragment(key, edr, hdr, world));
        check("group body " + key, groupBodyFragment(key, edr, hdr, world));
    }
    for (const key of KEYS) {
        check("fill " + key, sdfFillMaskFragment(key));
        for (const separate of [false, true]) for (const composite of [false, true]) for (const rows of [false, true]) {
            check("tint " + key, tintForegroundFragment(key, separate, composite, rows));
        }
    }
    for (const premultiplied of [false, true]) {
        check("tint composite", tintCompositeFragment(premultiplied));
        check("group composite", groupCompositeFragment(premultiplied));
    }
    check("group vertex", GROUP_VERTEX);
    assert.ok(sources > 1000, "sources checked: " + sources);
});

test("the separate rim program carries its patched arithmetic", () => {
    const rim = rimFragment(FEATURE_LIGHTS);
    assert.ok(rim.includes("float value=floatBoundary(sat(e/fe+.5)*lobe);"), "rim product order");
    for (const axis of ["x", "y", "z"]) assert.ok(rim.includes(`halfFMA4(vec4(r0.${axis},r1.${axis},r2.${axis},r3.${axis}),c.${axis},v)`), "matrix FMA " + axis);
    const split = rimFragment(FEATURE_LIGHTS | FEATURE_RIM_SPLIT);
    assert.ok(split.includes("c=h3(rim(c,") && !split.includes("c=store("), "the split rim keeps half values between its lights");
    const group = groupRimFragment(FEATURE_LIGHTS);
    assert.ok(group.includes("vec4 rim(vec4 destination,float h,"), "group rim keeps the destination alpha");
    assert.ok(group.includes("o=vec4(c.rgb,hf(sat(c.a)));}"), "group rim writes alpha");
});

test("a missing piece gives a source that fails to compile and names the piece", () => {
    const broken = patch("void main(){}", "absent piece;", "x");
    assert.equal(brokenSource(broken), true);
    assert.match(broken, /^#version 300 es\n#error shader piece not found: absent piece;\n$/);
    assert.equal(patch(broken, "void", "x"), broken, "the first missing piece is kept");
    assert.equal(patch("a b a", "a", "c"), "c b a", "patch replaces the first piece");
    assert.equal(patchAll("a b a", "a", "c"), "c b c", "patchAll replaces every piece");
    assert.equal(brokenSource(patchAll("a b a", "d", "c")), true, "patchAll needs at least one piece");
    assert.doesNotMatch(patch("x", "a\"b`c\\d", "y"), /["`\\]/, "the name keeps to the shader character set");
});

test("the press veil and the layer opacity select no program source of their own", () => {
    for (const key of KEYS) {
        const plain = glassFragment(key);
        assert.equal(glassFragment(key | FEATURE_VEIL), plain, "veil " + key);
        assert.equal(glassFragment(key | FEATURE_FADE), plain, "fade " + key);
    }
    assert.ok(glassFragment(0).includes("#define FADE"), "programs apply the layer opacity of the block");
    assert.ok(!glassFragment(0, false, false, false, false, false, false).includes("#define FADE"), "a group layer leaves it to its composite");
});
