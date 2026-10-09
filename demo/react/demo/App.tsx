// The component demo: a small page built from glass components, with a panel of settings on the side.
import { useEffect, useState, type CSSProperties, type PointerEvent, type ReactElement } from "react";
import { DEFAULT_CHROMATIC_ABERRATION, type Appearance, type ShownScheme } from "glassrender/core";
import { MATERIALS, type Preset } from "glassrender/materials";
import { Glass, GlassCanvas, GlassGroup } from "../src/index.js";
import { BACKDROPS, backdropThumbnail, screenBackdrop } from "../../../examples/shared/backdrops.js";
import { drag, type Point } from "../../../examples/shared/drag.js";
import { icon, type IconName } from "../../../examples/shared/icons.js";
import {
    ENVIRONMENT,
    type EnvironmentChoice
} from "../../../examples/shared/options.js";

const PRESETS: Preset[] = MATERIALS.map(material => material.name);
const APPEARANCES: { value: Appearance; label: string; icon: IconName }[] = [
    { value: "auto", label: "Auto", icon: "auto" }, { value: "light", label: "Light", icon: "sun" }, { value: "dark", label: "Dark", icon: "moon" }
];
const SONG_LENGTH = 228;
const GUIDE = "https://github.com/Feralthedogg/GlassRender/blob/main/api.md#react-components";
type Environment = Record<EnvironmentChoice["key"], boolean>;
// the boxes you can drag, and how far each one has been moved from its place in the layout
type Widget = "toolbar" | "hero" | "player";
const HOME: Record<Widget, Point> = { toolbar: { x: 0, y: 0 }, hero: { x: 0, y: 0 }, player: { x: 0, y: 0 } };
const shift = (p: Point): CSSProperties => ({ translate: `${p.x}px ${p.y}px` });

function Icon({ name }: { name: IconName }): ReactElement {
    return <span className="i" dangerouslySetInnerHTML={{ __html: icon(name) }} />;
}

const clock = (s: number): string => Math.floor(s / 60) + ":" + String(Math.floor(s % 60)).padStart(2, "0");

