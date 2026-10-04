import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Glass, GlassCanvas } from "glassrender-react";

const backdrop = "data:image/svg+xml," + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800">' +
    '<rect width="1200" height="800" fill="#163350"/>' +
    '<circle cx="350" cy="300" r="260" fill="#7960e8"/>' +
    '<path d="M0 600L1200 200V800H0Z" fill="#e58c53"/>' +
    '<path d="M0 0L1200 800M0 200L900 800" stroke="white" stroke-width="24"/>' +
    '</svg>'
);

function App() {
    return (
        <GlassCanvas backdrop={backdrop}>
            <main style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
                <Glass preset="standard" radius={24} style={{ width: 320, padding: 32 }}>
                    <h1>GlassRender</h1>
                    <p>React local package example.</p>
                </Glass>
            </main>
        </GlassCanvas>
    );
}

const container = document.getElementById("app");
if (!container) throw new Error("The #app element is missing.");
createRoot(container).render(<StrictMode><App /></StrictMode>);
