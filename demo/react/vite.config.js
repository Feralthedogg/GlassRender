import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";

// Serve demo entries and resolve components from src/.
export default defineConfig({
    root: "demo",
    plugins: [react()],
    resolve: {
        alias: {
            "glassrender/core": fileURLToPath(new URL("../../src/core.ts", import.meta.url)),
            "glassrender/materials": fileURLToPath(new URL("../../src/materials.ts", import.meta.url)),
            "glassrender/advanced": fileURLToPath(new URL("../../src/advanced.ts", import.meta.url)),
            glassrender: fileURLToPath(new URL("../../src/index.ts", import.meta.url))
        }
    },
    server: { port: 5175, fs: { allow: [fileURLToPath(new URL("../../", import.meta.url))] } },
    build: {
        outDir: "../demo-dist", emptyOutDir: true,
        rolldownOptions: { input: { demo: "demo/index.html", quickStart: "demo/quick-start.html" } }
    }
});
