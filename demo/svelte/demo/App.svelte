<!-- The component demo: a small page built from glass components, with a panel of settings on the side. -->
<script lang="ts">
    import { DEFAULT_CHROMATIC_ABERRATION, type Appearance, type ShownScheme } from "glassrender/core";
    import { MATERIALS, type Preset } from "glassrender/materials";
    import { Glass, GlassCanvas, GlassGroup } from "../src/lib/index.js";
    import { BACKDROPS, backdropThumbnail, screenBackdrop } from "../../../examples/shared/backdrops.js";
    import { drag, type Point } from "../../../examples/shared/drag.js";
    import type { IconName } from "../../../examples/shared/icons.js";
    import {
        ENVIRONMENT,
        type EnvironmentChoice
    } from "../../../examples/shared/options.js";
    import Icon from "./Icon.svelte";

    const PRESETS: Preset[] = MATERIALS.map(material => material.name);
    const APPEARANCES: { value: Appearance; label: string; icon: IconName }[] = [
        { value: "auto", label: "Auto", icon: "auto" }, { value: "light", label: "Light", icon: "sun" }, { value: "dark", label: "Dark", icon: "moon" }
    ];
    const SONG_LENGTH = 228;
    const GUIDE = "https://github.com/Feralthedogg/GlassRender/blob/main/api.md#svelte-components";

    // scene
    let wallpaper = $state(BACKDROPS[0].id);
    let backdrop = $state(screenBackdrop(BACKDROPS[0].id));
    let appearance: Appearance = $state(BACKDROPS[0].scheme);
    // surfaces
    let preset: Preset = $state("standard");
    let chromatic = $state(DEFAULT_CHROMATIC_ABERRATION);
    let cardShown = $state(true);
    let env: Record<EnvironmentChoice["key"], boolean> = $state({
        inactive: false, tinted: false, reduceTransparency: false, increaseContrast: false, reduceMotion: false, buttonShapes: false
    });
    // what the glass reports back, and the page itself
    let panelScheme: ShownScheme = $state("dark");
    let puckScheme: ShownScheme = $state("dark");
    // the puck starts in an empty corner: bottom left beside the panel, or top right on a phone
    let puck = $state(innerWidth > 760 ? { x: 40, y: innerHeight - 120 } : { x: innerWidth - 96, y: 100 });
    let lens = $state({ x: Math.max(24, innerWidth - (innerWidth > 760 ? 352 : 16) - 217), y: Math.max(64, innerHeight * .36 - 96) });
    let playing = $state(true);
    let elapsed = $state(84);
    let toast: "" | "enter" | "shown" | "leave" = $state("");
    let sheetOpen = $state(false);
    // the boxes you can drag, and how far each one has been moved from its place in the layout
    type Widget = "toolbar" | "hero" | "player";
    const home = (): Record<Widget, Point> => ({ toolbar: { x: 0, y: 0 }, hero: { x: 0, y: 0 }, player: { x: 0, y: 0 } });
    let offsets = $state(home());

    const clock = (s: number): string => Math.floor(s / 60) + ":" + String(Math.floor(s % 60)).padStart(2, "0");

    function step(by: number): void {
        preset = PRESETS[(PRESETS.indexOf(preset) + by + PRESETS.length) % PRESETS.length] ?? preset;
    }
    function chooseWallpaper(id: string): void {
        wallpaper = id;
        backdrop = screenBackdrop(id);
        // each wallpaper comes with the appearance that suits it; the buttons can still change it
        appearance = BACKDROPS.find((b) => b.id === id)?.scheme ?? "auto";
    }

    // the wallpaper is painted for the window, so paint it again once a resize settles
    let resizeTimer = 0;
    function resized(): void {
        clearTimeout(resizeTimer);
        resizeTimer = window.setTimeout(() => (backdrop = screenBackdrop(wallpaper)), 150);
    }

    $effect(() => {
        if (!playing) return;
        const timer = setInterval(() => (elapsed = (elapsed + 1) % SONG_LENGTH), 1000);
        return () => clearInterval(timer);
    });

    // the notification is made hidden and shown a frame later, so its glass materializes; it leaves on its own
    $effect(() => {
        if (toast === "enter") { const f = requestAnimationFrame(() => (toast = "shown")); return () => cancelAnimationFrame(f); }
        if (toast === "shown") { const t = setTimeout(() => (toast = "leave"), 4200); return () => clearTimeout(t); }
        if (toast === "leave") { const t = setTimeout(() => (toast = ""), 450); return () => clearTimeout(t); }
    });

    // a widget moves by a CSS translation; its glass measures the box on every frame (`everyFrame`), so it keeps up
    function grab(key: Widget): (e: PointerEvent) => void {
        return (e) => drag(e, offsets[key], (to) => (offsets[key] = to));
    }
    const moved = $derived(Object.values(offsets).some((p) => p.x !== 0 || p.y !== 0));
    const shift = (p: Point): string => `translate: ${p.x}px ${p.y}px`;
