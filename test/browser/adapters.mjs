// Canvas and input regression tests for React, Svelte, Vue and Solid.
// Run: node test/browser/adapters.mjs
// Bundles the checkout's adapter sources in memory; generated pages are removed after the run.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { withPage } from "../../tools/chrome.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const fixture = (adapter, grouped) => {
    if (adapter === "react") return {
        extension: "tsx",
        code: `
            import { useState } from "react";
            import { createRoot } from "react-dom/client";
            import { Glass } from "./src/Glass.tsx";
            import { CanvasContext, GroupContext } from "./src/context.ts";
            function App() {
                const [interactive, setInteractive] = useState(true);
                const [preset, setPreset] = useState("clear");
                const [chromatic, setChromatic] = useState(0.6);
                const [radius, setRadius] = useState(12);
                const [everyFrame, setEveryFrame] = useState(false);
                window.__setRadius = setRadius;
                window.__setEveryFrame = setEveryFrame;
                window.__setChromatic = setChromatic;
                window.__setPreset = setPreset;
                window.__setInteractive = setInteractive;
                return <CanvasContext.Provider value={{ glass: window.__glass, error: "" }}>
                    ${grouped ? '<GroupContext.Provider value={window.__glass}>' : ''}
                    <Glass id="box" preset={preset} radius={radius} everyFrame={everyFrame} chromaticAberration={chromatic} interactive={interactive} onPointerDown={window.__down}
                        onPointerUp={window.__up} onPointerCancel={window.__cancel}
                        onLostPointerCapture={window.__lost}>
                        <button id="button" onClick={window.__buttonClick}
                            onPointerDown={window.__childDown} onPointerUp={window.__childUp}>
                            <span id="label">Button</span>
                        </button>
                        <a id="link" href="#destination" onClick={window.__linkClick}>
                            <svg id="link-icon" width="32" height="32"><rect width="32" height="32" /></svg>
                            Link
                        </a>
                    </Glass>
                    ${grouped ? '</GroupContext.Provider>' : ''}
                </CanvasContext.Provider>;
            }
            const app = createRoot(document.getElementById("app"));
            app.render(<App />);
            window.__unmount = () => app.unmount();
        `
    };
    if (adapter === "solid") return {
        extension: "tsx",
        code: `
            import { createSignal } from "solid-js";
            import { render } from "solid-js/web";
            import { Glass } from "./src/Glass.tsx";
            import { CanvasContext, GroupContext } from "./src/context.ts";
            function App() {
                const [interactive, setInteractive] = createSignal(true);
                const [preset, setPreset] = createSignal("clear");
                const [chromatic, setChromatic] = createSignal(0.6);
                const [radius, setRadius] = createSignal(12);
                const [everyFrame, setEveryFrame] = createSignal(false);
                window.__setRadius = setRadius; window.__setEveryFrame = setEveryFrame;
                window.__setChromatic = setChromatic; window.__setPreset = setPreset; window.__setInteractive = setInteractive;
                return <CanvasContext.Provider value={{ glass: window.__glass, error: "" }}>
                    ${grouped ? '<GroupContext.Provider value={() => window.__glass}>' : ''}
                    <Glass id="box" preset={preset()} radius={radius()} everyFrame={everyFrame()} chromaticAberration={chromatic()} interactive={interactive()} onPointerDown={window.__down}
                        onPointerUp={window.__up} onPointerCancel={window.__cancel} onLostPointerCapture={window.__lost}>
                        <button id="button" onClick={window.__buttonClick} onPointerDown={window.__childDown} onPointerUp={window.__childUp}>
                            <span id="label">Button</span>
                        </button>
                        <a id="link" href="#destination" onClick={window.__linkClick}>
                            <svg id="link-icon" width="32" height="32"><rect width="32" height="32" /></svg>Link
                        </a>
                    </Glass>
                    ${grouped ? '</GroupContext.Provider>' : ''}
                </CanvasContext.Provider>;
            }
            window.__unmount = render(() => <App />, document.getElementById("app"));
        `
    };
    if (adapter === "svelte") return {
        extension: "js",
        code: `
            import { mount, unmount } from "svelte";
            import Fixture from "./__interactive_fixture.svelte";
            const app = mount(Fixture, { target: document.getElementById("app") });
            window.__setInteractive = app.setInteractive;
            window.__setPreset = app.setPreset;
            window.__setChromatic = app.setChromatic;
            window.__setRadius = app.setRadius;
            window.__setEveryFrame = app.setEveryFrame;
            window.__unmount = () => unmount(app);
        `,
        component: `
            <script>
                import { setContext } from "svelte";
                import Glass from "./src/lib/Glass.svelte";
                import { CANVAS_KEY, GROUP_KEY } from "./src/lib/context.ts";
                setContext(CANVAS_KEY, { glass: window.__glass, error: "" });
                ${grouped ? 'setContext(GROUP_KEY, { group: window.__glass });' : ''}
                let interactive = $state(true);
                let preset = $state("clear");
                let chromatic = $state(0.6);
                let radius = $state(12);
                let everyFrame = $state(false);
                export function setRadius(value) { radius = value; }
                export function setEveryFrame(value) { everyFrame = value; }
                export function setChromatic(value) { chromatic = value; }
                export function setInteractive(value) { interactive = value; }
                export function setPreset(value) { preset = value; }
            </script>
            <Glass id="box" {preset} {interactive} {radius} {everyFrame} chromaticAberration={chromatic} onpointerdown={window.__down}
                onpointerup={window.__up} onpointercancel={window.__cancel}
                onlostpointercapture={window.__lost}>
                <button id="button" onclick={window.__buttonClick}
                    onpointerdown={window.__childDown} onpointerup={window.__childUp}>
                    <span id="label">Button</span>
                </button>
                <a id="link" href="#destination" onclick={window.__linkClick}>
                    <svg id="link-icon" width="32" height="32"><rect width="32" height="32" /></svg>
                    Link
                </a>
            </Glass>
        `
    };
    return {
        extension: "js",
        code: `
            import { createApp, h, provide, ref } from "vue";
            import { Glass } from "./src/Glass.ts";
            import { CANVAS_KEY, GROUP_KEY } from "./src/context.ts";
            const app = createApp({ setup() {
                provide(CANVAS_KEY, { glass: window.__glass, error: "" });
                ${grouped ? 'provide(GROUP_KEY, { group: window.__glass });' : ''}
                const interactive = ref(true);
                const preset = ref("clear");
                const chromatic = ref(0.6);
                const radius = ref(12);
                const everyFrame = ref(false);
                window.__setRadius = value => { radius.value = value; };
                window.__setEveryFrame = value => { everyFrame.value = value; };
                window.__setChromatic = value => { chromatic.value = value; };
                window.__setPreset = value => { preset.value = value; };
                window.__setInteractive = value => { interactive.value = value; };
                return () => h(Glass, { id: "box", preset: preset.value, radius: radius.value, everyFrame: everyFrame.value, chromaticAberration: chromatic.value, interactive: interactive.value,
                    onPointerdown: window.__down, onPointerup: window.__up,
                    onPointercancel: window.__cancel, onLostpointercapture: window.__lost
                }, { default: () => [
                    h("button", { id: "button", onClick: window.__buttonClick,
                        onPointerdown: window.__childDown, onPointerup: window.__childUp
                    }, [h("span", { id: "label" }, "Button")]),
                    h("a", { id: "link", href: "#destination", onClick: window.__linkClick }, [
                        h("svg", { id: "link-icon", width: 32, height: 32 }, [h("rect", { width: 32, height: 32 })]),
                        "Link"
                    ])
                ] });
            } });
            app.mount("#app");
            window.__unmount = () => app.unmount();
        `
    };
};

