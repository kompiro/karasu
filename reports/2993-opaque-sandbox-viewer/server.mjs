// Spike #2993: stands in for the nest Worker. Serves the viewer build under a
// page-level CSP sandbox, with the .krs embedded, plus probes for isolation.
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join, extname } from "node:path";

const DIST = new URL("../../packages/app/dist-viewer/", import.meta.url).pathname;
const MODELS = {
  dify: "/workspaces/dify/index.krs",
  small: new URL("../../examples/en/getting-started/index.krs", import.meta.url).pathname,
};
export const log = [];
const TYPES = { ".js": "text/javascript", ".css": "text/css", ".html": "text/html; charset=utf-8" };

const embed = (krs) =>
  `<script type="application/json" id="krs-source">${JSON.stringify(krs)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")}</script>`;

export function start(port, { sandbox = true, assetCors = true, extra = "allow-downloads allow-popups" } = {}) {
  const server = createServer((req, res) => {
    const url = new URL(req.url, `http://localhost:${port}`);
    if (url.pathname === "/set-cookie") {
      res.setHeader("Set-Cookie", "__Host-nest_session=42:secret; Path=/; HttpOnly; Secure; SameSite=Lax");
      res.setHeader("Content-Type", "text/html");
      return res.end("<p>session cookie set</p>");
    }
    if (url.pathname === "/echo") {
      log.push({ method: req.method, origin: req.headers.origin ?? null, cookie: req.headers.cookie ?? null });
      res.setHeader("Content-Type", "text/plain");
      return res.end("ok");
    }
    const view = /^\/g\/(\w+)\/view$/.exec(url.pathname);
    if (view) {
      const model = MODELS[view[1]];
      if (!model || !existsSync(model)) { res.statusCode = 404; return res.end(); }
      const html = readFileSync(join(DIST, "viewer.html"), "utf8").replace("<!--KRS_SOURCE-->", embed(readFileSync(model, "utf8")));
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      if (sandbox) res.setHeader("Content-Security-Policy", `sandbox allow-scripts ${extra}`.trim());
      return res.end(html);
    }
    const file = join(DIST, url.pathname);
    if (url.pathname.startsWith("/assets/") && existsSync(file)) {
      res.setHeader("Content-Type", TYPES[extname(file)] ?? "application/octet-stream");
      if (assetCors) res.setHeader("Access-Control-Allow-Origin", "*");
      return res.end(readFileSync(file));
    }
    res.statusCode = 404;
    res.end();
  });
  return new Promise((resolve) => server.listen(port, () => resolve(server)));
}