</script>

<svelte:window onresize={resized} />

<GlassCanvas {backdrop} {appearance} chromaticAberration={chromatic} active={!env.inactive} tinted={env.tinted}
    buttonShapes={env.buttonShapes} reduceTransparency={env.reduceTransparency ? true : "auto"}
    increaseContrast={env.increaseContrast ? true : "auto"} reduceMotion={env.reduceMotion ? true : "auto"}>
    <main class="stage">
        <!-- one piece of glass for three boxes: neighbours closer than `spacing` flow into each other -->
        <GlassGroup spacing={24} {preset}>
            <nav class="toolbar draggable" aria-label="Material" style={shift(offsets.toolbar)} onpointerdown={grab("toolbar")}>
                <Glass class="tool" everyFrame><button aria-label="Previous material" onclick={() => step(-1)}><Icon name="left" /></button></Glass>
                <Glass class="tool wide" everyFrame><button onclick={() => step(1)}><Icon name="layers" />{preset}</button></Glass>
                <Glass class="tool" everyFrame><button aria-label="Next material" onclick={() => step(1)}><Icon name="right" /></button></Glass>
            </nav>
        </GlassGroup>

        <div class="scene">
            <Glass class="hero draggable" radius={30} {preset} visible={cardShown} everyFrame
                style={shift(offsets.hero)} onpointerdown={grab("hero")}>
                <div class="fade" class:gone={!cardShown}>
                    <span class="eyebrow">Svelte components</span>
                    <h1>Glass that follows your layout.</h1>
                    <p>
                        Every surface here is an ordinary element. <code>&lt;Glass&gt;</code> draws refractive glass under its box on one shared
                        WebGL2 canvas and keeps it there as the page lays out, scrolls and resizes. Drag a card to move it.
                    </p>
                    <div class="actions">
                        <Glass class="cta" interactive preset="standard" radius={24} visible={cardShown} everyFrame>
                            <button type="button" onclick={() => { if (toast === "") toast = "enter"; }}><Icon name="bell" />Show a notification</button>
                        </Glass>
                        <Glass class="cta" interactive {preset} radius={24} visible={cardShown} everyFrame>
                            <a href={GUIDE} target="_blank" rel="noreferrer"><Icon name="book" />API guide</a>
                        </Glass>
                    </div>
                </div>
            </Glass>

            <Glass class="player draggable" radius={26} {preset} everyFrame
                style={shift(offsets.player)} onpointerdown={grab("player")}>
                <div class="player-top">
                    <div class="art"><Icon name="music" /></div>
                    <div class="track"><b>Under the Lens</b><span>The Rim Lights</span></div>
                </div>
                <div class="progress"><i style="width: {(elapsed / SONG_LENGTH) * 100}%"></i></div>
                <div class="times"><span>{clock(elapsed)}</span><span>-{clock(SONG_LENGTH - elapsed)}</span></div>
                <div class="transport">
                    <button aria-label="Previous" onclick={() => (elapsed = 0)}><Icon name="previous" /></button>
                    <button class="main" aria-label={playing ? "Pause" : "Play"} onclick={() => (playing = !playing)}>
                        <Icon name={playing ? "pause" : "play"} />
                    </button>
                    <button aria-label="Next" onclick={() => (elapsed = 0)}><Icon name="next" /></button>
                </div>
            </Glass>
        </div>
    </main>

    <Glass class="lens-demo" preset="control" everyFrame style="left: {lens.x}px; top: {lens.y}px"
        aria-label="Color separation lens" onpointerdown={(e) => drag(e, lens, (to) => (lens = to))}>
        <span class="lens-label">Color lens · control<small>Drag across sharp edges</small></span>
    </Glass>

    <!-- small glass takes the scheme of what is behind it: drag it over light and dark parts of the wallpaper -->
    <Glass class="puck" everyFrame style="left: {puck.x}px; top: {puck.y}px" onscheme={(v) => (puckScheme = v)}
        onpointerdown={(e) => drag(e, puck, (to) => (puck = to))}>
        <span>{puckScheme}</span>
    </Glass>

    {#if toast !== ""}
        <Glass class={toast === "leave" ? "toast leaving" : "toast"} preset="notification" radius={22} everyFrame visible={toast === "shown"} role="status">
            <div class="art"><Icon name="sparkle" /></div>
            <div>
                <b>GlassRender <small>now</small></b>
                <p>This notification moves with a CSS animation; <code>everyFrame</code> keeps its glass underneath.</p>
            </div>
        </Glass>
    {/if}

    <Glass class={sheetOpen ? "inspector open" : "inspector"} preset="inspector" radius={26} onscheme={(v) => (panelScheme = v)}
        data-scheme={panelScheme} role="complementary" aria-label="Settings">
        <header class="panel-head">
            <div class="brand-mark"><Icon name="logo" /></div>
            <div class="brand">
                <div class="brand-name">GlassRender</div>
                <div class="brand-sub">Component demo</div>
            </div>
            <span class="badge">Svelte</span>
            <button class="btn ghost icon-only sheet-toggle" aria-expanded={sheetOpen} aria-label={sheetOpen ? "Hide settings" : "Show settings"}
                onclick={() => (sheetOpen = !sheetOpen)}><Icon name="down" /></button>
        </header>

        <div class="inspector-scroll">
            <section class="section">
                <h2 class="section-title">Scene</h2>
                <div class="field">
                    <span class="label">Appearance</span>
                    <div class="seg">
                        {#each APPEARANCES as a (a.value)}
                            <button aria-pressed={appearance === a.value} onclick={() => (appearance = a.value)}><Icon name={a.icon} />{a.label}</button>
                        {/each}
                    </div>
                </div>
                <div class="field stack">
                    <span class="label">Backdrop</span>
                    <div class="thumbs">
                        {#each BACKDROPS as b (b.id)}
                            <button class="thumb" aria-pressed={wallpaper === b.id} aria-label="{b.name} backdrop" title={b.name}
                                style="background-image: url({backdropThumbnail(b.id)})" onclick={() => chooseWallpaper(b.id)}></button>
                        {/each}
                    </div>
                </div>
            </section>

            <section class="section">
                <h2 class="section-title">Surfaces</h2>
                <div class="field">
                    <span class="label">Material</span>
                    <div class="inline">
                        <label class="select">
                            <select bind:value={preset} aria-label="Material preset">
                                {#each PRESETS as p (p)}<option value={p}>{p}</option>{/each}
                            </select>
                            <Icon name="down" />
                        </label>
                        <button class="btn icon-only" aria-label="Previous material" onclick={() => step(-1)}><Icon name="left" /></button>
                        <button class="btn icon-only" aria-label="Next material" onclick={() => step(1)}><Icon name="right" /></button>
                    </div>
                </div>
                <div class="field">
                    <span class="label">Color split</span>
                    <div class="range">
                        <input type="range" min="0" max="100" aria-label="Chromatic aberration"
                            value={Math.round(chromatic * 100)} style="--p: {chromatic * 100}%"
                            oninput={(e) => (chromatic = Number(e.currentTarget.value) / 100)} />
                        <output>{Math.round(chromatic * 100)}%</output>
                    </div>
                </div>
                <div class="toggle-row">
                    <span>Drag the cards to move them</span>
                    <button class="btn" disabled={!moved} onclick={() => (offsets = home())}>Reset</button>
                </div>
                <div class="toggle-row">
                    <span>Show the card</span>
                    <button class="switch" role="switch" aria-checked={cardShown} aria-label="Show the card" onclick={() => (cardShown = !cardShown)}></button>
                </div>
            </section>

            <section class="section">
                <h2 class="section-title">Environment</h2>
                <div class="chips">
                    {#each ENVIRONMENT as e (e.key)}
                        <button class="chip" aria-pressed={env[e.key]} onclick={() => (env[e.key] = !env[e.key])}>{e.label}</button>
                    {/each}
                </div>
            </section>
        </div>

        <footer class="panel-foot">
            <span class="status">demo/svelte/demo/App.svelte</span>
            <a class="btn ghost" href={GUIDE} target="_blank" rel="noreferrer">API guide<Icon name="external" /></a>
        </footer>
    </Glass>
</GlassCanvas>
