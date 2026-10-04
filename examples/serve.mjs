// Static file server for the examples:  node examples/serve.mjs  ->  http://127.0.0.1:5173/examples/
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";

const ROOT = resolve(new URL("..", import.meta.url).pathname);
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".png": "image/png", ".json": "application/json" };
const port = Number(process.env.PORT || 5173);
createServer((req, res) => {
    let path = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (path.endsWith("/")) path += "index.html";
    const file = join(ROOT, path);
    if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
    readFile(file).then((body) => {
        res.writeHead(200, { "content-type": TYPES[extname(file)] || "application/octet-stream", "cache-control": "no-store" });
        res.end(body);
    }, () => { res.writeHead(404); res.end("not found"); });
}).listen(port, "127.0.0.1", () => console.log(`http://127.0.0.1:${port}/examples/`));
