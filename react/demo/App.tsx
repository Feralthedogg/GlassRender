// The component demo: a small page built from glass components, with a panel of settings on the side.
import { useEffect, useMemo, useRef, useState, type PointerEvent, type ReactElement } from "react";
import { PRESET_NAMES, packPreset, presetNumber, type Appearance, type Preset, type ShownScheme } from "glassrender";
import { Glass, GlassCanvas, GlassGroup } from "../src/index.js";
import { BACKDROPS, backdropThumbnail, screenBackdrop } from "../../examples/shared/backdrops.js";
import { icon, type IconName } from "../../examples/shared/icons.js";
import {
    ACCENTS, ENVIRONMENT, LENS_DEFAULT, LENS_FIELDS, RIM_DEFAULT, RIM_FIELDS, TINTS, cssColor, fringeMaterial, materialCode, presetOrder,
    type EnvironmentChoice, type FringeField, type LensFringes, type RimFringes
} from "../../examples/shared/options.js";

const PRESETS: Preset[] = presetOrder(PRESET_NAMES);
const APPEARANCES: { value: Appearance; label: string; icon: IconName }[] = [
    { value: "auto", label: "Auto", icon: "auto" }, { value: "light", label: "Light", icon: "sun" }, { value: "dark", label: "Dark", icon: "moon" }
];
const SONG_LENGTH = 228;
const GUIDE = "https://github.com/Feralthedogg/GlassRender/blob/main/api.md#react-components";
// the largest surface, the card, is about this many points on its short side
const SURFACE_SIDE = 360;
type Environment = Record<EnvironmentChoice["key"], boolean>;

// the capture margin a preset gets on its own (the third info value of its packed block); fringes reach further
const packed = new Float32Array(200), info = new Float32Array(6);
function presetMargin(preset: Preset, side: number): number {
    packPreset(packed, 0, info, 0, Math.max(0, presetNumber(preset)), side, side, 0, 1);
    return info[2] ?? 0;
}

function Icon({ name }: { name: IconName }): ReactElement {
    return <span className="i" dangerouslySetInnerHTML={{ __html: icon(name) }} />;
}