const harness = `
    window.__state = { pressed: false, buttons: 0, links: 0, down: 0, up: 0, cancel: 0, lost: 0,
        pointer: null, preventDown: false, stopUp: false, captureChild: false, presetUpdates: [], follows: [], added: 0 };
    const state = window.__state;
    window.__glass = { add(options) {
        state.options = options; state.updates = [];
        state.added++;
        window.__mounted = true;
        return { follow(element,everyFrame) { state.follows.push({ id: element.id, everyFrame }); return this; }, set(update) {
            if (update.preset !== undefined) state.presetUpdates.push(update.preset);
            state.updates.push(update);
            return this; }, remove() {},
            press(value) { state.pressed = value; return this; } };
    } };
    window.__down = event => { state.down++; state.pointer = event.pointerId;
        if (state.preventDown) event.preventDefault(); };
    window.__up = () => { state.up++; };
    window.__cancel = () => { state.cancel++; };
    window.__lost = () => { state.lost++; };
    window.__buttonClick = () => { state.buttons++; };
    window.__linkClick = () => { state.links++; };
    window.__childDown = event => {
        if (state.captureChild) event.currentTarget.setPointerCapture(event.pointerId);
    };
    window.__childUp = event => { if (state.stopUp) event.stopPropagation(); };
    // Count capture-phase release listeners to verify per-press cleanup, including unmount.
    window.__listeners = { pointerup: new Set(), pointercancel: new Set() };
    const add = document.addEventListener.bind(document), remove = document.removeEventListener.bind(document);
    document.addEventListener = (type, listener, options) => {
        if (options === true && window.__listeners[type]) window.__listeners[type].add(listener);
        add(type, listener, options);
    };
    document.removeEventListener = (type, listener, options) => {
        if (options === true && window.__listeners[type]) window.__listeners[type].delete(listener);
        remove(type, listener, options);
    };
    window.__listenerCount = () => Object.values(window.__listeners).reduce((sum, set) => sum + set.size, 0);
    const ready = () => {
        if (window.__mounted && window.__unmount) window.__ready = true;
        else requestAnimationFrame(ready);
    };
    requestAnimationFrame(() => requestAnimationFrame(ready));
`;

