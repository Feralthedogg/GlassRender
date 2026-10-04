<script setup lang="ts">
import { onBeforeUnmount, onMounted, reactive, ref } from "vue";
import { PRESET_NAMES, type Appearance, type Preset, type Rgba, type ShownScheme } from "glassrender";
import { Glass, GlassCanvas, GlassGroup } from "../src/index.js";

// a painted backdrop: soft colour fields, a few discs and lines of text, so refraction and blur show
function paint(): HTMLCanvasElement {
    const c = document.createElement("canvas");
    c.width = 2400; c.height = 1600;
    const g = c.getContext("2d") as CanvasRenderingContext2D;
    let seed = 7;
    const rnd = (): number => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    const bg = g.createLinearGradient(0, 0, c.width, c.height);
    bg.addColorStop(0, "#1b3a5c"); bg.addColorStop(0.5, "#5a2d6e"); bg.addColorStop(1, "#c4553a");
    g.fillStyle = bg; g.fillRect(0, 0, c.width, c.height);
    for (let i = 0; i < 26; i++) {
        const x = rnd() * c.width, y = rnd() * c.height, r = 80 + rnd() * 360;
        const fill = g.createRadialGradient(x, y, 0, x, y, r);
        fill.addColorStop(0, `hsla(${rnd() * 360}, 85%, ${45 + rnd() * 35}%, 0.9)`);
        fill.addColorStop(1, "hsla(0, 0%, 0%, 0)");
        g.fillStyle = fill; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
    }
    g.fillStyle = "rgba(255,255,255,.85)"; g.font = "600 46px system-ui, sans-serif";
    for (let i = 0; i < 18; i++) g.fillText("GlassRender  유리 재질 렌더러  0123456789", 40 + (i % 3) * 90, 90 + i * 88);
    return c;
}

const PRESETS: Preset[] = [...PRESET_NAMES];
const APPEARANCES: [Appearance, string][] = [["auto", "자동"], ["dark", "어둡게"], ["light", "밝게"]];
const TINT: Rgba = [0.15, 0.5, 1, 0.55];

const backdrop = paint();
const appearance = ref<Appearance>("auto");
const preset = ref<Preset>("standard");
const coloured = ref(false);
const cardShown = ref(true);
// surroundings of the built-in materials
const inactive = ref(false);
const tintedSetting = ref(false);
const opaque = ref(false);
const contrast = ref(false);
const still = ref(false);
const puckScheme = ref<ShownScheme>("dark");
const followLight = ref(false);
const lightAngle = ref(0);
const puck = reactive({ x: 120, y: 420 });
let dragging = false, dx = 0, dy = 0;

function move(e: PointerEvent): void {
    if (!followLight.value) return;
    // the lights turn toward the pointer, as a tilted screen would turn them
    lightAngle.value = Math.atan2(e.clientX - innerWidth / 2, innerHeight / 2 - e.clientY) + Math.PI / 4;
}
onMounted(() => addEventListener("pointermove", move));
onBeforeUnmount(() => removeEventListener("pointermove", move));

function grab(e: PointerEvent): void {
    dragging = true; dx = e.clientX - puck.x; dy = e.clientY - puck.y;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
}
function drag(e: PointerEvent): void {
    if (dragging) { puck.x = e.clientX - dx; puck.y = e.clientY - dy; }
}
function toggleLight(): void {
    followLight.value = !followLight.value;
    if (!followLight.value) lightAngle.value = 0;
}
</script>

