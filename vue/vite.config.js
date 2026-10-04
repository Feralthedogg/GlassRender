import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

// the demo app: vite serves demo/ and takes the components from src/
export default defineConfig({
    root: "demo",
    plugins: [vue()],
    server: { port: 5176 },
    build: { outDir: "../demo-dist", emptyOutDir: true }
});