// a switch for one kind of colour fringes, with its sliders while it is on
function Fringe<T extends RimFringes | LensFringes>({ title, field, value, fields, onChange }: {
    title: string; field: string; value: T; fields: readonly FringeField<Exclude<keyof T, "on"> & string>[]; onChange: (value: T) => void;
}): ReactElement {
    return (
        <>
            <div className="toggle-row">
                <span>{title} <code>{field}</code></span>
                <button className="switch" role="switch" aria-checked={value.on} aria-label={title} onClick={() => onChange({ ...value, on: !value.on })} />
            </div>
            {value.on && (
                <div className="sub">
                    {fields.map((f) => {
                        const v = value[f.key] as number;
                        return (
                            <div key={f.key} className="field" title={f.hint}>
                                <span className="label">{f.label}</span>
                                <div className="range">
                                    <input type="range" min={f.min} max={f.max} step={f.step} value={v} aria-label={title + " " + f.label}
                                        style={{ ["--p" as string]: ((v - f.min) / (f.max - f.min)) * 100 + "%" }}
                                        onChange={(e) => onChange({ ...value, [f.key]: Number(e.target.value) })} />
                                    <output>{v}{f.unit}</output>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </>
    );
}

const clock = (s: number): string => Math.floor(s / 60) + ":" + String(Math.floor(s % 60)).padStart(2, "0");

export function App(): ReactElement {
    // scene
    const [wallpaper, setWallpaper] = useState(BACKDROPS[0].id);
    const [backdrop, setBackdrop] = useState(() => screenBackdrop(BACKDROPS[0].id));
    const [appearance, setAppearance] = useState<Appearance>(BACKDROPS[0].scheme);
    const [accent, setAccent] = useState(0);
    const [angle, setAngle] = useState(0);
    const [follow, setFollow] = useState(false);
    // surfaces
    const [preset, setPreset] = useState<Preset>("standard");
    const [tint, setTint] = useState(0);
    const [cardShown, setCardShown] = useState(true);
    const [rim, setRim] = useState<RimFringes>(RIM_DEFAULT);
    const [layer, setLayer] = useState<LensFringes>(LENS_DEFAULT);
    const [env, setEnv] = useState<Environment>({
        inactive: false, tinted: false, reduceTransparency: false, increaseContrast: false, reduceMotion: false, buttonShapes: false
    });
    // what the glass reports back, and the page itself
    const [panelScheme, setPanelScheme] = useState<ShownScheme>("dark");
    const [puckScheme, setPuckScheme] = useState<ShownScheme>("dark");
    // the puck starts in an empty corner: bottom left beside the panel, or top right on a phone
    const [puck, setPuck] = useState(() => (innerWidth > 760 ? { x: 40, y: innerHeight - 120 } : { x: innerWidth - 96, y: 100 }));
    const [playing, setPlaying] = useState(true);
    const [elapsed, setElapsed] = useState(84);
    const [toast, setToast] = useState<"" | "enter" | "shown" | "leave">("");
    const [sheetOpen, setSheetOpen] = useState(false);
    const drag = useRef({ on: false, dx: 0, dy: 0 });

    const tintColour = TINTS[tint]?.rgba ?? null;
    // one material object for the surfaces, made again only when a setting changes
    const fringes = useMemo(() => fringeMaterial(rim, layer, presetMargin(preset, SURFACE_SIDE)), [rim, layer, preset]);
    const step = (by: number): void => setPreset((p) => PRESETS[(PRESETS.indexOf(p) + by + PRESETS.length) % PRESETS.length] ?? p);
    const chooseWallpaper = (id: string): void => {
        setWallpaper(id);
        setBackdrop(screenBackdrop(id));
        // each wallpaper comes with the appearance that suits it; the buttons can still change it
        setAppearance(BACKDROPS.find((b) => b.id === id)?.scheme ?? "auto");
    };

    // the wallpaper is painted for the window, so paint it again once a resize settles
    useEffect(() => {
        let timer = 0;
        const resized = (): void => {
            clearTimeout(timer);
            timer = window.setTimeout(() => setBackdrop(screenBackdrop(wallpaper)), 150);
        };
        addEventListener("resize", resized);
        return () => { removeEventListener("resize", resized); clearTimeout(timer); };
    }, [wallpaper]);

    // the lights turn toward the pointer, as a tilted screen would turn them
    useEffect(() => {
        if (!follow) return;
        const move = (e: globalThis.PointerEvent): void => {
            const a = Math.atan2(e.clientX - innerWidth / 2, innerHeight / 2 - e.clientY) + Math.PI / 4;
            setAngle(Math.round(((a * 180 / Math.PI + 540) % 360) - 180));
        };
        addEventListener("pointermove", move);
        return () => removeEventListener("pointermove", move);
    }, [follow]);

    useEffect(() => { document.documentElement.style.setProperty("--accent", cssColor(ACCENTS[accent]?.rgb ?? [0, 0.478, 1])); }, [accent]);

    useEffect(() => {
        if (!playing) return;
        const timer = setInterval(() => setElapsed((s) => (s + 1) % SONG_LENGTH), 1000);
        return () => clearInterval(timer);
    }, [playing]);

    // the notification is made hidden and shown a frame later, so its glass materializes; it leaves on its own
    useEffect(() => {
        if (toast === "enter") { const f = requestAnimationFrame(() => setToast("shown")); return () => cancelAnimationFrame(f); }
        if (toast === "shown") { const t = setTimeout(() => setToast("leave"), 4200); return () => clearTimeout(t); }
        if (toast === "leave") { const t = setTimeout(() => setToast(""), 450); return () => clearTimeout(t); }
    }, [toast]);

    const grab = (e: PointerEvent<HTMLDivElement>): void => {
        drag.current = { on: true, dx: e.clientX - puck.x, dy: e.clientY - puck.y };
        e.currentTarget.setPointerCapture(e.pointerId);
    };
    const pull = (e: PointerEvent<HTMLDivElement>): void => {
        const d = drag.current;
        if (d.on) setPuck({ x: e.clientX - d.dx, y: e.clientY - d.dy });
    };

    return (
        <GlassCanvas backdrop={backdrop} appearance={appearance} lightAngle={angle * Math.PI / 180} accent={ACCENTS[accent]?.rgb ?? [0, 0.478, 1]}
            active={!env.inactive} tinted={env.tinted} buttonShapes={env.buttonShapes} reduceTransparency={env.reduceTransparency ? true : "auto"}
            increaseContrast={env.increaseContrast ? true : "auto"} reduceMotion={env.reduceMotion ? true : "auto"}>
            <main className="stage">
                {/* one piece of glass for three boxes: neighbours closer than `spacing` flow into each other */}
                <GlassGroup spacing={24} preset={preset} tint={tintColour} material={fringes}>
                    <nav className="toolbar" aria-label="Material">
                        <Glass className="tool"><button aria-label="Previous material" onClick={() => step(-1)}><Icon name="left" /></button></Glass>
                        <Glass className="tool wide"><button onClick={() => step(1)}><Icon name="layers" />{preset}</button></Glass>
                        <Glass className="tool"><button aria-label="Next material" onClick={() => step(1)}><Icon name="right" /></button></Glass>
                    </nav>
                </GlassGroup>

                <div className="scene">
                    <Glass className="hero" radius={30} preset={preset} tint={tintColour} material={fringes} visible={cardShown}>
                        <div className={cardShown ? "fade" : "fade gone"}>
                            <span className="eyebrow">React components</span>
                            <h1>Glass that follows your layout.</h1>
                            <p>
                                Every surface here is an ordinary element. <code>&lt;Glass&gt;</code> draws refractive glass under its box on one
                                shared WebGL2 canvas and keeps it there as the page lays out, scrolls and resizes.
                            </p>
                            <div className="actions">
                                <Glass className="cta" interactive preset="prominent" radius={24} visible={cardShown}>
                                    <button type="button" onClick={() => setToast(toast === "" ? "enter" : toast)}><Icon name="bell" />Show a notification</button>
                                </Glass>
                                <Glass className="cta" interactive preset={preset} radius={24} visible={cardShown}>
                                    <a href={GUIDE} target="_blank" rel="noreferrer"><Icon name="book" />API guide</a>
                                </Glass>
                            </div>
                        </div>
                    </Glass>

                    <Glass className="player" radius={26} preset={preset} tint={tintColour} material={fringes}>
                        <div className="player-top">
                            <div className="art"><Icon name="music" /></div>
                            <div className="track"><b>Under the Lens</b><span>The Rim Lights</span></div>
                        </div>
                        <div className="progress"><i style={{ width: (elapsed / SONG_LENGTH) * 100 + "%" }} /></div>
                        <div className="times"><span>{clock(elapsed)}</span><span>-{clock(SONG_LENGTH - elapsed)}</span></div>
                        <div className="transport">
                            <button aria-label="Previous" onClick={() => setElapsed(0)}><Icon name="previous" /></button>
                            <button className="main" aria-label={playing ? "Pause" : "Play"} onClick={() => setPlaying(!playing)}>
                                <Icon name={playing ? "pause" : "play"} />
                            </button>
                            <button aria-label="Next" onClick={() => setElapsed(0)}><Icon name="next" /></button>
                        </div>
                    </Glass>
                </div>
            </main>

            {/* small glass takes the scheme of what is behind it: drag it over light and dark parts of the wallpaper */}
            <Glass className="puck" everyFrame style={{ left: puck.x, top: puck.y }} onScheme={setPuckScheme}
                onPointerDown={grab} onPointerMove={pull} onPointerUp={() => { drag.current.on = false; }}>
                <span>{puckScheme}</span>
            </Glass>

            {toast !== "" && (
                <Glass className={toast === "leave" ? "toast leaving" : "toast"} preset="notification" radius={22} everyFrame visible={toast === "shown"}
                    role="status">
                    <div className="art"><Icon name="sparkle" /></div>
                    <div>
                        <b>GlassRender <small>now</small></b>
                        <p>This notification moves with a CSS animation; <code>everyFrame</code> keeps its glass underneath.</p>
                    </div>
                </Glass>
            )}

            <Glass className={sheetOpen ? "inspector open" : "inspector"} preset="inspector" radius={26} onScheme={setPanelScheme}
                data-scheme={panelScheme} role="complementary" aria-label="Settings">
                <header className="panel-head">
                    <div className="brand-mark"><Icon name="logo" /></div>
                    <div className="brand">
                        <div className="brand-name">GlassRender</div>
                        <div className="brand-sub">Component demo</div>
                    </div>
                    <span className="badge">React</span>
                    <button className="btn ghost icon-only sheet-toggle" aria-expanded={sheetOpen} aria-label={sheetOpen ? "Hide settings" : "Show settings"}
                        onClick={() => setSheetOpen(!sheetOpen)}><Icon name="down" /></button>
                </header>

                <div className="inspector-scroll">
                    <section className="section">
                        <h2 className="section-title">Scene</h2>
                        <div className="field">
                            <span className="label">Appearance</span>
                            <div className="seg">
                                {APPEARANCES.map((a) => (
                                    <button key={a.value} aria-pressed={appearance === a.value} onClick={() => setAppearance(a.value)}>
                                        <Icon name={a.icon} />{a.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="field stack">
                            <span className="label">Backdrop</span>
                            <div className="thumbs">
                                {BACKDROPS.map((b) => (
                                    <button key={b.id} className="thumb" aria-pressed={wallpaper === b.id} aria-label={b.name + " backdrop"} title={b.name}
                                        style={{ backgroundImage: `url(${backdropThumbnail(b.id)})` }} onClick={() => chooseWallpaper(b.id)} />
                                ))}
                            </div>
                        </div>
                        <div className="field">
                            <span className="label">Accent</span>
                            <div className="swatches">
                                {ACCENTS.map((a, i) => (
                                    <button key={a.name} className="swatch" aria-pressed={accent === i} aria-label={a.name + " accent"} title={a.name}
                                        style={{ ["--c" as string]: cssColor(a.rgb) }} onClick={() => setAccent(i)} />
                                ))}
                            </div>
                        </div>
                        <div className="field">
                            <span className="label">Light</span>
                            <div className="inline">
                                <div className="range">
                                    <input type="range" min={-180} max={180} value={angle} disabled={follow} aria-label="Light angle"
                                        style={{ ["--p" as string]: ((angle + 180) / 360) * 100 + "%" }} onChange={(e) => setAngle(Number(e.target.value))} />
                                    <output>{angle}°</output>
                                </div>
                                <button className="btn icon-only" aria-pressed={follow} aria-label="Light follows the pointer" title="Light follows the pointer"
                                    onClick={() => { setFollow(!follow); if (follow) setAngle(0); }}><Icon name="pointer" /></button>
                            </div>
                        </div>
                    </section>

                    <section className="section">
                        <h2 className="section-title">Surfaces</h2>
                        <div className="field">
                            <span className="label">Material</span>
                            <div className="inline">
                                <label className="select">
                                    <select value={preset} aria-label="Material preset" onChange={(e) => setPreset(e.target.value as Preset)}>
                                        {PRESETS.map((p) => <option key={p} value={p}>{p}</option>)}
                                    </select>
                                    <Icon name="down" />
                                </label>
                                <button className="btn icon-only" aria-label="Previous material" onClick={() => step(-1)}><Icon name="left" /></button>
                                <button className="btn icon-only" aria-label="Next material" onClick={() => step(1)}><Icon name="right" /></button>
                            </div>
                        </div>
                        <div className="field">
                            <span className="label">Tint</span>
                            <div className="swatches">
                                {TINTS.map((t, i) => (
                                    <button key={t.name} className={t.rgba ? "swatch" : "swatch none"} aria-pressed={tint === i} aria-label={t.name + " tint"}
                                        title={t.name} style={t.rgba ? { ["--c" as string]: cssColor(t.rgba) } : undefined} onClick={() => setTint(i)} />
                                ))}
                            </div>
                        </div>
                        <div className="toggle-row">
                            <span>Show the card</span>
                            <button className="switch" role="switch" aria-checked={cardShown} aria-label="Show the card" onClick={() => setCardShown(!cardShown)} />
                        </div>
                    </section>

                    <section className="section">
                        <h2 className="section-title">Chromatic aberration</h2>
                        <Fringe title="Rim fringes" field="aberration" value={rim} fields={RIM_FIELDS} onChange={setRim} />
                        <Fringe title="Lens layer" field="lens" value={layer} fields={LENS_FIELDS} onChange={setLayer} />
                        <pre className="code">{materialCode(fringes)}</pre>
                    </section>

                    <section className="section">
                        <h2 className="section-title">Environment</h2>
                        <div className="chips">
                            {ENVIRONMENT.map((e) => (
                                <button key={e.key} className="chip" aria-pressed={env[e.key]} onClick={() => setEnv({ ...env, [e.key]: !env[e.key] })}>
                                    {e.label}
                                </button>
                            ))}
                        </div>
                    </section>
                </div>

                <footer className="panel-foot">
                    <span className="status">react/demo/App.tsx</span>
                    <a className="btn ghost" href={GUIDE} target="_blank" rel="noreferrer">API guide<Icon name="external" /></a>
                </footer>
            </Glass>
        </GlassCanvas>
    );
}
