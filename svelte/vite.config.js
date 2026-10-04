import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import { svelte } from "@sveltejs/vite-plugin-svelte";

// the demo app: vite serves demo/ and takes the components from src/lib
export default defineConfig({
    root: "demo",
    plugins: [svelte({ configFile: fileURLToPath(new URL("./svelte.config.js", import.meta.url)) })],
    // Run both demos from the checkout source before the packages are built.
    resolve: {
        alias: {
            glassrender: fileURLToPath(new URL("../src/index.ts", import.meta.url)),
            "glassrender-svelte": fileURLToPath(new URL("./src/lib/index.ts", import.meta.url))
        }
    },
    server: { port: 5174 },
    build: { outDir: "../demo-dist", emptyOutDir: true }
});