const canvasFixture = adapter => {
    if (adapter === "react") return { extension: "tsx", code: `
        import { useState } from "react";
        import { createRoot } from "react-dom/client";
        import { GlassCanvas } from "./src/GlassCanvas.tsx";
        import { useGlass } from "./src/context.ts";
        function Probe() { window.__canvasState = useGlass(); return null; }
        function App() {
            const [options, setOptions] = useState({});
            window.__setBackdrop = (backdrop, live = false) => setOptions(backdrop === undefined ? {} : { backdrop, live });
            return <GlassCanvas className="fixture-canvas" fixed={false} maxPixelRatio={1} {...options}><Probe /></GlassCanvas>;
        }
        const app = createRoot(document.getElementById("app"));
        app.render(<App />);
        window.__unmount = () => app.unmount();
    ` };
    if (adapter === "solid") return { extension: "tsx", code: `
        import { createSignal } from "solid-js";
        import { render } from "solid-js/web";
        import { GlassCanvas } from "./src/GlassCanvas.tsx";
        import { useGlass } from "./src/context.ts";
        function Probe() { window.__canvasState = useGlass(); return null; }
        function App() {
            const [options, setOptions] = createSignal({});
            window.__setBackdrop = (backdrop, live = false) => setOptions(backdrop === undefined ? {} : { backdrop, live });
            return <GlassCanvas class="fixture-canvas" fixed={false} maxPixelRatio={1} {...options()}><Probe /></GlassCanvas>;
        }
        window.__unmount = render(() => <App />, document.getElementById("app"));
    ` };
    if (adapter === "svelte") return { extension: "js", code: `
        import { mount, unmount } from "svelte";
        import Fixture from "./__interactive_fixture.svelte";
        const app = mount(Fixture, { target: document.getElementById("app") });
        window.__setBackdrop = app.setBackdrop;
        window.__unmount = () => unmount(app);
    `, component: `
        <script>
            import GlassCanvas from "./src/lib/GlassCanvas.svelte";
            import Probe from "./__canvas_probe.svelte";
            let options = $state({});
            export function setBackdrop(backdrop, live = false) { options = backdrop === undefined ? {} : { backdrop, live }; }
        </script>
        <GlassCanvas class="fixture-canvas" fixed={false} maxPixelRatio={1} {...options}><Probe /></GlassCanvas>
    `, probe: `
        <script>
            import { getGlass } from "./src/lib/context.ts";
            window.__canvasState = getGlass();
        </script>
    ` };
    return { extension: "js", code: `
        import { createApp, h, shallowRef } from "vue";
        import { GlassCanvas } from "./src/GlassCanvas.ts";
        import { useGlass } from "./src/context.ts";
        const Probe = { setup() { window.__canvasState = useGlass(); return () => null; } };
        const app = createApp({ setup() {
            const options = shallowRef({});
            window.__setBackdrop = (backdrop, live = false) => { options.value = backdrop === undefined ? {} : { backdrop, live }; };
            return () => h(GlassCanvas, { class: "fixture-canvas", fixed: false, maxPixelRatio: 1, ...options.value }, { default: () => h(Probe) });
        } });
        app.mount("#app");
        window.__unmount = () => app.unmount();
    ` };
};

