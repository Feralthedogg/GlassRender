// Run the browser tests in headless Chrome:  node test/browser/run.mjs [parts of test names, separated by |]
// Runs the full suite (test/browser/index.html, with the reference data in test/data) where it is present, otherwise the
// public functional suite (test/browser/functional.html). Extra Chrome switches come from CHROME_FLAGS.
import { existsSync } from "node:fs";
import { withPage } from "../../tools/chrome.mjs";

const only = process.argv[2] ?? "";
const page = existsSync(new URL("./cases.mjs", import.meta.url)) ? "test/browser/index.html" : "test/browser/functional.html";
const results = await withPage(page, (evaluate) => evaluate(`window.__run(${JSON.stringify(only)})`));
let failed = 0;
for (const r of results) {
    if (!r.ok) failed++;
    console.log((r.ok ? (r.note ? "-    " : "ok   ") : "FAIL ") + r.name + (r.note ? "\n       " + r.note : ""));
}
console.log(`${results.length} tests, ${failed} failed`);
process.exit(failed === 0 && results.length > 0 ? 0 : 1);
