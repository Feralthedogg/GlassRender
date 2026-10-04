import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// the demo app: vite serves demo/ and takes the components from src/
export default defineConfig({
    root: "demo",
    plugins: [react()],
    server: { port: 5175 },
    build: { outDir: "../demo-dist", emptyOutDir: true }
});
