// Frame cost of the build in headless Chrome:  node bench/run.mjs [part of a scene name] [frames]
// Close other GPU-heavy applications first; the numbers are wall-clock times of this machine.
import { withPage } from "../tools/chrome.mjs";

const only = process.argv[2] ?? "", frames = Number(process.argv[3] ?? 300);
const result = await withPage("bench/index.html", (evaluate) => evaluate(`window.__bench(${JSON.stringify(only)}, ${frames})`));
console.log(`${result.width} x ${result.height} target, ${result.frames} frames per scene, ${result.gpu}\n`);
for (const r of result.rows) {
    console.log(r.error ? `${r.name}: error ${r.error}` : `${r.ms.toFixed(3).padStart(8)} ms/frame  (calls ${r.cpu.toFixed(3)} ms)  ${r.name}`);
}
