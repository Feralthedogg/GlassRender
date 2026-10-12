// Headless Chrome for the browser tests and the benchmark: serves the repository over HTTP, opens one page and
// evaluates expressions in it over the DevTools protocol. No dependencies; Chrome is found through the CHROME
// environment variable or at its usual places.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { extname, join, resolve } from "node:path";

const ROOT = resolve(new URL("..", import.meta.url).pathname);
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".png": "image/png", ".json": "application/json" };
const PLACES = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
];

// Switches from the CHROME_FLAGS environment variable, for example a software renderer on a machine without a GPU.
function extraFlags() {
    return (process.env.CHROME_FLAGS ?? "").split(" ").filter((flag) => flag !== "");
}

function findChrome() {
    const named = process.env.CHROME;
    if (named) return named;
    for (const p of PLACES) if (existsSync(p)) return p;
    throw new Error("Chrome not found: set the CHROME environment variable to its executable");
}

/**
 * Open `path` (relative to the repository) in headless Chrome and call `run` with an `evaluate(expression)` function
 * that awaits the expression in the page and returns its JSON value. The callback also receives a page-scoped
 * DevTools command function for dispatched input. `flags` are extra Chrome switches.
 */
export async function withPage(path, run, flags = []) {
    const server = createServer((req, res) => {
        const file = join(ROOT, decodeURIComponent(new URL(req.url, "http://x").pathname));
        if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
        readFile(file).then((body) => {
            res.writeHead(200, { "content-type": TYPES[extname(file)] || "application/octet-stream", "cache-control": "no-store" });
            res.end(body);
        }, () => { res.writeHead(404); res.end(); });
    });
    await new Promise((done) => server.listen(0, "127.0.0.1", done));
    const port = server.address().port;
    const profile = await mkdtemp(join(tmpdir(), "glass-chrome-"));
    const chrome = spawn(findChrome(), ["--headless=new", "--remote-debugging-port=0", "--user-data-dir=" + profile, "--no-first-run",
        "--disable-extensions", "--enable-gpu", "--ignore-gpu-blocklist", ...extraFlags(), ...flags, "about:blank"], { stdio: ["ignore", "ignore", "pipe"] });
    try {
        const wsUrl = await new Promise((done, fail) => {
            let text = "";
            chrome.stderr.on("data", (chunk) => {
                text += chunk;
                const m = /DevTools listening on (ws:\/\/\S+)/.exec(text);
                if (m) done(m[1]);
            });
            chrome.on("exit", () => fail(new Error("Chrome exited: " + text.slice(-400))));
        });
        let nextId = 1;
        const pending = new Map(), ws = new WebSocket(wsUrl);
        await new Promise((done) => ws.addEventListener("open", done));
        ws.addEventListener("message", (event) => {
            const msg = JSON.parse(event.data), slot = pending.get(msg.id);
            if (slot === undefined) return;
            pending.delete(msg.id);
            if (msg.error) slot.fail(new Error(JSON.stringify(msg.error))); else slot.done(msg.result);
        });
        const send = (method, params = {}, sessionId) => new Promise((done, fail) => {
            const id = nextId++;
            pending.set(id, { done, fail });
            ws.send(JSON.stringify({ id, method, params, sessionId }));
        });
        const { targetId } = await send("Target.createTarget", { url: `http://127.0.0.1:${port}/${path}` });
        const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
        const evaluate = async (expression) => {
            const out = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }, sessionId);
            if (out.exceptionDetails) throw new Error(JSON.stringify(out.exceptionDetails).slice(0, 2000));
            return out.result.value;
        };
        for (let k = 0; k < 100 && !(await evaluate("window.__ready === true")); k++) await new Promise((r) => setTimeout(r, 100));
        const result = await run(evaluate, (method, params = {}) => send(method, params, sessionId));
        ws.close();
        return result;
    } finally {
        chrome.kill();
        server.close();
        await rm(profile, { recursive: true, force: true, maxRetries: 3 }).catch(() => undefined);
    }
}