export function App(): ReactElement {
    // scene
    const [wallpaper, setWallpaper] = useState(BACKDROPS[0].id);
    const [backdrop, setBackdrop] = useState(() => screenBackdrop(BACKDROPS[0].id));
    const [appearance, setAppearance] = useState<Appearance>(BACKDROPS[0].scheme);
    // surfaces
    const [preset, setPreset] = useState<Preset>("standard");
    const [chromatic, setChromatic] = useState(DEFAULT_CHROMATIC_ABERRATION);
    const [cardShown, setCardShown] = useState(true);
    const [env, setEnv] = useState<Environment>({
        inactive: false, tinted: false, reduceTransparency: false, increaseContrast: false, reduceMotion: false, buttonShapes: false
    });
    // what the glass reports back, and the page itself
    const [panelScheme, setPanelScheme] = useState<ShownScheme>("dark");
    const [puckScheme, setPuckScheme] = useState<ShownScheme>("dark");
    // the puck starts in an empty corner: bottom left beside the panel, or top right on a phone
    const [puck, setPuck] = useState(() => (innerWidth > 760 ? { x: 40, y: innerHeight - 120 } : { x: innerWidth - 96, y: 100 }));
    const [lens, setLens] = useState(() => ({ x: Math.max(24, innerWidth - (innerWidth > 760 ? 352 : 16) - 217), y: Math.max(64, innerHeight * .36 - 96) }));
    const [playing, setPlaying] = useState(true);
    const [elapsed, setElapsed] = useState(84);
    const [toast, setToast] = useState<"" | "enter" | "shown" | "leave">("");
    const [sheetOpen, setSheetOpen] = useState(false);
    const [offsets, setOffsets] = useState(HOME);

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

    // a widget moves by a CSS translation; its glass measures the box on every frame (`everyFrame`), so it keeps up
    const grab = (key: Widget) => (e: PointerEvent<HTMLElement>): void => drag(e, offsets[key], (to) => setOffsets((o) => ({ ...o, [key]: to })));
    const moved = Object.values(offsets).some((p) => p.x !== 0 || p.y !== 0);

    return (
        <GlassCanvas backdrop={backdrop} appearance={appearance} chromaticAberration={chromatic}
            active={!env.inactive} tinted={env.tinted} buttonShapes={env.buttonShapes} reduceTransparency={env.reduceTransparency ? true : "auto"}
            increaseContrast={env.increaseContrast ? true : "auto"} reduceMotion={env.reduceMotion ? true : "auto"}>
            <main className="stage">
                {/* one piece of glass for three boxes: neighbours closer than `spacing` flow into each other */}
                <GlassGroup spacing={24} preset={preset}>
                    <nav className="toolbar draggable" aria-label="Material" style={shift(offsets.toolbar)} onPointerDown={grab("toolbar")}>
                        <Glass className="tool" everyFrame><button aria-label="Previous material" onClick={() => step(-1)}><Icon name="left" /></button></Glass>
                        <Glass className="tool wide" everyFrame><button onClick={() => step(1)}><Icon name="layers" />{preset}</button></Glass>
                        <Glass className="tool" everyFrame><button aria-label="Next material" onClick={() => step(1)}><Icon name="right" /></button></Glass>
                    </nav>
                </GlassGroup>

                <div className="scene">
                    <Glass className="hero draggable" radius={30} preset={preset} visible={cardShown} everyFrame
                        style={shift(offsets.hero)} onPointerDown={grab("hero")}>
                        <div className={cardShown ? "fade" : "fade gone"}>
                            <span className="eyebrow">React components</span>
                            <h1>Glass that follows your layout.</h1>
                            <p>
                                Every surface here is an ordinary element. <code>&lt;Glass&gt;</code> draws refractive glass under its box on one
                                shared WebGL2 canvas and keeps it there as the page lays out, scrolls and resizes. Drag a card to move it.
                            </p>
                            <div className="actions">
                                <Glass className="cta" interactive preset="standard" radius={24} visible={cardShown} everyFrame>
                                    <button type="button" onClick={() => setToast(toast === "" ? "enter" : toast)}><Icon name="bell" />Show a notification</button>
                                </Glass>
                                <Glass className="cta" interactive preset={preset} radius={24} visible={cardShown} everyFrame>
                                    <a href={GUIDE} target="_blank" rel="noreferrer"><Icon name="book" />API guide</a>
                                </Glass>
                            </div>
                        </div>
                    </Glass>

                    <Glass className="player draggable" radius={26} preset={preset} everyFrame
                        style={shift(offsets.player)} onPointerDown={grab("player")}>
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

            <Glass className="lens-demo" preset="control" everyFrame style={{ left: lens.x, top: lens.y }}
                aria-label="Color separation lens" onPointerDown={(e) => drag(e, lens, setLens)}>
                <span className="lens-label">Color lens · control<small>Drag across sharp edges</small></span>
            </Glass>

            {/* small glass takes the scheme of what is behind it: drag it over light and dark parts of the wallpaper */}
            <Glass className="puck" everyFrame style={{ left: puck.x, top: puck.y }} onScheme={setPuckScheme}
                onPointerDown={(e) => drag(e, puck, setPuck)}>
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
                            <span className="label">Color split</span>
                            <div className="range">
                                <input type="range" min="0" max="100" aria-label="Chromatic aberration"
                                    value={Math.round(chromatic * 100)} style={{ "--p": chromatic * 100 + "%" } as CSSProperties}
                                    onChange={(e) => setChromatic(Number(e.target.value) / 100)} />
                                <output>{Math.round(chromatic * 100)}%</output>
                            </div>
                        </div>
                        <div className="toggle-row">
                            <span>Drag the cards to move them</span>
                            <button className="btn" disabled={!moved} onClick={() => setOffsets(HOME)}>Reset</button>
                        </div>
                        <div className="toggle-row">
                            <span>Show the card</span>
                            <button className="switch" role="switch" aria-checked={cardShown} aria-label="Show the card" onClick={() => setCardShown(!cardShown)} />
                        </div>
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
                    <span className="status">demo/react/demo/App.tsx</span>
                    <a className="btn ghost" href={GUIDE} target="_blank" rel="noreferrer">API guide<Icon name="external" /></a>
                </footer>
            </Glass>
        </GlassCanvas>
    );
}