const canvasHarness = `
    window.__pixel = (y = 100) => {
        const glass = window.__canvasState.glass;
        glass.render();
        const gl = glass.canvas.getContext("webgl2"), pixel = new Uint8Array(4);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.readPixels(10, glass.canvas.height - y - 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
        return Array.from(pixel);
    };
    const ready = () => {
        if ((window.__canvasState?.glass || window.__canvasState?.error) && window.__unmount) window.__ready = true;
        else requestAnimationFrame(ready);
    };
    requestAnimationFrame(ready);
`;

async function runBackdropCases(evaluate, adapter) {
    const results = [];
    const pixel = async (expected, y = 100) => {
        const actual = await evaluate(`new Promise(resolve => {
            let frames = 0;
            const sample = () => {
                const actual = window.__pixel(${y});
                if (actual.slice(0, 3).every((value, i) => Math.abs(value - ${JSON.stringify(expected)}[i]) <= 1) || ++frames === 120) resolve(actual);
                else requestAnimationFrame(sample);
            };
            requestAnimationFrame(sample);
        })`);
        assert.ok(actual.slice(0, 3).every((value, i) => Math.abs(value - expected[i]) <= 1), `expected ${expected}, got ${actual}`);
    };
    const check = async (name, run) => {
        try { await run(); results.push({ name: `${adapter} canvas: ${name}`, ok: true }); }
        catch (error) { results.push({ name: `${adapter} canvas: ${name}`, ok: false, error: error.message }); }
    };
    try {
        await check("omitted backdrop draws the built-in SVG", async () => {
            assert.equal(await evaluate("window.__canvasState?.error"), "");
            await pixel([22, 51, 80]);
            await pixel([229, 140, 83], 300);
        });
        await check("a supplied URL replaces the default", async () => {
            await evaluate(`(() => { window.__custom = document.createElement('canvas');
                window.__custom.width = window.__custom.height = 8;
                const ctx = window.__custom.getContext('2d'); ctx.fillStyle = 'rgb(200,30,60)'; ctx.fillRect(0,0,8,8);
                window.__setBackdrop(window.__custom.toDataURL()); })()`);
            await pixel([200, 30, 60]);
        });
        await check("a live canvas still uploads changing pixels", async () => {
            await evaluate("window.__setBackdrop(window.__custom, true)");
            await pixel([200, 30, 60]);
            await evaluate("(() => { const ctx = window.__custom.getContext('2d'); ctx.fillStyle = 'rgb(20,180,50)'; ctx.fillRect(0,0,8,8); })()");
            await pixel([20, 180, 50]);
        });
        await check("explicit null clears the backdrop", async () => {
            await evaluate("window.__setBackdrop(null)");
            await pixel([0, 0, 0]);
        });
        await check("removing the prop restores the default", async () => {
            await evaluate("window.__setBackdrop(undefined)");
            await pixel([22, 51, 80]);
            await pixel([229, 140, 83], 300);
        });
    } finally { await evaluate("window.__unmount()"); }
    return results;
}

