import { createSignal } from "solid-js";
import { Glass, GlassCanvas, GlassGroup, useGlass } from "../src/index.js";
import type { Preset } from "glassrender/materials";

function State() {
    const state = useGlass();
    return <p class="state">{state?.error || (state?.glass ? "Canvas ready" : "Loading canvas")}</p>;
}

export default function App() {
    const [preset, setPreset] = createSignal<Preset>("standard"), [opacity, setOpacity] = createSignal(1);
    const backdrop = "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="1000"><rect width="1400" height="1000" fill="#142a48"/><circle cx="380" cy="380" r="360" fill="#a567df"/><circle cx="1000" cy="730" r="420" fill="#e7876e"/><path d="M0 160L1400 920M0 450L1200 0" stroke="#c0e7e3" stroke-width="34"/></svg>');
    return <GlassCanvas backdrop={backdrop}>
        <main class="layout">
            <header><p class="eyebrow">GLASSRENDER · SOLID</p><h1>Glass that follows your layout.</h1><State /></header>
            <Glass preset={preset()} opacity={opacity()} radius={32} class="card">
                <h2>Reactive materials</h2><p>Switch the preset or adjust opacity. The same glass handle follows the DOM.</p>
                <div class="controls"><button onClick={() => setPreset(preset() === "standard" ? "clear" : "standard")}>Switch to {preset() === "standard" ? "clear" : "standard"}</button>
                    <label>Opacity <input type="range" min="0" max="1" step="0.05" value={opacity()} onInput={e => setOpacity(Number(e.currentTarget.value))} /></label></div>
            </Glass>
            <GlassGroup spacing={24} preset="control">
                <div class="toolbar"><Glass radius={28} class="tool"><button>Previous</button></Glass><Glass radius={28} class="tool"><button>Play</button></Glass><Glass radius={28} class="tool"><button>Next</button></Glass></div>
            </GlassGroup>
            <Glass preset="control" interactive radius={28} class="press"><button>Press and release</button></Glass>
        </main>
    </GlassCanvas>;
}
