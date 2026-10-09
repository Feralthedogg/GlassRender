import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { Glass, GlassCanvas } from "glassrender-react";
import type { Preset } from "glassrender/materials";

const backdrop = "data:image/svg+xml," + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800">' +
    '<rect width="1200" height="800" fill="#163350"/>' +
    '<circle cx="350" cy="300" r="260" fill="#7960e8"/>' +
    '<path d="M0 600L1200 200V800H0Z" fill="#e58c53"/>' +
    '<path d="M0 0L1200 800M0 200L900 800" stroke="white" stroke-width="24"/>' +
    '</svg>'
);

function App() {
    const [preset, setPreset] = useState<Preset>("standard");
    const next = preset === "standard" ? "clear" : "standard";
    return (
        <GlassCanvas backdrop={backdrop}>
            <main style={{ minHeight: "100vh", padding: 24, boxSizing: "border-box", display: "grid", placeItems: "center" }}>
                <Glass preset={preset} radius={24} style={{ width: 320, maxWidth: "100%", padding: 32, boxSizing: "border-box", color: "var(--glass-foreground)" }}>
                    <h1>GlassRender</h1>
                    <p>Material: <strong data-preset>{preset}</strong>.</p>
                    <Glass preset="control" radius={24} interactive>
                        <button type="button" onClick={() => setPreset(next)}
                            style={{ width: "100%", minHeight: 48, padding: "12px 16px", border: 0, background: "transparent", color: "var(--glass-title)", font: "inherit", cursor: "pointer" }}>
                            Switch to {next}
                        </button>
                    </Glass>
                </Glass>
            </main>
        </GlassCanvas>
    );
}

const container = document.getElementById("app");
if (!container) throw new Error("The #app element is missing.");
createRoot(container).render(<StrictMode><App /></StrictMode>);