<template>
    <GlassCanvas :backdrop="backdrop" :appearance="appearance" :light-angle="lightAngle" :active="!inactive" :tinted="tintedSetting"
        :reduce-transparency="opaque ? true : 'auto'" :increase-contrast="contrast ? true : 'auto'" :reduce-motion="still ? true : 'auto'">
        <main>
            <GlassGroup :spacing="18" :preset="preset">
                <nav class="toolbar">
                    <Glass class="tool"><span>◀</span></Glass>
                    <Glass class="tool"><span>▶</span></Glass>
                    <Glass class="tool"><span>＋</span></Glass>
                    <Glass class="tool wide"><span>공유</span></Glass>
                </nav>
            </GlassGroup>

            <Glass class="card" :radius="28" :preset="preset" :tint="coloured ? TINT : null" :visible="cardShown">
                <div class="fade" :class="{ gone: !cardShown }">
                    <h1>GlassRender</h1>
                    <p>배경을 굴절하고 흐리게 하는 유리 재질 렌더러입니다. 이 카드와 버튼은 DOM 요소이고, 유리는 그 상자를 따라 캔버스에 그려집니다.</p>
                    <div class="row">
                        <Glass class="button primary" interactive preset="prominent" :visible="cardShown">확인</Glass>
                        <Glass class="button" interactive :preset="preset" :visible="cardShown">취소</Glass>
                    </div>
                </div>
            </Glass>

            <Glass class="panel" :radius="22" :preset="preset">
                <div class="controls">
                    <span>외관</span>
                    <button v-for="[a, label] in APPEARANCES" :key="a" :class="{ on: appearance === a }" @click="appearance = a">{{ label }}</button>
                    <span>재질</span>
                    <select v-model="preset">
                        <option v-for="p in PRESETS" :key="p" :value="p">{{ p }}</option>
                    </select>
                    <button :class="{ on: coloured }" @click="coloured = !coloured">틴트</button>
                    <button :class="{ on: !cardShown }" @click="cardShown = !cardShown">카드 {{ cardShown ? "숨기기" : "보이기" }}</button>
                    <button :class="{ on: followLight }" @click="toggleLight">빛이 포인터를 따라감</button>
                    <span>환경</span>
                    <button :class="{ on: inactive }" @click="inactive = !inactive">비활성 창</button>
                    <button :class="{ on: tintedSetting }" @click="tintedSetting = !tintedSetting">틴트 설정</button>
                    <button :class="{ on: opaque }" @click="opaque = !opaque">투명도 줄이기</button>
                    <button :class="{ on: contrast }" @click="contrast = !contrast">대비 증가</button>
                    <button :class="{ on: still }" @click="still = !still">동작 줄이기</button>
                </div>
            </Glass>

            <Glass class="puck" every-frame :style="{ left: puck.x + 'px', top: puck.y + 'px' }" @scheme="puckScheme = $event"
                @pointerdown="grab" @pointermove="drag" @pointerup="dragging = false">
                <span>{{ puckScheme === "dark" ? "끌기" : "밝음" }}</span>
            </Glass>
        </main>
    </GlassCanvas>
</template>

<style>
main { min-height: 100vh; padding: 28px; box-sizing: border-box; display: flex; flex-direction: column; align-items: center; gap: 28px; }
.toolbar { display: flex; gap: 12px; }
.tool { width: 44px; height: 44px; display: grid; place-items: center; user-select: none; }
.tool.wide { width: 84px; }
.card { width: min(560px, 90vw); padding: 26px 30px; box-sizing: border-box; }
.card h1 { margin: 0 0 8px; font-size: 30px; }
.card p { margin: 0 0 18px; }
.row { display: flex; gap: 14px; }
.fade { transition: opacity .5s; }
.fade.gone { opacity: 0; }
.button { padding: 10px 26px; user-select: none; cursor: pointer; color: var(--glass-title); }
.button.primary { font-weight: 600; }
.panel { padding: 14px 18px; max-width: min(900px, 94vw); }
.controls { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.controls span { opacity: .8; margin: 0 4px 0 10px; }
.controls button, .controls select { font: inherit; color: inherit; background: rgba(127, 127, 127, .18); border: 0; border-radius: 999px; padding: 6px 14px; cursor: pointer; }
.controls button.on { background: rgba(127, 127, 127, .45); }
.puck { position: fixed; width: 56px; height: 56px; display: grid; place-items: center; cursor: grab; touch-action: none; user-select: none; font-size: 13px; }
</style>
