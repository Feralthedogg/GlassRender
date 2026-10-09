import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import { svelte } from "@sveltejs/vite-plugin-svelte";

// Serve demo entries and resolve components from src/lib/.
export default defineConfig({
    root: "demo",
    plugins: [svelte({ configFile: fileURLToPath(new URL("./svelte.config.js", import.meta.url)) })],
    // Resolve the core package from checkout source for both demo entries.
    resolve: {
        alias: {
            "glassrender/core": fileURLToPath(new URL("../../src/core.ts", import.meta.url)),
            "glassrender/materials": fileURLToPath(new URL("../../src/materials.ts", import.meta.url)),
            "glassrender/advanced": fileURLToPath(new URL("../../src/advanced.ts", import.meta.url)),
            glassrender: fileURLToPath(new URL("../../src/index.ts", import.meta.url)),
            "glassrender-svelte": fileURLToPath(new URL("./src/lib/index.ts", import.meta.url))
        }
    },
    server: { port: 5174, fs: { allow: [fileURLToPath(new URL("../../", import.meta.url))] } },
    build: {
        outDir: "../demo-dist", emptyOutDir: true,
        rolldownOptions: { input: { demo: "demo/index.html", quickStart: "demo/quick-start.html" } }
    }
});
