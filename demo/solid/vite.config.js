import { defineConfig } from "vite";
import solid from "vite-plugin-solid";
import { fileURLToPath } from "node:url";

export default defineConfig({
    root: "demo",
    plugins: [solid()],
    resolve: { alias: {
        "glassrender/core": fileURLToPath(new URL("../../src/core.ts", import.meta.url)),
        "glassrender/materials": fileURLToPath(new URL("../../src/materials.ts", import.meta.url)),
        "glassrender/advanced": fileURLToPath(new URL("../../src/advanced.ts", import.meta.url)),
        glassrender: fileURLToPath(new URL("../../src/index.ts", import.meta.url))
    } },
    server: { port: 5177, fs: { allow: [fileURLToPath(new URL("../../", import.meta.url))] } },
    build: { outDir: "../demo-dist", emptyOutDir: true,
        rolldownOptions: { input: { demo: "demo/index.html", quickStart: "demo/quick-start.html" } } }
});
