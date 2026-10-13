// Functional browser tests of the built package (dist/): the convenience layer against the same scenes made with the
// low-level renderer, materials, groups, masks, surroundings, content colours, the life of handles and of the WebGL
// context, extended range, element following, frame scheduling, program reuse and stacking.
// Run with `npm run test:browser` (headless Chrome), or open test/browser/functional.html in a browser.
import {
    CORNER_CIRCULAR, CORNER_SMOOTH, ENV_BUTTON_SHAPES, ENV_INACTIVE, ENV_INCREASE_CONTRAST, ENV_REDUCE_MOTION, ENV_REDUCE_TRANSPARENCY,
    DEFAULT_CHROMATIC_ABERRATION, ENV_TINTED, PRESET_CONTROL, PRESET_DOCK, PRESET_NAMES, PRESET_SLIDER, SCHEME_DARK, SCHEME_LIGHT,
    STACKING_EXACT, STACKING_FLAT, STACKING_OVERLAP, createGlass, createRenderer, presetMaterial
} from "../../dist/advanced.js";
import { LAST_ERROR } from "../../dist/renderer/shared.js";
import { W, H, RATIO, paint, star, fail, equal, truthy, distance, makeGlass, frameOf, lowFrame, tick } from "./harness.mjs";

const frames = (n) => new Promise((done) => { const f = () => (--n <= 0 ? done() : requestAnimationFrame(f)); requestAnimationFrame(f); });
import { stableMaskSeed } from "./seed.mjs";
import { surfaceState } from "./surface-state.mjs";
import { hdrPixels } from "./hdr-pixels.mjs";
import { backdropRemoval, automaticRadius } from "./prop-updates.mjs";
import { displayBrightness } from "./display-brightness.mjs";
import { hdrDestinationOptics } from "./hdr-destination-optics.mjs";
import { hdrRimRuntime } from "./hdr-rim-runtime.mjs";
import { tintSupportDestination } from "./tint-support-destination.mjs";

