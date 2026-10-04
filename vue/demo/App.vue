<!-- The component demo: a small page built from glass components, with a panel of settings on the side. -->
<script setup lang="ts">
import { computed, h, onBeforeUnmount, onMounted, reactive, ref, shallowRef, watch, watchEffect, type FunctionalComponent } from "vue";
import { PRESET_NAMES, packPreset, presetNumber, type Appearance, type Preset, type ShownScheme } from "glassrender";
import { Glass, GlassCanvas, GlassGroup } from "../src/index.js";
import { BACKDROPS, backdropThumbnail, screenBackdrop } from "../../examples/shared/backdrops.js";
import { drag, type Point } from "../../examples/shared/drag.js";
import { icon, type IconName } from "../../examples/shared/icons.js";
import {
    ACCENTS, ENVIRONMENT, LENS_DEFAULT, LENS_FIELDS, RIM_DEFAULT, RIM_FIELDS, TINTS, cssColor, fringeMaterial, materialCode, presetOrder,
    type EnvironmentChoice, type LensFringes, type RimFringes
} from "../../examples/shared/options.js";
import Fringe from "./Fringe.vue";

const Icon: FunctionalComponent<{ name: IconName }> = (props) => h("span", { class: "i", innerHTML: icon(props.name) });

const PRESETS: Preset[] = presetOrder(PRESET_NAMES);
const APPEARANCES: { value: Appearance; label: string; icon: IconName }[] = [
    { value: "auto", label: "Auto", icon: "auto" }, { value: "light", label: "Light", icon: "sun" }, { value: "dark", label: "Dark", icon: "moon" }
];
const SONG_LENGTH = 228;
const GUIDE = "https://github.com/Feralthedogg/GlassRender/blob/main/api.md#vue-components";
// the largest surface, the card, is about this many points on its short side
const SURFACE_SIDE = 360;

// the capture margin a preset gets on its own (the third info value of its packed block); fringes reach further
const packed = new Float32Array(200), info = new Float32Array(6);
function presetMargin(p: Preset, side: number): number {
    packPreset(packed, 0, info, 0, Math.max(0, presetNumber(p)), side, side, 0, 1);
    return info[2] ?? 0;
}

// scene; the backdrop canvas stays a plain object (a reactive proxy cannot be uploaded to WebGL)
const wallpaper = ref(BACKDROPS[0].id);
const backdrop = shallowRef(screenBackdrop(BACKDROPS[0].id));
const appearance = ref<Appearance>(BACKDROPS[0].scheme);
const accent = ref(0);
const angle = ref(0);
const follow = ref(false);
// surfaces
const preset = ref<Preset>("standard");
const tint = ref(0);
const cardShown = ref(true);
const rim = ref<RimFringes>(RIM_DEFAULT);
const layer = ref<LensFringes>(LENS_DEFAULT);
const env = reactive<Record<EnvironmentChoice["key"], boolean>>({
    inactive: false, tinted: false, reduceTransparency: false, increaseContrast: false, reduceMotion: false, buttonShapes: false
});
// what the glass reports back, and the page itself
const panelScheme = ref<ShownScheme>("dark");
const puckScheme = ref<ShownScheme>("dark");
// the puck starts in an empty corner: bottom left beside the panel, or top right on a phone
const puck = reactive(innerWidth > 760 ? { x: 40, y: innerHeight - 120 } : { x: innerWidth - 96, y: 100 });
const playing = ref(true);
const elapsed = ref(84);
const toast = ref<"" | "enter" | "shown" | "leave">("");
const sheetOpen = ref(false);
// the boxes you can drag, and how far each one has been moved from its place in the layout
type Widget = "toolbar" | "hero" | "player";
const home = (): Record<Widget, Point> => ({ toolbar: { x: 0, y: 0 }, hero: { x: 0, y: 0 }, player: { x: 0, y: 0 } });
const offsets = ref(home());
const moved = computed(() => Object.values(offsets.value).some((p) => p.x !== 0 || p.y !== 0));

const tintColour = computed(() => TINTS[tint.value]?.rgba ?? null);
// one material object for the surfaces, made again only when a setting changes
const fringes = computed(() => fringeMaterial(rim.value, layer.value, presetMargin(preset.value, SURFACE_SIDE)));
const accentColour = computed(() => ACCENTS[accent.value]?.rgb ?? ACCENTS[0].rgb);
const clock = (s: number): string => Math.floor(s / 60) + ":" + String(Math.floor(s % 60)).padStart(2, "0");