async function buildFixture(adapter, grouped = false, canvas = false) {
    const require = createRequire(join(root, "demo", adapter, "package.json"));
    const { build } = await import(pathToFileURL(require.resolve("vite")).href);
    const source = canvas ? canvasFixture(adapter) : fixture(adapter, grouped);
    const entry = join(root, "demo", adapter, `__interactive_entry.${source.extension}`);
    const component = join(root, "demo", adapter, "__interactive_fixture.svelte");
    const probe = join(root, "demo", adapter, "__canvas_probe.svelte");
    const plugin = {
        name: "interactive-test-fixture", enforce: "pre",
        resolveId(id) {
            if (id === entry) return entry;
            if (id === "./__interactive_fixture.svelte") return component;
            if (id === "./__canvas_probe.svelte") return probe;
        },
        load(id) {
            if (id === entry) return source.code;
            if (id === component) return source.component;
            if (id === probe) return source.probe;
        }
    };
    const plugins = [plugin];
    if (adapter === "react") {
        const react = await import(pathToFileURL(require.resolve("@vitejs/plugin-react")).href);
        plugins.push(react.default());
    } else if (adapter === "solid") {
        const solid = await import(pathToFileURL(require.resolve("vite-plugin-solid")).href);
        plugins.push(solid.default());
    } else if (adapter === "svelte") {
        const { svelte } = await import(pathToFileURL(require.resolve("@sveltejs/vite-plugin-svelte")).href);
        plugins.push(svelte({ configFile: join(root, "demo/svelte/svelte.config.js") }));
    }
    const result = await build({ configFile: false, root: join(root, "demo", adapter), plugins, logLevel: "error",
        build: { write: false, minify: false, target: "esnext", rollupOptions: { input: entry } } });
    const outputs = Array.isArray(result) ? result.flatMap(r => r.output) : result.output;
    const script = outputs.find(o => o.type === "chunk" && o.isEntry).code.replaceAll("</script", "<\\/script");
    const css = outputs.filter(o => o.type === "asset" && o.fileName.endsWith(".css")).map(o => o.source).join("\n");
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><style>
        body { margin: 0; padding: 40px; } .fixture-canvas { width: 480px; height: 320px; } #box { display: flex; align-items: center; gap: 40px;
            width: 500px; height: 140px; padding: 20px; border: 1px solid; }
        button, a { padding: 16px; display: flex; gap: 8px; align-items: center; }
        #outside { margin-top: 80px; width: 800px; height: 160px; }
        ${css}</style></head><body><div id="app"></div><div id="outside">Outside</div>
        <script>${canvas ? canvasHarness : harness}</script><script type="module">${script}</script></body></html>`;
}

async function runCases(evaluate, send, adapter, grouped = false, propsOnly = false) {
    await send("Emulation.setDeviceMetricsOverride", { width: 1000, height: 700, deviceScaleFactor: 1, mobile: false });
    const tick = () => evaluate("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
    const state = () => evaluate("({...window.__state, listeners: window.__listenerCount()})");
    const position = id => evaluate(`(() => { const r = document.getElementById(${JSON.stringify(id)}).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
    const mouse = async (type, id) => {
        const p = await position(id);
        await send("Input.dispatchMouseEvent", { type, ...p, button: type === "mouseMoved" ? "none" : "left",
            buttons: type === "mousePressed" ? 1 : 0, clickCount: type === "mouseMoved" ? 0 : 1 });
        await tick();
    };
    const click = async id => { await mouse("mouseMoved", id); await mouse("mousePressed", id); await mouse("mouseReleased", id); };
    const results = [];
    const check = async (name, run) => {
        const label = `${adapter}${grouped ? ' group member' : ''}: ${name}`;
        try { await run(); results.push({ name: label, ok: true }); }
        catch (error) { results.push({ name: label, ok: false, error: error.message }); }
        finally {
            await evaluate("Object.assign(window.__state, { stopUp: false, preventDown: false, captureChild: false })");
            await mouse("mouseReleased", "outside");
            await evaluate(`document.getElementById('box')?.dispatchEvent(new PointerEvent('pointercancel',
                { bubbles: true, pointerId: window.__state.pointer }));`);
            await tick();
        }
    };
    if (!grouped && !propsOnly) {
        await check("preset props select only a built-in material", async () => {
            assert.equal(await evaluate("window.__state.options.preset"), "clear");
            assert.equal(await evaluate("Object.hasOwn(window.__state.options, 'material')"), false);
        });
        await check("chromatic props reach the glass without becoming DOM attributes", async () => {
            assert.equal(await evaluate("window.__state.options.chromaticAberration"), 0.6);
            assert.equal(await evaluate("document.querySelector('#box').hasAttribute('chromaticaberration')"), false);
        });
        await check("chromatic updates preserve explicit zero", async () => {
            await evaluate("window.__setChromatic(0)"); await tick();
            assert.equal(await evaluate("window.__state.updates.filter(u=>Object.hasOwn(u,'chromaticAberration')).at(-1).chromaticAberration"), 0);
        });
        await check("clearing chromatic props restores canvas inheritance", async () => {
            await evaluate("window.__setChromatic(undefined)"); await tick();
            assert.equal(await evaluate("window.__state.updates.filter(u=>Object.hasOwn(u,'chromaticAberration')).at(-1).chromaticAberration"), null);
        });
        await check("changing the preset updates the selected material", async () => {
            await evaluate("window.__setPreset('menu')"); await tick();
            assert.equal(await evaluate("window.__state.presetUpdates.at(-1)"), "menu");
        });
        await check("clearing the preset restores standard without overrides", async () => {
            await evaluate("window.__setPreset(undefined)"); await tick();
            assert.equal(await evaluate("window.__state.presetUpdates.at(-1)"), "standard");
            assert.equal(await evaluate("window.__state.updates.some(u => Object.hasOwn(u, 'material'))"), false);
            await evaluate("window.__setPreset('clear')"); await tick();
        });
    }
    await check("removing radius synchronizes the default DOM and renderer geometry",async()=>{
        assert.equal(await evaluate("window.__state.options.radius"),12);
        await evaluate("window.__setRadius(undefined)");await tick();
        assert.equal(await evaluate("window.__state.updates.filter(u=>Object.hasOwn(u,'radius')).at(-1)?.radius"),null);
        assert.equal(await evaluate("document.getElementById('box').style.borderRadius"),"9999px");
        await evaluate("window.__setRadius(0)");await tick();
        assert.equal(await evaluate("window.__state.updates.filter(u=>Object.hasOwn(u,'radius')).at(-1)?.radius"),0);
        assert.equal(await evaluate("document.getElementById('box').style.borderRadius"),"0px");
        await evaluate("window.__setRadius([6,10,14,18])");await tick();
        assert.equal(await evaluate("Array.isArray(window.__state.updates.filter(u=>Object.hasOwn(u,'radius')).at(-1)?.radius)"),true);
        assert.deepEqual(await evaluate("Array.from(window.__state.updates.filter(u=>Object.hasOwn(u,'radius')).at(-1).radius)"),[6,10,14,18]);
        await evaluate("window.__setRadius(undefined)");await tick();
        assert.equal(await evaluate("window.__state.updates.filter(u=>Object.hasOwn(u,'radius')).at(-1)?.radius"),null);
        assert.equal(await evaluate("document.getElementById('box').style.borderRadius"),"9999px");
    });
    await check("everyFrame updates reattach the existing shape in both directions",async()=>{
        const added=await evaluate("window.__state.added");
        assert.equal(await evaluate("window.__state.follows.at(-1).everyFrame"),false);
        await evaluate("window.__setEveryFrame(true)");await tick();
        assert.equal(await evaluate("window.__state.follows.at(-1).everyFrame"),true);
        await evaluate("window.__setEveryFrame(false)");await tick();
        assert.equal(await evaluate("window.__state.follows.at(-1).everyFrame"),false);
        await evaluate("window.__setEveryFrame(true)");await tick();
        assert.equal(await evaluate("window.__state.follows.at(-1).everyFrame"),true);
        await evaluate("window.__setEveryFrame(undefined)");await tick();
        assert.equal(await evaluate("window.__state.follows.at(-1).everyFrame"),false);
        assert.equal(await evaluate("window.__state.added"),added);
        assert.equal(await evaluate("document.getElementById('box').hasAttribute('everyframe')"),false);
    });
    if (grouped || propsOnly) {
        await evaluate("window.__unmount()"); await tick();
        return results;
    }
    await check("click reaches a nested button label", async () => {
        const before = await state(); await click("label");
        assert.equal((await state()).buttons, before.buttons + 1);
        assert.equal((await state()).pressed, false);
    });
    await check("click reaches a link through its SVG and performs navigation", async () => {
        const before = await state(); await click("link-icon");
        assert.equal((await state()).links, before.links + 1);
        assert.equal(await evaluate("location.hash"), "#destination");
    });
    await check("button keyboard activation is preserved", async () => {
        await evaluate("document.getElementById('button').focus()");
        const before = await state();
        for (const [key, code, virtual] of [["Enter", "Enter", 13], [" ", "Space", 32]]) {
            await send("Input.dispatchKeyEvent", { type: "keyDown", key, code, windowsVirtualKeyCode: virtual,
                text: key === "Enter" ? "\r" : " " });
            await send("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode: virtual });
        }
        await tick(); assert.equal((await state()).buttons, before.buttons + 2);
    });
    await check("release outside clears the veil without activating the button", async () => {
        const before = await state(); await mouse("mousePressed", "label");
        assert.equal((await state()).pressed, true);
        await mouse("mouseReleased", "outside");
        assert.equal((await state()).pressed, false);
        assert.equal((await state()).buttons, before.buttons);
        assert.equal((await state()).listeners, 0);
    });
    await check("a child stopping pointerup propagation still releases the veil", async () => {
        await evaluate("window.__state.stopUp = true");
        const before = await state(); await click("label");
        assert.equal((await state()).pressed, false);
        assert.equal((await state()).buttons, before.buttons + 1);
        assert.equal((await state()).listeners, 0);
        await evaluate("window.__state.stopUp = false");
    });
    await check("another pointer cannot end the current press", async () => {
        await mouse("mousePressed", "label");
        await evaluate(`for (const type of ['pointerup', 'pointercancel']) document.getElementById('box')
            .dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: window.__state.pointer + 10 }));`);
        await tick(); assert.equal((await state()).pressed, true);
        await mouse("mouseReleased", "label");
    });
    await check("pointer cancellation clears the veil and forwards the callback", async () => {
        await mouse("mousePressed", "label"); const before = await state();
        await evaluate(`document.getElementById('box').dispatchEvent(new PointerEvent('pointercancel',
            { bubbles: true, pointerId: window.__state.pointer }));`);
        await tick(); assert.equal((await state()).pressed, false);
        assert.equal((await state()).cancel, before.cancel + 1);
        assert.equal((await state()).listeners, 0);
        await mouse("mouseReleased", "outside");
    });
    await check("window blur clears an unfinished press", async () => {
        await mouse("mousePressed", "label");
        await evaluate("window.dispatchEvent(new Event('blur'))"); await tick();
        assert.equal((await state()).pressed, false);
        assert.equal((await state()).listeners, 0);
        await mouse("mouseReleased", "outside");
    });
    await check("preventDefault in the supplied pointerdown handler is respected", async () => {
        await evaluate("window.__state.preventDown = true");
        await mouse("mousePressed", "label");
        assert.equal((await state()).pressed, false);
        assert.equal((await state()).listeners, 0);
        await mouse("mouseReleased", "label");
        await evaluate("window.__state.preventDown = false");
    });
    await check("interactive false leaves the pointer alone", async () => {
        await evaluate("window.__setInteractive(false)"); await tick();
        const before = await state(); await click("label");
        assert.equal((await state()).buttons, before.buttons + 1);
        assert.equal((await state()).pressed, false);
        assert.equal((await state()).listeners, 0);
        await evaluate("window.__setInteractive(true)"); await tick();
    });
    await check("a child's own pointer capture and lost-capture callback are preserved", async () => {
        await evaluate("window.__state.captureChild = true");
        const before = await state(); await click("label");
        assert.equal((await state()).buttons, before.buttons + 1);
        assert.ok((await state()).lost > before.lost);
        assert.equal((await state()).pressed, false);
        await evaluate("window.__state.captureChild = false");
    });
    const touch = async (type, id) => {
        const p = await position(id);
        await send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchStart" ? [{ ...p, id: 1 }] : [] });
        await tick();
    };
    await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 });
    await check("touch tap activates the nested button", async () => {
        const before = await state(); await touch("touchStart", "label");
        assert.equal((await state()).pressed, true);
        await touch("touchEnd", "label");
        assert.equal((await state()).buttons, before.buttons + 1);
        assert.equal((await state()).pressed, false);
    });
    await check("touch tap activates the link through its SVG", async () => {
        await evaluate("history.replaceState(null, '', location.pathname)");
        const before = await state(); await touch("touchStart", "link-icon");
        await touch("touchEnd", "link-icon");
        assert.equal((await state()).links, before.links + 1);
        assert.equal(await evaluate("location.hash"), "#destination");
    });
    await check("a browser touch cancellation releases the veil without clicking", async () => {
        const before = await state(); await touch("touchStart", "label");
        assert.equal((await state()).pressed, true);
        await touch("touchCancel", "label");
        assert.equal((await state()).pressed, false);
        assert.equal((await state()).buttons, before.buttons);
        assert.equal((await state()).cancel, before.cancel + 1);
        assert.equal((await state()).listeners, 0);
    });
    await send("Emulation.setTouchEmulationEnabled", { enabled: false });
    await check("unmount removes release listeners during an active press", async () => {
        await mouse("mousePressed", "label");
        assert.equal((await state()).pressed, true);
        assert.equal((await state()).listeners, 2);
        await evaluate("window.__unmount()"); await tick();
        assert.equal((await state()).listeners, 0);
        await mouse("mouseReleased", "outside");
    });
    return results;
}