export const FUNCTIONAL = {
    "HDR pixel input preserves range, rows, headroom and restoration": () => hdrPixels(truthy,equal,frameOf),
    "null backdrop removes DOM, live and pending sources through context recovery": () => backdropRemoval(truthy,equal,makeGlass,frameOf),
    "radius reset restores automatic shape and member geometry after resize": () => automaticRadius(truthy,equal,makeGlass,frameOf),
    "supplied display brightness resolves headroom and preserves the HDR lifecycle": () => displayBrightness(truthy,equal,makeGlass,frameOf),
    "HDR destination keeps actual mask, union and glass optics coherent during partial redraw": () => hdrDestinationOptics(truthy,equal),
    "separate HDR rim preserves opaque partial redraw, scale, ordering and context lifetime": () => hdrRimRuntime(truthy,equal),
    "HDR RGBA groups preserve quantized opacity, partial redraw and resource lifetime": () => hdrRimRuntime(truthy,equal,true),
    "transparent tint support preserves clear and small-glass destination after moves": () => tintSupportDestination(truthy,equal),
    "chromatic strength changes separation without weakening other material rows": () => {
        const g = makeGlass(), s = g.add({ x: 40, y: 40, width: 193, height: 193, preset: "control",
            adaptive: false, transition: "none", chromaticAberration: 1 });
        const r = g.renderer, slot = s.handle & 0xfffff, offset = slot * r.stride;
        const full = r.blocks.slice(offset, offset + 200), fullFrame = frameOf(g);
        s.set({ chromaticAberration: 0.15 });
        const amount = Math.fround(full[188] * 0.15);
        equal(r.blocks[offset + 188], amount, "scaled lens separation");
        for (let i = 0; i < 200; i++) if (i !== 188) equal(r.blocks[offset + i], full[i], "unmodified material row " + i);
        s.move(55, 60); s.set({ chromaticAberration: 0.4 }); s.set({ chromaticAberration: 0.15 });
        equal(r.blocks[offset + 188], amount, "cache hits do not compound strength");
        s.move(40, 40); s.set({ chromaticAberration: 1 });
        equal(distance(fullFrame, frameOf(g)), 0, "one restores the original profile");
        s.set({ chromaticAberration: 0 });
        equal(r.blocks[offset + 188], 0, "zero displacement");
        truthy((r.feats[slot] & 131072) === 0, "zero removes the lens sampling feature");
        g.destroy();
    },
    "chromatic defaults and shape or group overrides remain independent": () => {
        const g = makeGlass({ chromaticAberration: 0.3 });
        const shape = g.add({ x: 10, y: 10, width: 80, height: 80, preset: "control", transition: "none" });
        const group = g.addGroup({ preset: "loupe", chromaticAberration: 0.8, transition: "none" });
        group.add({ x: 150, y: 50, width: 80, height: 80 });
        equal(shape.chromaticAberration, 0.3, "shape inherits canvas");
        equal(group.chromaticAberration, 0.8, "group overrides canvas");
        g.setChromaticAberration(0.6);
        equal(shape.chromaticAberration, 0.6, "inherited shape follows changes");
        equal(group.chromaticAberration, 0.8, "explicit group remains unchanged");
        shape.set({ chromaticAberration: 0 }); group.set({ chromaticAberration: null });
        equal(shape.chromaticAberration, 0, "explicit zero is retained");
        equal(group.chromaticAberration, 0.6, "null restores inheritance");
        g.setChromaticAberration(0.25);
        equal(shape.chromaticAberration, 0, "zero does not inherit");
        equal(group.chromaticAberration, 0.25, "restored inheritance follows updates");
        g.destroy();
    },
    "chromatic slot state survives growth and resets when a handle is reused": () => {
        const g = makeGlass({ chromaticAberration: 0.27 }), shapes = [];
        for (let i = 0; i < 40; i++) {
            shapes.push(g.add({ x: i * 5, y: 20, width: 48, height: 48, preset: "control", transition: "none" }));
            if (i === 0) shapes[0].set({ chromaticAberration: 0.73 });
        }
        const handle = shapes[0].handle;
        equal(g.renderer.getChromaticAberration(handle), 0.73, "explicit strength survives growth");
        g.setChromaticAberration(0.61);
        equal(shapes[39].chromaticAberration, 0.61, "new slots inherit default");
        shapes[0].remove();
        equal(g.renderer.getChromaticAberration(handle), -1, "dead handle rejected");
        const fresh = g.add({ x: 20, y: 100, width: 48, height: 48, preset: "control", transition: "none" });
        equal(fresh.handle & 0xfffff, handle & 0xfffff, "slot reused");
        equal(fresh.chromaticAberration, 0.61, "reused slot resets to inheritance");
        g.destroy();
    },
    "chromatic values clamp safely and do not add separation to clear profiles": () => {
        const g = makeGlass(), s = g.add({ x: 50, y: 40, width: 120, height: 80, preset: "clear", transition: "none" });
        equal(s.chromaticAberration, DEFAULT_CHROMATIC_ABERRATION, "subtle default");
        const before = frameOf(g);
        s.set({ chromaticAberration: 2 }); equal(s.chromaticAberration, 1, "upper clamp");
        equal(distance(before, frameOf(g)), 0, "clear has no separation to amplify");
        s.set({ chromaticAberration: -1 }); equal(s.chromaticAberration, 0, "lower clamp");
        s.set({ chromaticAberration: NaN }); equal(s.chromaticAberration, DEFAULT_CHROMATIC_ABERRATION, "nonfinite resets default");
        g.destroy();
    },
    "control lenses separate colors from a monochrome backdrop": () => {
        const source = document.createElement("canvas");
        source.width = W * RATIO; source.height = H * RATIO;
        const context = source.getContext("2d");
        context.fillStyle = "#181818"; context.fillRect(0, 0, source.width, source.height);
        context.fillStyle = "#ededed";
        for (let x = 0; x < source.width; x += 48) context.fillRect(x, 0, 16, source.height);
        const spreads = {};
        for (const preset of ["clear", "control"]) {
            const glass = makeGlass({ stacking: "flat" }, source);
            glass.add({ x: 220, y: 100, width: 193, height: 193, preset, adaptive: false, transition: "none" });
            const pixels = frameOf(glass);
            let spread = 0;
            for (let i = 0; i < pixels.length; i += 4) {
                spread = Math.max(spread, Math.max(pixels[i], pixels[i + 1], pixels[i + 2]) - Math.min(pixels[i], pixels[i + 1], pixels[i + 2]));
            }
            spreads[preset] = spread; glass.destroy();
        }
        truthy(spreads.clear <= 2, "clear preserves monochrome colors");
        truthy(spreads.control > 20, "control produces visible color separation");
    },
    "rounded lenses preserve backdrop pixels beyond their optical effects": () => {
        for (const preset of ["clear", "control"]) {
            const glass = makeGlass({ stacking: "flat" }), backdrop = frameOf(glass);
            glass.add({ x: 220, y: 100, width: 193, height: 193, radius: 96.5, preset,
                adaptive: false, transition: "none" });
            const pixels = frameOf(glass), width = W * RATIO, centerX = 316.5, centerY = 196.5;
            const reach = preset === "clear" ? 100 : 124;
            let worst = 0;
            for (let y = 0; y < H * RATIO; y++) for (let x = 0; x < width; x++) {
                const dx = (x + .5) / RATIO - centerX, dy = H - (y + .5) / RATIO - centerY;
                if (dx * dx + dy * dy <= reach * reach) continue;
                const at = (y * width + x) * 4;
                for (let channel = 0; channel < 4; channel++) worst = Math.max(worst, Math.abs(pixels[at + channel] - backdrop[at + channel]));
            }
            // The control profile's faint shadow may round to one 8-bit level.
            truthy(worst <= 1, preset + " exterior changed by " + worst + " levels");
            glass.destroy();
        }
    },
    "built-in materials: removed authoring options and unknown names keep the current material": () => {
        const g = makeGlass(), s = g.add({ x: 40, y: 40, width: 300, height: 160, radius: 24, preset: "clear" });
        const before = frameOf(g);
        s.set({ material: { blur: { radius: 100 } } });
        truthy(s.error.includes("removed"), s.error);
        equal(distance(before, frameOf(g)), 0, "authored update ignored");
        s.set({ preset: "prominent" });
        truthy(s.error.includes("unknown"), s.error);
        equal(distance(before, frameOf(g)), 0, "synthetic preset ignored");
        s.set({ preset: "standard" }); equal(s.error, "", "built-in update accepted");
        equal(g.renderer.getPreset(s.handle), 0, "standard"); g.destroy();
    },
    "an update with a rejected preset or mask still applies its other fields": () => {
        const g = makeGlass(), s = g.add({ x: 40, y: 40, width: 300, height: 160, radius: 24, preset: "clear", transition: "none" });
        const before = frameOf(g);
        s.set({ preset: "prominent", opacity: 0.5 });
        truthy(s.error.includes("unknown"), s.error);
        equal(g.renderer.getPreset(s.handle), 1, "the preset stays");
        const faded = frameOf(g);
        truthy(distance(before, faded) > 0, "the opacity of the same update applies");
        s.set({ opacity: 0.5, x: 40 });
        truthy(s.error.includes("unknown"), "an update without a material keeps the report");
        s.set({ mask: star(40), tint: [1, 0, 0, 0.5] });
        truthy(s.error.includes("mask"), s.error);
        truthy(distance(faded, frameOf(g)) > 0, "the tint of the same update applies");
        s.set({ preset: "clear" });
        equal(s.error, "", "an accepted material clears the report");
        g.destroy();
    },
    "a full group reports why it takes no more members": () => {
        const g = makeGlass(), group = g.addGroup({ spacing: 8, transition: "none" });
        for (let i = 0; i < 16; i++) truthy(group.add({ x: 20 + i * 36, y: 40, width: 30, height: 30 }), "member " + i);
        equal(group.error, "", "sixteen members fit");
        equal(group.add({ x: 20, y: 100, width: 30, height: 30 }), null, "the seventeenth is refused");
        truthy(group.error.includes("16"), group.error);
        equal(group.size, 16, "members");
        g.destroy();
    },
    "built-in materials: resizing resolves the same material as a fresh shape": () => {
        const g = makeGlass(), s = g.add({ x: 40, y: 40, width: 120, height: 48, radius: 24, adaptive: false });
        s.set({ width: 300, height: 160 });
        const fresh = makeGlass(); fresh.add({ x: 40, y: 40, width: 300, height: 160, radius: 24, adaptive: false });
        equal(distance(frameOf(g), frameOf(fresh)), 0, "resized material"); g.destroy(); fresh.destroy();
    },
    "named options draw what the low-level calls draw": () => {
        const glass = makeGlass();
        glass.add({ x: 40, y: 40, width: 300, height: 180, radius: 28 });
        glass.add({ x: 380, y: 60, width: 90, height: 90, preset: "clear" });
        glass.add({ x: 60, y: 260, width: 220, height: 60, appearance: "light", tint: [0.1, 0.8, 0.3, 0.35] });
        glass.add({ x: 330, y: 220, width: 240, height: 150, radius: [60, 12, 40, 0], corner: "circular", opacity: 0.6 });
        glass.add({ x: 500, y: 40, width: 44, height: 44, pressed: true });
        const a = frameOf(glass);
        glass.destroy();
        const b = lowFrame((r) => {
            r.addShape(40, 40, 300, 180, 28, CORNER_SMOOTH, SCHEME_DARK);
            r.setClear(r.addShape(380, 60, 90, 90, 45, CORNER_SMOOTH, SCHEME_DARK), SCHEME_DARK);
            r.setTint(r.addShape(60, 260, 220, 60, 30, CORNER_SMOOTH, SCHEME_LIGHT), 0.1, 0.8, 0.3, 0.35);
            const s = r.addShape(330, 220, 240, 150, 0, CORNER_CIRCULAR, SCHEME_DARK);
            r.setCorners(s, 60, 12, 40, 0); r.setOpacity(s, 0.6);
            r.setVeil(r.addShape(500, 40, 44, 44, 22, CORNER_SMOOTH, SCHEME_DARK), 1, 0.08);
        });
        equal(distance(a, b), 0, "pixels");
    },
    "groups: members with one radius, four radii and a mask": () => {
        const glass = makeGlass();
        const group = glass.addGroup({ spacing: 24 });
        group.add({ x: 60, y: 60, width: 200, height: 120, radius: [50, 10, 30, 0] });
        group.add({ x: 280, y: 80, width: 120, height: 90, radius: 30 });
        truthy(group.add({ x: 90, y: 200, width: 120, height: 120, mask: star(120) }), "mask member: " + group.error);
        equal(group.size, 3, "members");
        const a = frameOf(glass);
        glass.destroy();
        const b = lowFrame((r) => {
            const u = r.addUnion(24, SCHEME_DARK);
            r.setMemberCorners(u, r.addMember(u, 60, 60, 200, 120, 0, CORNER_SMOOTH), 50, 10, 30, 0);
            r.addMember(u, 280, 80, 120, 90, 30, CORNER_SMOOTH);
            truthy(r.addMemberMask(u, star(120), 90, 200, 120, 120).ok, "low-level mask member");
        });
        equal(distance(a, b), 0, "pixels");
    },
    "a mask shape, moved after it was made": () => {
        const glass = makeGlass();
        const s = glass.add({ x: 20, y: 20, width: 200, height: 200, mask: star(200) });
        equal(s.error, "", "mask accepted");
        s.move(220, 110);
        const a = frameOf(glass);
        const plain = glass.add({ x: 10, y: 10, width: 50, height: 50 });
        plain.set({ mask: star(50) });
        truthy(plain.error !== "", "a shape made without a mask refuses one");
        glass.destroy();
        const b = lowFrame((r) => truthy(r.addMask(star(200), 220, 110, 200, 200, SCHEME_DARK).ok, "low-level mask"));
        equal(distance(a, b), 0, "pixels");
    },
    "surroundings: options become bits, later changes too, and the pixels follow": () => {
        const glass = makeGlass({ environment: { increaseContrast: true, tinted: true, active: false } });
        equal(glass.environment, ENV_INACTIVE | ENV_TINTED | ENV_INCREASE_CONTRAST, "bits at creation");
        equal(glass.renderer.getEnvironment(), glass.environment, "the renderer has them");
        glass.setEnvironment({ active: true, tinted: false });
        equal(glass.environment, ENV_INCREASE_CONTRAST, "fields left out keep their value");
        glass.add({ x: 60, y: 60, width: 320, height: 200, radius: 32 });
        glass.add({ x: 420, y: 100, width: 50, height: 50 });
        const a = frameOf(glass);
        glass.setEnvironment({ increaseContrast: false, reduceTransparency: true });
        equal(glass.environment, ENV_REDUCE_TRANSPARENCY, "another setting");
        const c = frameOf(glass);
        glass.setEnvironment({ reduceTransparency: false, reduceMotion: true });
        equal(glass.environment, ENV_REDUCE_MOTION, "reduce motion");
        const m = frameOf(glass);
        glass.destroy();
        const shapes = (r) => { r.addShape(60, 60, 320, 200, 32, CORNER_SMOOTH, SCHEME_DARK); r.addShape(420, 100, 50, 50, 25, CORNER_SMOOTH, SCHEME_DARK); };
        equal(distance(a, lowFrame((r) => { r.setEnvironment(ENV_INCREASE_CONTRAST); shapes(r); })), 0, "increase contrast");
        equal(distance(c, lowFrame((r) => { shapes(r); r.setEnvironment(ENV_REDUCE_TRANSPARENCY); })), 0, "reduce transparency");
        equal(distance(m, lowFrame((r) => { shapes(r); r.setEnvironment(ENV_REDUCE_MOTION); })), 0, "reduce motion");
        truthy(distance(m, lowFrame(shapes)) > 10, "reduce motion looks different from the default");
        truthy(distance(a, c) > 10, "the two settings look different");
    },
    "button shapes: an option and a bit, drawn as the low-level call draws it": () => {
        const glass = makeGlass({ environment: { buttonShapes: true } });
        equal(glass.environment, ENV_BUTTON_SHAPES, "bit");
        glass.add({ x: 60, y: 60, width: 320, height: 200, radius: 32 });
        const a = frameOf(glass);
        glass.destroy();
        equal(distance(a, lowFrame((r) => { r.setEnvironment(ENV_BUTTON_SHAPES); r.addShape(60, 60, 320, 200, 32, CORNER_SMOOTH, SCHEME_DARK); })), 0, "pixels");
        truthy(distance(a, lowFrame((r) => r.addShape(60, 60, 320, 200, 32, CORNER_SMOOTH, SCHEME_DARK))) > 3, "differs from the default rim");
    },
    "the control lens draws colour fringes: red and blue part where the backdrop has an edge": () => {
        const glass = makeGlass();
        glass.add({ x: 200, y: 120, width: 120, height: 120, preset: "control" });
        const a = frameOf(glass);
        glass.destroy();
        equal(distance(a, lowFrame((r) => r.setPreset(r.addShape(200, 120, 120, 120, 60, CORNER_SMOOTH, SCHEME_DARK), PRESET_CONTROL, SCHEME_DARK))), 0, "pixels");
        // inside the lens the red and blue channels no longer move together with green (they are read from both sides)
        const plain = lowFrame((r) => r.setClear(r.addShape(200, 120, 120, 120, 60, CORNER_SMOOTH, SCHEME_DARK), SCHEME_DARK));
        truthy(distance(a, plain) > 3, "the lens layer shows");
    },
    "auto surroundings follow the device (nothing is set on a test machine)": () => {
        const glass = makeGlass({ environment: { reduceTransparency: "auto", increaseContrast: "auto", reduceMotion: "auto", active: true } });
        const want = (matchMedia("(prefers-reduced-transparency: reduce)").matches ? ENV_REDUCE_TRANSPARENCY : 0)
            | (matchMedia("(prefers-contrast: more)").matches ? ENV_INCREASE_CONTRAST : 0)
            | (matchMedia("(prefers-reduced-motion: reduce)").matches ? ENV_REDUCE_MOTION : 0);
        equal(glass.environment, want, "bits");
        glass.setEnvironment({ active: "auto" });
        equal((glass.environment & ENV_INACTIVE) !== 0, !document.hasFocus(), "activity follows the focus of the page");
        glass.destroy();
    },
    "presets by name: every material of the table draws, identity leaves the backdrop, the player is clear glass": () => {
        const frame = (preset, environment = {}) => {
            const glass = makeGlass({ environment });
            glass.add({ x: 40, y: 40, width: 300, height: 180, radius: 28, preset });
            glass.add({ x: 380, y: 60, width: 90, height: 90, preset });
            glass.add({ x: 420, y: 250, width: 50, height: 50, preset });
            const group = glass.addGroup({ spacing: 20, preset });
            group.add({ x: 60, y: 260, width: 120, height: 80, radius: 24 });
            group.add({ x: 170, y: 280, width: 44, height: 44 });
            const px = frameOf(glass);
            glass.destroy();
            return px;
        };
        const standard = frame("standard"), none = lowFrame(() => {});
        equal(distance(frame("identity"), none), 0, "identity");
        truthy(distance(frame("player"), frame("clear")) <= 1, "the player is clear glass");
        truthy(distance(frame("player", { active: false }), frame("clear", { active: false })) <= 1, "the player in an inactive window");
        equal(distance(frame("no such preset"), standard), 0, "an unknown name is the standard material");
        // a preset whose description differs from the standard one at these sizes draws differently (the menu, for one, is
        // standard glass until its window stops being the active one)
        const text = (i) => JSON.stringify([180, 90, 80].map((side) => presetMaterial(i, side, SCHEME_DARK)));
        let distinct = 0;
        for (let i = 0; i < PRESET_NAMES.length; i++) {
            const px = frame(PRESET_NAMES[i]);
            if (text(i) === text(0)) continue;
            distinct++;
            truthy(distance(px, standard) > 3, PRESET_NAMES[i] + " differs from standard");
        }
        truthy(distinct >= 12, "distinct presets: " + distinct);
        truthy(distance(frame("menu", { active: false }), frame("standard", { active: false })) > 0, "the menu in an inactive window");
        // by number through the low-level renderer; and a description of a preset is the preset (above the adaptive size)
        const glass = makeGlass();
        glass.add({ x: 40, y: 40, width: 300, height: 180, radius: 28, preset: "dock" });
        glass.add({ x: 380, y: 60, width: 150, height: 90, preset: "slider" });
        const named = frameOf(glass);
        glass.destroy();
        const low = () => lowFrame((r) => {
            const a = r.addShape(40, 40, 300, 180, 28, CORNER_SMOOTH, SCHEME_DARK), b = r.addShape(380, 60, 150, 90, 45, CORNER_SMOOTH, SCHEME_DARK);
            { r.setPreset(a, PRESET_DOCK, SCHEME_DARK); r.setPreset(b, PRESET_SLIDER, SCHEME_DARK); }
        });
        equal(distance(named, low()), 0, "presets by number");
    },
    "small glass adapts to its backdrop unless told not to, and reports the scheme it shows": () => {
        const glass = makeGlass({}, paint(true));
        const seen = [];
        const small = glass.add({ x: 100, y: 100, width: 50, height: 50, onScheme: (v) => seen.push(v) });
        const fixed = glass.add({ x: 200, y: 100, width: 50, height: 50, adaptive: false });
        const a = frameOf(glass);
        equal(small.shownScheme, "light", "dark glass over a white backdrop turns light");
        equal(fixed.shownScheme, "dark", "the fixed one stays dark");
        equal(small.foreground.text, "rgba(0, 0, 0, 0.847)", "content colour on light glass");
        equal(fixed.foreground.text, "rgba(255, 255, 255, 0.898)", "content colour on dark glass");
        equal(seen[seen.length - 1], "light", "callback");
        glass.destroy();
        const b = lowFrame((r) => {
            r.addShape(100, 100, 50, 50, 25, CORNER_SMOOTH, SCHEME_DARK);
            r.setAdaptive(r.addShape(200, 100, 50, 50, 25, CORNER_SMOOTH, SCHEME_DARK), false);
        }, paint(true));
        equal(distance(a, b), 0, "pixels");
    },
    "followed elements get the content colours as custom properties": async () => {
        const glass = makeGlass();
        const box = document.createElement("div");
        document.body.append(glass.canvas, box);
        const s = glass.add({ x: 0, y: 0, width: 10, height: 10, appearance: "light" });
        s.follow(box);
        equal(box.style.getPropertyValue("--glass-foreground"), "rgba(0, 0, 0, 0.847)", "on following");
        s.set({ appearance: "dark" });
        frameOf(glass);
        equal(box.style.getPropertyValue("--glass-foreground"), "rgba(255, 255, 255, 0.898)", "after the scheme changed");
        equal(box.style.getPropertyValue("--glass-title"), "rgba(255, 255, 255, 0.95)", "title colour");
        s.unfollow();
        equal(box.style.getPropertyValue("--glass-foreground"), "", "taken away again");
        glass.destroy();
        glass.canvas.remove(); box.remove();
    },
    "hide, show and remove end where a fresh scene starts; dead handles reach nothing": () => {
        const glass = makeGlass();
        const panel = glass.add({ x: 40, y: 40, width: 300, height: 200, radius: 28 });
        const gone = glass.add({ x: 380, y: 60, width: 120, height: 120 });
        const handle = gone.handle;
        panel.hide(); frameOf(glass);
        equal(glass.renderer.getPresence(panel.handle), 0, "hidden");
        panel.show(); gone.remove();
        frameOf(glass);
        equal(gone.alive, false, "removed");
        const a = frameOf(glass);
        equal(glass.renderer.isAlive(handle), false, "the handle is dead");
        const next = glass.add({ x: 380, y: 240, width: 100, height: 100 });
        glass.renderer.setTint(handle, 1, 0, 0, 1);                        // must not reach the shape that took the slot
        const withNext = frameOf(glass);
        next.remove(); glass.renderer.settle();
        glass.destroy();
        // the atlas page holds the region elsewhere than in a fresh scene: a level of rounding at most
        truthy(distance(a, lowFrame((r) => r.addShape(40, 40, 300, 200, 28, CORNER_SMOOTH, SCHEME_DARK))) <= 1, "after hide, show and remove");
        equal(distance(withNext, lowFrame((r) => {
            r.addShape(40, 40, 300, 200, 28, CORNER_SMOOTH, SCHEME_DARK); r.addShape(380, 240, 100, 100, 50, CORNER_SMOOTH, SCHEME_DARK);
        })) <= 1, true, "a dead handle left the new shape alone");
    },
    "a lost context comes back with every shape": async () => {
        let lost = 0, back = null;
        const glass = makeGlass({ chromaticAberration: 0.24,
            onContextLost: () => lost++, onContextRestored: (error) => { back = error; } });
        glass.add({ x: 40, y: 40, width: 300, height: 200, radius: 28 });
        glass.add({ x: 380, y: 60, width: 90, height: 90, preset: "clear" });
        glass.add({ x: 400, y: 200, width: 150, height: 150, mask: star(150) });
        glass.add({ x: 520, y: 60, width: 44, height: 44, mask: star(44), preset: "clear", adaptive: false });
        glass.add({ x: 60, y: 280, width: 50, height: 50 });
        glass.add({ x: 300, y: 280, width: 150, height: 80, preset: "clear" });
        const group = glass.addGroup({ spacing: 20 });
        group.add({ x: 140, y: 290, width: 80, height: 80 }); group.add({ x: 230, y: 290, width: 120, height: 80, radius: [30, 0, 30, 0] });
        const lens = glass.add({ x: 450, y: 300, width: 72, height: 72,
            preset: "control", chromaticAberration: 0.4, transition: "none" });
        const before = frameOf(glass);
        const ext = glass.canvas.getContext("webgl2").getExtension("WEBGL_lose_context");
        if (!ext) return "skipped: the browser cannot lose a context on request";
        const gone = new Promise((done) => glass.canvas.addEventListener("webglcontextlost", done, { once: true }));
        ext.loseContext(); await gone;
        equal(glass.contextLost, true, "the glass noticed");
        equal(lost, 1, "callback");
        glass.render();                                                    // drawing while lost is a no-op
        await tick(50);                                                    // the browser takes the answer after the dispatch
        const again = new Promise((done) => glass.canvas.addEventListener("webglcontextrestored", done, { once: true }));
        ext.restoreContext(); await again;
        equal(glass.contextLost, false, "it is back");
        equal(back, "", "rebuilt without an error");
        equal(glass.chromaticAberration, 0.24, "canvas strength survives context loss");
        equal(lens.chromaticAberration, 0.4, "explicit strength survives context loss");
        truthy(distance(before, frameOf(glass)) <= 1, "the same frame as before the loss");
        glass.destroy();
    },
    "extended range keeps what standard range clips": () => {
        const scene = (options) => {
            const glass = makeGlass(options, paint(true));
            glass.add({ x: 60, y: 60, width: 200, height: 200, preset: "clear" });
            return glass;
        };
        const hdr = scene({ extendedRange: true, headroom: 2 });
        if (!hdr.extendedRange) { hdr.destroy(); return "skipped: no half-float drawing buffer in this browser"; }
        const a = frameOf(hdr, true);
        let peak = 0, alpha = 1;
        for (let i = 0; i < a.length; i += 4) { if (a[i] > peak) peak = a[i]; if (a[i + 3] < alpha) alpha = a[i + 3]; }
        truthy(peak > 1.05 && peak < 1.2, "clear glass over white passes 1 (peak " + peak.toFixed(4) + ")");
        equal(alpha, 1, "the canvas stays opaque");
        equal(hdr.setExtendedRange(false), false, "switched off");
        const off = frameOf(hdr);
        hdr.destroy();
        const sdr = scene({});
        equal(sdr.setExtendedRange(true), false, "a glass made without the option cannot switch it on");
        equal(distance(off, frameOf(sdr)), 0, "standard range again");
        sdr.destroy();
    },
    "all built-in profiles render across both schemes, surroundings and presence": () => {
        const rows = [0, ENV_INACTIVE, ENV_INCREASE_CONTRAST, ENV_REDUCE_TRANSPARENCY, ENV_REDUCE_MOTION,
            ENV_INCREASE_CONTRAST | ENV_REDUCE_TRANSPARENCY, ENV_INACTIVE | ENV_INCREASE_CONTRAST, ENV_TINTED, ENV_BUTTON_SHAPES];
        const glass = makeGlass({ extendedRange: true, headroom: 2, stacking: "flat" }), shapes = [];
        for (let scheme = 0; scheme < 2; scheme++) for (let preset = 0; preset < PRESET_NAMES.length; preset++) {
            const i = shapes.length;
            shapes.push(glass.add({ x: 40 + i % 8 * 70, y: 30 + Math.floor(i / 8) * 52, width: 56, height: 44,
                radius: 12, preset: PRESET_NAMES[preset], appearance: scheme ? "light" : "dark", adaptive: false }));
        }
        const hdr = glass.extendedRange, gl = glass.canvas.getContext("webgl2");
        LAST_ERROR[0] = "";
        for (const extended of hdr ? [false, true] : [false]) {
            glass.setExtendedRange(extended);
            for (const bits of rows) for (const presence of [0, 0.4, 1]) {
                glass.renderer.setEnvironment(bits);
                for (const shape of shapes) glass.renderer.setPresence(shape.handle, presence);
                const pixels = frameOf(glass, extended);
                equal(LAST_ERROR[0], "", "material shader compilation");
                equal(gl.getError(), 0, "GPU error at surroundings " + bits + " presence " + presence);
                if (extended) for (let i = 0; i < pixels.length; i++) truthy(Number.isFinite(pixels[i]), "finite extended-range output");
            }
        }
        glass.destroy();
    },
    "mask half-covered seeds remain anchored beside raster noise": () => stableMaskSeed(truthy, equal),
    "mask codecs follow the observed 32-point range boundary": () => {
        const g = makeGlass(), r = g.renderer;
        const shapes = [44, 48, 80].map((size, i) => g.add({ x: 30 + 170 * i, y: 40, width: size, height: size, mask: star(size), preset: "clear", scheme: "light", adaptive: false }));
        frameOf(g);
        const stride = r.fdim.length / r.fields.length;
        for (let i = 0; i < shapes.length; i++) {
            const slot = shapes[i].handle & 0xfffff;
            truthy(r.fdim[slot * stride + 6] !== 0, "encoding at range span " + ([30, 32, 48][i]));
            const bits = r.fdim.slice(slot * stride + 6, slot * stride + 8), range = new Float32Array(bits.buffer);
            equal(range[1] - range[0], [30, 32, 48][i], "traced packed/half span");
        }
        const before = frameOf(g);
        shapes[0].set({ width: 48, height: 48 }); frameOf(g);
        shapes[0].set({ width: 44, height: 44 });
        truthy(distance(before, frameOf(g)) <= 1, "packed field is rebuilt after crossing into half storage and back");
        g.destroy();
    },
    "mask coverage retains half mip averages, ignores colour and updates its range": () => {
        const canvas = document.createElement("canvas"), gl = canvas.getContext("webgl2", { alpha: false, antialias: false });
        canvas.width = 480; canvas.height = 360;
        const made = createRenderer(gl); truthy(made.ok, "mask renderer"); const r = made.value;
        r.resize(480, 360, 2); r.setBackdropSource(paint());
        const image = document.createElement("canvas"); image.width = image.height = 8;
        const ctx = image.getContext("2d"); ctx.fillStyle = "#000"; ctx.fillRect(0, 0, 4, 8);
        const m = r.addMask(image, 30, 20, 180, 140, SCHEME_DARK); truthy(m.ok, "mask accepted");
        const slot = m.value & 0xfffff, fbo = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, r.masks[slot], 3);
        equal(gl.getFramebufferAttachmentParameter(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.FRAMEBUFFER_ATTACHMENT_RED_SIZE), 16, "retained coverage precision");
        equal(gl.getFramebufferAttachmentParameter(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.FRAMEBUFFER_ATTACHMENT_ALPHA_SIZE), 0, "single channel coverage");
        const format = gl.getParameter(gl.IMPLEMENTATION_COLOR_READ_FORMAT), type = gl.getParameter(gl.IMPLEMENTATION_COLOR_READ_TYPE);
        truthy(type === gl.HALF_FLOAT || type === gl.FLOAT, "float coverage readback");
        const value = type === gl.HALF_FLOAT ? new Uint16Array(4) : new Float32Array(4);
        gl.readPixels(0, 0, 1, 1, format, type, value);
        equal(value[0], type === gl.HALF_FLOAT ? 0x3800 : 0.5, "half-covered mip is exactly half");
        gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.deleteFramebuffer(fbo);
        const frame = () => { r.settle(); r.render(0); const out = new Uint8Array(480 * 360 * 4); gl.readPixels(0, 0, 480, 360, gl.RGBA, gl.UNSIGNED_BYTE, out); equal(gl.getError(), 0, "mask frame"); return out; };
        const black = frame(); ctx.clearRect(0, 0, 8, 8); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, 4, 8);
        r.setMask(m.value, image); equal(distance(black, frame()), 0, "mask colour cannot change coverage");
        r.setPreset(m.value, 1, SCHEME_DARK); frame();
        const stride = r.fdim.length / r.fields.length;
        truthy(r.fdim[slot * stride + 6] !== 0, "large mask uses the traced range");
        r.setPresence(m.value, 0.5); frame(); equal(r.fdim[slot * stride + 6], 0, "interpolated mask leaves the traced encoding");
        r.setPresence(m.value, 1); frame(); truthy(r.fdim[slot * stride + 6] !== 0, "complete mask restores its encoding");
        r.setShape(m.value, 30, 20, 44, 44, 0); frame();
        ctx.clearRect(0, 0, 8, 8); r.setMask(m.value, image); const empty = frame();
        r.removeShape(m.value); equal(distance(empty, frame()), 0, "empty mask adds no shadow or surface"); r.dispose();
    },
    "surface state resolves EDR products and survives rendering lifecycle changes": () => surfaceState(truthy, equal, makeGlass, frameOf),
    "explicit surface scales remain independent of headroom and survive output-range changes": () => {
        const scene=()=>{const glass=makeGlass({extendedRange:true,headroom:2});glass.add({x:60,y:60,width:280,height:190,radius:24});return glass;};
        const glass=scene();if(!glass.extendedRange){glass.destroy();return "skipped: no half-float drawing buffer";}
        const identity=frameOf(glass,true);
        truthy(glass.renderer.setSurfaceScale(4,.25).ok,"accepted explicit surface scales");
        const scaled=frameOf(glass,true);truthy(distance(identity,scaled)>.05,"color scale changes its selected pipeline");
        truthy(!glass.renderer.setSurfaceScale(Infinity,.25).ok,"rejects an infinite scale");
        truthy(!glass.renderer.setSurfaceScale(Number.MAX_VALUE,.25).ok,"rejects coefficient overflow");
        equal(distance(scaled,frameOf(glass,true)),0,"rejected values preserve accepted state");
        glass.setExtendedRange(false);frameOf(glass);glass.setExtendedRange(true);
        equal(distance(scaled,frameOf(glass,true)),0,"scales come back with extended output");
        glass.renderer.setSurfaceScale(1,1);equal(distance(identity,frameOf(glass,true)),0,"identity scales restore the original frame");glass.destroy();
    },
    "range transitions rebuild the blur storage and match a fresh renderer": () => {
        const scene = (extended) => {
            const glass = makeGlass({ extendedRange: true, headroom: 2 });
            glass.setExtendedRange(extended);
            glass.add({ x: 50.25, y: 50.5, width: 280, height: 190, radius: 24 });
            glass.add({ x: 120, y: 120, width: 240, height: 160, radius: 32, preset: "clear" });
            return glass;
        };
        const glass = scene(false);
        frameOf(glass);
        if (!glass.setExtendedRange(true)) { glass.destroy(); return "skipped: no half-float drawing buffer in this browser"; }
        const hdr = scene(true), expected = frameOf(hdr, true);
        equal(distance(frameOf(glass, true), expected), 0, "SDR to HDR"); hdr.destroy();
        glass.setExtendedRange(false);
        const sdr = scene(false);
        equal(distance(frameOf(glass), frameOf(sdr)), 0, "HDR to SDR"); sdr.destroy();
        glass.setExtendedRange(true);
        equal(distance(frameOf(glass, true), expected), 0, "HDR again"); glass.destroy();
    },
    "many overlapping shapes draw without errors in both stacking modes": () => {
        const glass = makeGlass({ stacking: "exact" });
        // larger than the adaptive size: the tone of small glass depends on what it has been over before
        for (let i = 0; i < 120; i++) glass.add({ x: 10 + (i % 15) * 38 + (i >> 4) * 3, y: 10 + Math.floor(i / 15) * 42, width: 90, height: 80, radius: 14, appearance: i % 3 ? "dark" : "light" });
        const a = frameOf(glass);
        glass.setStacking("flat");
        const b = frameOf(glass);
        truthy(distance(a, b) > 3, "glass over glass differs from glass over the backdrop only");
        glass.setStacking("exact");
        equal(distance(a, frameOf(glass)), 0, "back to the exact stacking");
        glass.destroy();
    },
    "a followed element is measured again after DOM changes, transitions and image loads": async () => {
        const glass = makeGlass(), canvas = glass.canvas;
        canvas.style.cssText = "position:fixed;left:0;top:0;width:" + W + "px;height:" + H + "px";
        const wrap = document.createElement("div"), spacer = document.createElement("div"), box = document.createElement("div");
        wrap.style.cssText = "position:fixed;left:0;top:0;width:" + W + "px";
        spacer.style.height = "40px"; box.style.cssText = "width:120px;height:60px;margin-left:30px";
        wrap.append(spacer, box); document.body.append(canvas, wrap);
        const s = glass.add({ x: 0, y: 0, width: 0, height: 0, radius: 12, transition: "none" }).follow(box);
        const top = () => box.getBoundingClientRect().top - canvas.getBoundingClientRect().top;
        await frames(3);
        equal(s.y, top(), "first measure");
        spacer.style.height = "140px";                                     // content above grows; the box keeps its size
        await frames(3);
        equal(s.y, 140, "moved by a DOM change");
        // a slow transition, sampled by time so that slow frames (a software renderer) still land inside it
        spacer.style.transition = "height 4000ms linear"; spacer.style.height = "40px";
        await tick(600); await frames(2);
        truthy(s.y > 40 && s.y < 140, "follows a transition while it runs: " + s.y);
        truthy(Math.abs(s.y - top()) <= 8, "within a frame of the box: " + s.y + " / " + top());
        spacer.style.transition = "none";                                  // cancelled: the box jumps to its end
        await frames(3);
        equal(s.y, 40, "where the transition ended");
        spacer.style.transition = ""; spacer.style.height = "auto";
        const image = new Image();
        image.src = "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="80"/>');
        spacer.append(image); await image.decode(); await frames(3);
        equal(s.y, top(), "moved by an image load");
        truthy(s.y >= 80, "below the image");
        // a drag: the style changes in a task, and the frame that paints it has the glass in place without everyFrame
        const left = () => box.getBoundingClientRect().left - canvas.getBoundingClientRect().left;
        for (let i = 1; i <= 8; i++) {
            box.style.translate = i * 7 + "px " + i * 3 + "px";
            await tick(); await frames(1);
            equal(s.x, left(), "dragged, frame " + i);
            equal(s.y, top(), "dragged down, frame " + i);
        }
        truthy(s.x >= 30 + 56, "the drag moved the glass");
        glass.destroy(); canvas.remove(); wrap.remove();
    },

    "frames are skipped while nothing changes, and a transition after idle frames starts at its first frame": async () => {
        const glass = makeGlass(), r = glass.renderer, render = r.render.bind(r);
        const box = document.createElement("div");
        box.style.cssText = "position:fixed;left:40px;top:40px;width:200px;height:100px";
        document.body.append(glass.canvas, box);
        let drawn = 0;
        r.render = (now) => { drawn++; return render(now); };
        const s = glass.add({ x: 0, y: 0, width: 0, height: 0, radius: 20 }).follow(box, true);
        await frames(5); drawn = 0; await frames(20);
        equal(drawn, 0, "an element measured on every frame draws nothing while it stays still");
        box.style.left = "60px"; await frames(3);
        truthy(drawn > 0, "a moved element is drawn");
        await tick(300);
        s.hide(); await frames(1);
        truthy(r.getPresence(s.handle) > 0.99, "the first frame after idle frames starts the transition: " + r.getPresence(s.handle));
        await frames(3);
        truthy(r.getPresence(s.handle) < 0.99, "later frames advance it");
        r.render = render; glass.destroy(); glass.canvas.remove(); box.remove();
    },

    "pressing, opacity and group members up to the next size reuse compiled programs": () => {
        const glass = makeGlass(), r = glass.renderer;
        const panel = glass.add({ x: 40, y: 40, width: 300, height: 160, radius: 24, transition: "none" });
        const group = glass.addGroup({ spacing: 16, transition: "none" });
        group.add({ x: 40, y: 250, width: 56, height: 56 });
        const plain = frameOf(glass), before = r.programs.size;
        panel.press(true);
        truthy(distance(plain, frameOf(glass)) > 0, "the press veil shows");
        panel.set({ opacity: 0.5 });
        truthy(distance(plain, frameOf(glass)) > 0, "the opacity shows");
        panel.press(false); panel.set({ opacity: 1 });
        equal(distance(plain, frameOf(glass)), 0, "back to the plain frame");
        equal(r.programs.size, before, "pressing and opacity compile nothing");
        for (let i = 1; i < 16; i++) { group.add({ x: 40 + (i % 8) * 64, y: 250 + Math.floor(i / 8) * 64, width: 56, height: 56 }); frameOf(glass); }
        equal(group.size, 16, "members");
        truthy(r.programs.size - before <= 4, "16 members take at most four more programs: " + (r.programs.size - before));
        glass.destroy();
    },

    "programs are prepared between frames without changing the picture": async () => {
        const glass = makeGlass(), r = glass.renderer, gl = glass.canvas.getContext("webgl2");
        glass.add({ x: 40, y: 40, width: 300, height: 160, radius: 24, transition: "none" });
        const hidden = glass.add({ x: 380, y: 60, width: 120, height: 44, preset: "control", visible: false, transition: "none" });
        const group = glass.addGroup({ spacing: 12, transition: "none" });
        group.add({ x: 60, y: 260, width: 60, height: 60 }); group.add({ x: 130, y: 260, width: 60, height: 60 });
        const before = frameOf(glass);
        truthy(r.needsWarm(), "new programs wait for their pipelines");
        // one program a call; links started ahead (where the browser links in the background) finish on their own time
        for (let calls = 0; r.needsWarm() && calls < 600; calls++) { r.warm(); await tick(20); }
        equal(r.needsWarm(), false, "every program is prepared");
        equal(gl.getError(), 0, "preparing raises no GL error");
        equal(distance(before, frameOf(glass)), 0, "the picture is unchanged");
        hidden.show();
        truthy(distance(before, frameOf(glass)) > 0, "the hidden shape shows with its prepared program");
        glass.destroy();
    },

    "a partial redraw equals a full redraw in every stacking mode": () => {
        for (const mode of [STACKING_EXACT, STACKING_OVERLAP, STACKING_FLAT]) {
            const canvas = document.createElement("canvas");
            canvas.width = W * RATIO; canvas.height = H * RATIO;
            const gl = canvas.getContext("webgl2", { antialias: false, alpha: false }), made = createRenderer(gl);
            truthy(made.ok, "renderer"); const r = made.value;
            r.resize(canvas.width, canvas.height, RATIO); r.setBackdropSource(paint()); r.setStacking(mode);
            // a panel with buttons on it, neighbours side by side, glass over glass, a group and a tinted shape
            const frames = [[40, 40, 360, 220, 30], [70, 70, 90, 40, 20], [170, 70, 90, 40, 20], [270, 70, 90, 40, 20], [420, 60, 150, 120, 24],
                [430, 200, 150, 120, 24], [300, 180, 200, 160, 28], [60, 290, 120, 90, 22]];
            const shapes = frames.map((f, i) => {
                const h = r.addShape(f[0], f[1], f[2], f[3], f[4], CORNER_SMOOTH, i % 3 ? SCHEME_DARK : SCHEME_LIGHT);
                r.setAdaptive(h, false); if (i === 7) r.setTint(h, 0.2, 0.6, 1, 0.4); if (i === 4) r.setOpacity(h, 0.7);
                return h;
            });
            const union = r.addUnion(14, SCHEME_DARK);
            r.addMember(union, 200, 300, 70, 70, 35, CORNER_SMOOTH); r.addMember(union, 260, 310, 70, 70, 35, CORNER_SMOOTH);
            let clock = 0;
            const read = () => {
                r.render(clock += 16);
                const px = new Uint8Array(canvas.width * canvas.height * 4);
                gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, px);
                if (gl.getError() !== 0) fail("GL error while drawing");
                return px;
            };
            r.settle(); read();
            for (let k = 0; k < 8; k++) {
                const i = [2, 6, 0, 4, 7, 1, 5, 3][k], f = frames[i];
                f[0] += 9 + k * 3; f[1] += (k % 2 ? -7 : 11);
                r.setShape(shapes[i], f[0], f[1], f[2], f[3], f[4]);
                if (k === 3) r.setMember(union, 1, 250, 300, 70, 70, 35);
                const partial = read();
                r.markBackdropDirty();
                equal(distance(partial, read()), 0, "stacking " + mode + ", move " + k);
            }
            r.dispose(); gl.getExtension("WEBGL_lose_context")?.loseContext();
        }
    },

    "overlap stacking draws glass over glass like exact stacking and batches glass laid side by side": () => {
        const menu = (mode) => lowFrame((r) => {
            r.setStacking(mode);
            r.addShape(60, 60, 400, 260, 28, CORNER_SMOOTH, SCHEME_DARK);
            r.addShape(260, 160, 200, 200, 18, CORNER_SMOOTH, SCHEME_DARK);
            r.addShape(280, 180, 150, 44, 22, CORNER_SMOOTH, SCHEME_LIGHT);
        });
        equal(distance(menu(STACKING_EXACT), menu(STACKING_OVERLAP)), 0, "glass over glass");
        const row = (mode) => {
            let depths = 0;
            const px = lowFrame((r) => {
                r.setStacking(mode);
                r.addShape(60, 60, 520, 300, 32, CORNER_SMOOTH, SCHEME_DARK);
                for (let i = 0; i < 10; i++) r.addShape(90 + i * 48, 120, 38, 38, 19, CORNER_SMOOTH, SCHEME_DARK);
                r.render(0); depths = r.depths;
            });
            return { px, depths };
        };
        const exact = row(STACKING_EXACT), overlap = row(STACKING_OVERLAP);
        equal(overlap.depths, 2, "the row is one batch over the panel");
        truthy(exact.depths > 2, "exact stacking orders the neighbours: " + exact.depths);
        truthy(distance(exact.px, overlap.px) <= 12, "neighbours seen through the blur differ a little: " + distance(exact.px, overlap.px));
    },
};