function step(by: number): void {
    preset.value = PRESETS[(PRESETS.indexOf(preset.value) + by + PRESETS.length) % PRESETS.length] ?? preset.value;
}
function chooseWallpaper(id: string): void {
    wallpaper.value = id;
    backdrop.value = screenBackdrop(id);
    // each wallpaper comes with the appearance that suits it; the buttons can still change it
    appearance.value = BACKDROPS.find((b) => b.id === id)?.scheme ?? "auto";
}
function toggleFollow(): void {
    follow.value = !follow.value;
    if (!follow.value) angle.value = 0;
}

// the wallpaper is painted for the window, so paint it again once a resize settles
let resizeTimer = 0;
function resized(): void {
    clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => { backdrop.value = screenBackdrop(wallpaper.value); }, 150);
}
// the lights turn toward the pointer, as a tilted screen would turn them
function aim(e: PointerEvent): void {
    if (!follow.value) return;
    const a = Math.atan2(e.clientX - innerWidth / 2, innerHeight / 2 - e.clientY) + Math.PI / 4;
    angle.value = Math.round(((a * 180 / Math.PI + 540) % 360) - 180);
}
onMounted(() => { addEventListener("resize", resized); addEventListener("pointermove", aim); });
onBeforeUnmount(() => { removeEventListener("resize", resized); removeEventListener("pointermove", aim); clearTimeout(resizeTimer); });

watchEffect(() => { document.documentElement.style.setProperty("--accent", cssColor(accentColour.value)); });

watchEffect((onCleanup) => {
    if (!playing.value) return;
    const timer = setInterval(() => { elapsed.value = (elapsed.value + 1) % SONG_LENGTH; }, 1000);
    onCleanup(() => clearInterval(timer));
});

// the notification is made hidden and shown a frame later, so its glass materializes; it leaves on its own
watch(toast, (v, _old, onCleanup) => {
    if (v === "enter") { const f = requestAnimationFrame(() => { toast.value = "shown"; }); onCleanup(() => cancelAnimationFrame(f)); }
    if (v === "shown") { const t = setTimeout(() => { toast.value = "leave"; }, 4200); onCleanup(() => clearTimeout(t)); }
    if (v === "leave") { const t = setTimeout(() => { toast.value = ""; }, 450); onCleanup(() => clearTimeout(t)); }
});
function notify(): void {
    if (toast.value === "") toast.value = "enter";
}

// a widget moves by a CSS translation; its glass measures the box on every frame (`everyFrame`), so it keeps up
function grab(key: Widget, e: PointerEvent): void {
    drag(e, offsets.value[key], (to) => { offsets.value[key] = to; });
}
function grabPuck(e: PointerEvent): void {
    drag(e, puck, (to) => { puck.x = to.x; puck.y = to.y; });
}
function resetLayout(): void {
    offsets.value = home();
}
const shift = (p: Point): { translate: string } => ({ translate: `${p.x}px ${p.y}px` });
</script>

