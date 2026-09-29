# Spike #2993: the app preview as a page-level CSP sandbox (opaque origin)

Question: can the app's preview column (tabs, toolbar, breadcrumbs, canvas) run as a
document served with `Content-Security-Policy: sandbox allow-scripts ...` (no
`allow-same-origin`), and does that actually isolate it from a session cookie?

## Setup

- `packages/app/viewer.html` + `src/viewer-main.tsx`: `AppShell hideEditor` over an
  in-memory FS; the `.krs` comes from an embedded `<script type="application/json">`.
- `packages/app/vite.viewer.config.ts`: separate build to `dist-viewer/`.
- `server.mjs`: stands in for the nest Worker. `/g/<model>/view` embeds the model and
  sends `Content-Security-Policy: sandbox allow-scripts allow-downloads allow-popups`.
  `/set-cookie` sets `__Host-nest_session` (HttpOnly, Secure, SameSite=Lax). `/echo`
  records the Origin and Cookie of whatever reaches it.
- `run.mjs`, `interactions.mjs`: headless Chromium (Playwright 1.63).

Run: `pnpm --filter @karasu-tools/app exec vite build --config vite.viewer.config.ts && node run.mjs && node interactions.mjs`

## Findings

1. **Assets need `Access-Control-Allow-Origin`.** From an opaque origin, module
   scripts and the stylesheet are fetched in CORS mode; without the header both are
   blocked (`from origin 'null' has been blocked by CORS policy`) and nothing boots.
   `Access-Control-Allow-Origin: *` on `/assets/*` is enough (they are public, and the
   request carries no credentials).
2. **Storage access crashes the app unless shimmed.** Reading `window.localStorage`
   throws `SecurityError` in a sandboxed document; the app reads it at startup and
   dies. A classic inline script in `viewer.html` that replaces `localStorage` /
   `sessionStorage` with in-memory stand-ins before the bundle runs fixes it.
   Preferences fall back to defaults and do not persist.
3. **Isolation holds.** Inside the sandbox: `self.origin === "null"`, reading
   `document.cookie` throws, and a `fetch("/echo", {method: "POST", credentials:
   "include"})` reached the server with `Origin: null` and **no cookie** (the same
   request from the unsandboxed baseline carried `__Host-nest_session`). A simple
   POST still reaches the server, so the server-side `Origin` check stays necessary;
   the response is unreadable to the page (CORS).
4. **Behaviour matches the unsandboxed baseline**: first diagram, drill-down, tab
   switching, leaf-node detail panel, edge hover highlight (stroke 1.5px -> 3px), SVG
   export (download with `allow-downloads`). No page errors.
5. **Cost moves to the browser.** Dify (355KB): first diagram ~0.66s after the
   bundle starts (baseline ~0.65s), versus ~600ms of Worker CPU for the server SVG.
6. **Bundle**: 1.40MB JS (417KB gzip) + 73KB CSS (14KB gzip). Monaco is not pulled in
   by `hideEditor`, but the bundle is not split yet.

## Not verified / caveats

- Clipboard (`Share`) throws `NotAllowedError` both inside and outside the sandbox in
  headless Chromium, so this run says nothing about it; hide Share in the viewer.
- A single-file submission shows `Style file not found: /gallery/default.krs.style`;
  the viewer should not ask for a style file.
- Japanese text renders as tofu in the screenshots because the container has no CJK
  font; unrelated to the sandbox.
- Only Chromium was run. Firefox / Safari support `CSP: sandbox` but were not tested.
