import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactElement } from "react";
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
const TINT: Rgba = [0.15, 0.5, 1, 0.55];
const APPEARANCES: [Appearance, string][] = [["auto", "자동"], ["dark", "어둡게"], ["light", "밝게"]];

export function App(): ReactElement {
    const backdrop = useMemo(paint, []);
    const [appearance, setAppearance] = useState<Appearance>("auto");
    const [preset, setPreset] = useState<Preset>("standard");
    const [coloured, setColoured] = useState(false);
    const [cardShown, setCardShown] = useState(true);
    // surroundings of the built-in materials
    const [inactive, setInactive] = useState(false);
    const [tintedSetting, setTintedSetting] = useState(false);
    const [opaque, setOpaque] = useState(false);
    const [contrast, setContrast] = useState(false);
    const [still, setStill] = useState(false);
    const [puckScheme, setPuckScheme] = useState<ShownScheme>("dark");
    const [followLight, setFollowLight] = useState(false);
    const [lightAngle, setLightAngle] = useState(0);
    const [puck, setPuck] = useState({ x: 120, y: 420 });
    const drag = useRef({ on: false, dx: 0, dy: 0 });

    useEffect(() => {
        if (!followLight) return;
        // the lights turn toward the pointer, as a tilted screen would turn them
        const move = (e: PointerEvent): void => setLightAngle(Math.atan2(e.clientX - innerWidth / 2, innerHeight / 2 - e.clientY) + Math.PI / 4);
        addEventListener("pointermove", move);
        return () => removeEventListener("pointermove", move);
    }, [followLight]);

    const grab = (e: ReactPointerEvent<HTMLDivElement>): void => {
        drag.current = { on: true, dx: e.clientX - puck.x, dy: e.clientY - puck.y };
        e.currentTarget.setPointerCapture(e.pointerId);
    };
    const move = (e: ReactPointerEvent<HTMLDivElement>): void => {
        const d = drag.current;
        if (d.on) setPuck({ x: e.clientX - d.dx, y: e.clientY - d.dy });
    };

    return (
        <GlassCanvas backdrop={backdrop} appearance={appearance} lightAngle={lightAngle} active={!inactive} tinted={tintedSetting}
            reduceTransparency={opaque ? true : "auto"} increaseContrast={contrast ? true : "auto"} reduceMotion={still ? true : "auto"}>
            <main>
                <GlassGroup spacing={18} preset={preset}>
                    <nav className="toolbar">
                        <Glass className="tool"><span>◀</span></Glass>
                        <Glass className="tool"><span>▶</span></Glass>
                        <Glass className="tool"><span>＋</span></Glass>
                        <Glass className="tool wide"><span>공유</span></Glass>
                    </nav>
                </GlassGroup>

                <Glass className="card" radius={28} preset={preset} tint={coloured ? TINT : null} visible={cardShown}>
                    <div className={cardShown ? "fade" : "fade gone"}>
                        <h1>GlassRender</h1>
                        <p>배경을 굴절하고 흐리게 하는 유리 재질 렌더러입니다. 이 카드와 버튼은 DOM 요소이고, 유리는 그 상자를 따라 캔버스에 그려집니다.</p>
                        <div className="row">
                            <Glass className="button primary" interactive preset="prominent" visible={cardShown}>확인</Glass>
                            <Glass className="button" interactive preset={preset} visible={cardShown}>취소</Glass>
                        </div>
                    </div>
                </Glass>

                <Glass className="panel" radius={22} preset={preset}>
                    <div className="controls">
                        <span>외관</span>
                        {APPEARANCES.map(([a, label]) => (
                            <button key={a} className={appearance === a ? "on" : ""} onClick={() => setAppearance(a)}>{label}</button>
                        ))}
                        <span>재질</span>
                        <select value={preset} onChange={(e) => setPreset(e.target.value as Preset)}>
                            {PRESETS.map((p) => <option key={p} value={p}>{p}</option>)}
                        </select>
                        <button className={coloured ? "on" : ""} onClick={() => setColoured(!coloured)}>틴트</button>
                        <button className={cardShown ? "" : "on"} onClick={() => setCardShown(!cardShown)}>카드 {cardShown ? "숨기기" : "보이기"}</button>
                        <button className={followLight ? "on" : ""} onClick={() => { setFollowLight(!followLight); if (followLight) setLightAngle(0); }}>빛이 포인터를 따라감</button>
                        <span>환경</span>
                        <button className={inactive ? "on" : ""} onClick={() => setInactive(!inactive)}>비활성 창</button>
                        <button className={tintedSetting ? "on" : ""} onClick={() => setTintedSetting(!tintedSetting)}>틴트 설정</button>
                        <button className={opaque ? "on" : ""} onClick={() => setOpaque(!opaque)}>투명도 줄이기</button>
                        <button className={contrast ? "on" : ""} onClick={() => setContrast(!contrast)}>대비 증가</button>
                        <button className={still ? "on" : ""} onClick={() => setStill(!still)}>동작 줄이기</button>
                    </div>
                </Glass>

                <Glass className="puck" everyFrame style={{ left: puck.x, top: puck.y }} onScheme={setPuckScheme}
                    onPointerDown={grab} onPointerMove={move} onPointerUp={() => { drag.current.on = false; }}>
                    <span>{puckScheme === "dark" ? "끌기" : "밝음"}</span>
                </Glass>
            </main>
        </GlassCanvas>
    );
}