const temporary = await mkdtemp(join(root, "test/browser/.adapter-input-"));
let failed = 0;
let total = 0;
try {
    for (const adapter of ["react", "svelte", "vue", "solid"]) {
        if (process.argv.includes("--solid") && adapter !== "solid") continue;
        const canvasFile = join(temporary, `${adapter}-canvas.html`);
        await writeFile(canvasFile, await buildFixture(adapter, false, true));
        const canvasResults = await withPage(canvasFile.slice(root.length), evaluate => runBackdropCases(evaluate, adapter));
        total += canvasResults.length;
        for (const result of canvasResults) {
            if (!result.ok) failed++;
            console.log(`${result.ok ? "ok" : "FAIL"} ${result.name}${result.error ? `\n  ${result.error}` : ""}`);
        }
        if (process.argv.includes("--canvas")) continue;
        for (const grouped of [false, true]) {
            const file = join(temporary, `${adapter}${grouped ? '-group' : ''}.html`);
            await writeFile(file, await buildFixture(adapter, grouped));
            const relative = file.slice(root.length);
            const results = await withPage(relative, (evaluate, send) => runCases(evaluate, send, adapter, grouped, process.argv.includes('--props')));
            total += results.length;
            for (const result of results) {
                if (!result.ok) failed++;
                console.log(`${result.ok ? "ok" : "FAIL"} ${result.name}${result.error ? `\n  ${result.error}` : ""}`);
            }
        }
    }
    console.log(`${total} tests, ${failed} failed`);
    process.exitCode = failed ? 1 : 0;
} finally {
    await rm(temporary, { recursive: true, force: true });
}
