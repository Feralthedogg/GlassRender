<script lang="ts">
    import { Glass, GlassCanvas, GlassGroup } from "../src/lib/index.js";
    import { PRESET_NAMES, type Appearance, type Preset, type Rgba, type ShownScheme } from "glassrender";

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

    const backdrop = paint();
    let appearance: Appearance = $state("auto");
    let preset: Preset = $state("standard");
    let coloured = $state(false);
    let cardShown = $state(true);
    // surroundings of the built-in materials
    let inactive = $state(false);
    let tintedSetting = $state(false);
    let opaque = $state(false);
    let contrast = $state(false);
    let still = $state(false);
    let puckScheme: ShownScheme = $state("dark");
    let followLight = $state(false);
    let lightAngle = $state(0);
    let puck = $state({ x: 120, y: 420 });
    const tint: Rgba = [0.15, 0.5, 1, 0.55];
    const presets: Preset[] = [...PRESET_NAMES];

    function move(e: PointerEvent): void {
        if (!followLight) return;
        // the lights turn toward the pointer, as a tilted screen would turn them
        const a = Math.atan2(e.clientX - innerWidth / 2, innerHeight / 2 - e.clientY);
        lightAngle = a + Math.PI / 4;
    }

    let dragging = false, dx = 0, dy = 0;
    function grab(e: PointerEvent): void {
        dragging = true; dx = e.clientX - puck.x; dy = e.clientY - puck.y;
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    }
    function drag(e: PointerEvent): void {
        if (dragging) puck = { x: e.clientX - dx, y: e.clientY - dy };
    }
</script>

<svelte:window onpointermove={move} />

<GlassCanvas {backdrop} {appearance} {lightAngle} active={!inactive} tinted={tintedSetting}
    reduceTransparency={opaque ? true : "auto"} increaseContrast={contrast ? true : "auto"} reduceMotion={still ? true : "auto"}>
    <main>
        <GlassGroup spacing={18} {preset}>
            <nav class="toolbar">
                <Glass class="tool"><span>◀</span></Glass>
                <Glass class="tool"><span>▶</span></Glass>
                <Glass class="tool"><span>＋</span></Glass>
                <Glass class="tool wide"><span>공유</span></Glass>
            </nav>
        </GlassGroup>

        <Glass class="card" radius={28} {preset} tint={coloured ? tint : null} visible={cardShown}>
            <div class="fade" class:gone={!cardShown}>
                <h1>GlassRender</h1>
                <p>배경을 굴절하고 흐리게 하는 유리 재질 렌더러입니다. 이 카드와 버튼은 DOM 요소이고, 유리는 그 상자를 따라 캔버스에 그려집니다.</p>
                <div class="row">
                    <Glass class="button primary" interactive preset="prominent" visible={cardShown}>확인</Glass>
                    <Glass class="button" interactive {preset} visible={cardShown}>취소</Glass>
                </div>
            </div>
        </Glass>

        <Glass class="panel" radius={22} {preset}>
            <div class="controls">
                <span>외관</span>
                {#each ["auto", "dark", "light"] as a (a)}
                    <button class:on={appearance === a} onclick={() => (appearance = a as Appearance)}>{a === "auto" ? "자동" : a === "dark" ? "어둡게" : "밝게"}</button>
                {/each}
                <span>재질</span>
                <select bind:value={preset}>
                    {#each presets as p (p)}
                        <option value={p}>{p}</option>
                    {/each}
                </select>
                <button class:on={coloured} onclick={() => (coloured = !coloured)}>틴트</button>
                <button class:on={!cardShown} onclick={() => (cardShown = !cardShown)}>카드 {cardShown ? "숨기기" : "보이기"}</button>
                <button class:on={followLight} onclick={() => { followLight = !followLight; if (!followLight) lightAngle = 0; }}>빛이 포인터를 따라감</button>
                <span>환경</span>
                <button class:on={inactive} onclick={() => (inactive = !inactive)}>비활성 창</button>
                <button class:on={tintedSetting} onclick={() => (tintedSetting = !tintedSetting)}>틴트 설정</button>
                <button class:on={opaque} onclick={() => (opaque = !opaque)}>투명도 줄이기</button>
                <button class:on={contrast} onclick={() => (contrast = !contrast)}>대비 증가</button>
                <button class:on={still} onclick={() => (still = !still)}>동작 줄이기</button>
            </div>
        </Glass>

        <Glass class="puck" everyFrame style="left: {puck.x}px; top: {puck.y}px" onscheme={(v) => (puckScheme = v)}
            onpointerdown={grab} onpointermove={drag} onpointerup={() => (dragging = false)}>
            <span>{puckScheme === "dark" ? "끌기" : "밝음"}</span>
        </Glass>
    </main>
</GlassCanvas>

<style>
    main {
        min-height: 100vh;
        padding: 28px;
        box-sizing: border-box;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 28px;
    }
    .toolbar { display: flex; gap: 12px; }
    :global(.tool) { width: 44px; height: 44px; display: grid; place-items: center; user-select: none; }
    :global(.tool.wide) { width: 84px; }
    :global(.card) { width: min(560px, 90vw); padding: 26px 30px; box-sizing: border-box; }
    :global(.card) h1 { margin: 0 0 8px; font-size: 30px; }
    :global(.card) p { margin: 0 0 18px; }
    .row { display: flex; gap: 14px; }
    .fade { transition: opacity .5s; }
    .fade.gone { opacity: 0; }
    :global(.button) { padding: 10px 26px; user-select: none; cursor: pointer; color: var(--glass-title); }
    :global(.button.primary) { font-weight: 600; }
    :global(.panel) { padding: 14px 18px; }
    .controls { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
    .controls span { opacity: .8; margin: 0 4px 0 10px; }
    button, select { font: inherit; color: inherit; background: rgba(127, 127, 127, .18); border: 0; border-radius: 999px; padding: 6px 14px; cursor: pointer; }
    button.on { background: rgba(127, 127, 127, .45); }
    :global(.puck) { position: fixed; width: 56px; height: 56px; display: grid; place-items: center; cursor: grab; touch-action: none; user-select: none; font-size: 13px; }
</style>
