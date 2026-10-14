import { createSignal } from "solid-js";
import { Glass, GlassCanvas } from "../src/index.js";
import type { Preset } from "glassrender/materials";

export default function QuickStart() {
    const [preset, setPreset] = createSignal<Preset>("standard");
    const next = () => preset() === "standard" ? "clear" : "standard";
    return <GlassCanvas>
        <main style={{ "min-height": "100vh", padding: "24px", "box-sizing": "border-box", display: "grid", "place-items": "center" }}>
            <Glass preset={preset()} radius={24} style={{ width: "320px", "max-width": "100%", padding: "32px", "box-sizing": "border-box" }}>
                <h1>GlassRender</h1><p>Material: <strong>{preset()}</strong>.</p>
                <Glass preset="control" radius={24} interactive>
                    <button type="button" onClick={() => setPreset(next())} style={{ width: "100%", "min-height": "48px", padding: "12px 16px", border: "0", background: "transparent", color: "var(--glass-title)", font: "inherit", cursor: "pointer" }}>
                        Switch to {next()}
                    </button>
                </Glass>
            </Glass>
        </main>
    </GlassCanvas>;
}