<template>
    <GlassCanvas :backdrop="backdrop" :appearance="appearance" :light-angle="angle * Math.PI / 180" :accent="accentColour" :active="!env.inactive"
        :tinted="env.tinted" :button-shapes="env.buttonShapes" :reduce-transparency="env.reduceTransparency ? true : 'auto'"
        :increase-contrast="env.increaseContrast ? true : 'auto'" :reduce-motion="env.reduceMotion ? true : 'auto'">
        <main class="stage">
            <!-- one piece of glass for three boxes: neighbours closer than `spacing` flow into each other -->
            <GlassGroup :spacing="24" :preset="preset" :tint="tintColour" :material="fringes">
                <nav class="toolbar draggable" aria-label="Material" :style="shift(offsets.toolbar)" @pointerdown="grab('toolbar', $event)">
                    <Glass class="tool" every-frame><button aria-label="Previous material" @click="step(-1)"><Icon name="left" /></button></Glass>
                    <Glass class="tool wide" every-frame><button @click="step(1)"><Icon name="layers" />{{ preset }}</button></Glass>
                    <Glass class="tool" every-frame><button aria-label="Next material" @click="step(1)"><Icon name="right" /></button></Glass>
                </nav>
            </GlassGroup>

            <div class="scene">
                <Glass class="hero draggable" :radius="30" :preset="preset" :tint="tintColour" :material="fringes" :visible="cardShown" every-frame
                    :style="shift(offsets.hero)" @pointerdown="grab('hero', $event)">
                    <div class="fade" :class="{ gone: !cardShown }">
                        <span class="eyebrow">Vue components</span>
                        <h1>Glass that follows your layout.</h1>
                        <p>
                            Every surface here is an ordinary element. <code>&lt;Glass&gt;</code> draws refractive glass under its box on one
                            shared WebGL2 canvas and keeps it there as the page lays out, scrolls and resizes. Drag a card to move it.
                        </p>
                        <div class="actions">
                            <Glass class="cta" interactive preset="prominent" :radius="24" :visible="cardShown" every-frame>
                                <button type="button" @click="notify"><Icon name="bell" />Show a notification</button>
                            </Glass>
                            <Glass class="cta" interactive :preset="preset" :radius="24" :visible="cardShown" every-frame>
                                <a :href="GUIDE" target="_blank" rel="noreferrer"><Icon name="book" />API guide</a>
                            </Glass>
                        </div>
                    </div>
                </Glass>

                <Glass class="player draggable" :radius="26" :preset="preset" :tint="tintColour" :material="fringes" every-frame
                    :style="shift(offsets.player)" @pointerdown="grab('player', $event)">
                    <div class="player-top">
                        <div class="art"><Icon name="music" /></div>
                        <div class="track"><b>Under the Lens</b><span>The Rim Lights</span></div>
                    </div>
                    <div class="progress"><i :style="{ width: (elapsed / SONG_LENGTH) * 100 + '%' }" /></div>
                    <div class="times"><span>{{ clock(elapsed) }}</span><span>-{{ clock(SONG_LENGTH - elapsed) }}</span></div>
                    <div class="transport">
                        <button aria-label="Previous" @click="elapsed = 0"><Icon name="previous" /></button>
                        <button class="main" :aria-label="playing ? 'Pause' : 'Play'" @click="playing = !playing">
                            <Icon :name="playing ? 'pause' : 'play'" />
                        </button>
                        <button aria-label="Next" @click="elapsed = 0"><Icon name="next" /></button>
                    </div>
                </Glass>
            </div>
        </main>

        <!-- small glass takes the scheme of what is behind it: drag it over light and dark parts of the wallpaper -->
        <Glass class="puck" every-frame :style="{ left: puck.x + 'px', top: puck.y + 'px' }" @scheme="puckScheme = $event"
            @pointerdown="grabPuck">
            <span>{{ puckScheme }}</span>
        </Glass>

        <Glass v-if="toast !== ''" :class="toast === 'leave' ? 'toast leaving' : 'toast'" preset="notification" :radius="22" every-frame
            :visible="toast === 'shown'" role="status">
            <div class="art"><Icon name="sparkle" /></div>
            <div>
                <b>GlassRender <small>now</small></b>
                <p>This notification moves with a CSS animation; <code>everyFrame</code> keeps its glass underneath.</p>
            </div>
        </Glass>

        <Glass :class="sheetOpen ? 'inspector open' : 'inspector'" preset="inspector" :radius="26" @scheme="panelScheme = $event"
            :data-scheme="panelScheme" role="complementary" aria-label="Settings">
            <header class="panel-head">
                <div class="brand-mark"><Icon name="logo" /></div>
                <div class="brand">
                    <div class="brand-name">GlassRender</div>
                    <div class="brand-sub">Component demo</div>
                </div>
                <span class="badge">Vue</span>
                <button class="btn ghost icon-only sheet-toggle" :aria-expanded="sheetOpen" :aria-label="sheetOpen ? 'Hide settings' : 'Show settings'"
                    @click="sheetOpen = !sheetOpen"><Icon name="down" /></button>
            </header>

            <div class="inspector-scroll">
                <section class="section">
                    <h2 class="section-title">Scene</h2>
                    <div class="field">
                        <span class="label">Appearance</span>
                        <div class="seg">
                            <button v-for="a in APPEARANCES" :key="a.value" :aria-pressed="appearance === a.value" @click="appearance = a.value">
                                <Icon :name="a.icon" />{{ a.label }}
                            </button>
                        </div>
                    </div>
                    <div class="field stack">
                        <span class="label">Backdrop</span>
                        <div class="thumbs">
                            <button v-for="b in BACKDROPS" :key="b.id" class="thumb" :aria-pressed="wallpaper === b.id" :aria-label="b.name + ' backdrop'"
                                :title="b.name" :style="{ backgroundImage: `url(${backdropThumbnail(b.id)})` }" @click="chooseWallpaper(b.id)" />
                        </div>
                    </div>
                    <div class="field">
                        <span class="label">Accent</span>
                        <div class="swatches">
                            <button v-for="(a, i) in ACCENTS" :key="a.name" class="swatch" :aria-pressed="accent === i" :aria-label="a.name + ' accent'"
                                :title="a.name" :style="{ '--c': cssColor(a.rgb) }" @click="accent = i" />
                        </div>
                    </div>
                    <div class="field">
                        <span class="label">Light</span>
                        <div class="inline">
                            <div class="range">
                                <input v-model.number="angle" type="range" min="-180" max="180" :disabled="follow" aria-label="Light angle"
                                    :style="{ '--p': ((angle + 180) / 360) * 100 + '%' }">
                                <output>{{ angle }}°</output>
                            </div>
                            <button class="btn icon-only" :aria-pressed="follow" aria-label="Light follows the pointer" title="Light follows the pointer"
                                @click="toggleFollow"><Icon name="pointer" /></button>
                        </div>
                    </div>
                </section>

                <section class="section">
                    <h2 class="section-title">Surfaces</h2>
                    <div class="field">
                        <span class="label">Material</span>
                        <div class="inline">
                            <label class="select">
                                <select v-model="preset" aria-label="Material preset">
                                    <option v-for="p in PRESETS" :key="p" :value="p">{{ p }}</option>
                                </select>
                                <Icon name="down" />
                            </label>
                            <button class="btn icon-only" aria-label="Previous material" @click="step(-1)"><Icon name="left" /></button>
                            <button class="btn icon-only" aria-label="Next material" @click="step(1)"><Icon name="right" /></button>
                        </div>
                    </div>
                    <div class="field">
                        <span class="label">Tint</span>
                        <div class="swatches">
                            <button v-for="(t, i) in TINTS" :key="t.name" :class="t.rgba ? 'swatch' : 'swatch none'" :aria-pressed="tint === i"
                                :aria-label="t.name + ' tint'" :title="t.name" :style="t.rgba ? { '--c': cssColor(t.rgba) } : undefined" @click="tint = i" />
                        </div>
                    </div>
                    <div class="toggle-row">
                        <span>Drag the cards to move them</span>
                        <button class="btn" :disabled="!moved" @click="resetLayout">Reset</button>
                    </div>
                    <div class="toggle-row">
                        <span>Show the card</span>
                        <button class="switch" role="switch" :aria-checked="cardShown" aria-label="Show the card" @click="cardShown = !cardShown" />
                    </div>
                </section>

                <section class="section">
                    <h2 class="section-title">Chromatic aberration</h2>
                    <Fringe title="Rim fringes" field="aberration" :value="rim" :fields="RIM_FIELDS" @change="rim = $event" />
                    <Fringe title="Lens layer" field="lens" :value="layer" :fields="LENS_FIELDS" @change="layer = $event" />
                    <pre class="code">{{ materialCode(fringes) }}</pre>
                </section>

                <section class="section">
                    <h2 class="section-title">Environment</h2>
                    <div class="chips">
                        <button v-for="e in ENVIRONMENT" :key="e.key" class="chip" :aria-pressed="env[e.key]" @click="env[e.key] = !env[e.key]">
                            {{ e.label }}
                        </button>
                    </div>
                </section>
            </div>

            <footer class="panel-foot">
                <span class="status">vue/demo/App.vue</span>
                <a class="btn ghost" :href="GUIDE" target="_blank" rel="noreferrer">API guide<Icon name="external" /></a>
            </footer>
        </Glass>
    </GlassCanvas>
</template>
