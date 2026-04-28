---
id: AT-0043
title: /render endpoint for GitHub Markdown embedding
type: acceptance-test
---

# AT-0043: /render endpoint for GitHub Markdown embedding

## Overview

Verify that `karasu serve` exposes a `/render` endpoint that returns an SVG image,
enabling `.krs` diagrams to be embedded in GitHub Markdown via image URLs.

## Prerequisites

- `karasu` CLI built: `npm run build --workspace=packages/cli`
- A directory with at least one `.krs` file (e.g. `examples/`)
- Server running: `node packages/cli/dist/index.js serve examples/ --port 3000`

## Test Cases

> 🟡 Partially automated — `packages/cli/src/render-endpoint.test.ts` covers the `/render` handler's `?src=` / `?code=` branching, content-type, and error paths. Manual end-to-end tests below validate the running server. Per-test-case `[x]` flips deferred to phase B (#920).

### AT-0043-1: `?src=` with a public URL returns SVG

1. Find a publicly accessible raw `.krs` URL (e.g. a GitHub Raw URL from this repo).
2. Request: `curl -i "http://localhost:3000/render?src=<url>"`
3. **Expected**: HTTP 200, `Content-Type: image/svg+xml`, body starts with `<svg`.

### AT-0043-2: `?code=` with base64-encoded `.krs` returns SVG

1. Encode a simple `.krs` snippet:
   ```sh
   echo -n 'system App { service Web { label "Web" } }' | base64
   ```
2. Request: `curl -i "http://localhost:3000/render?code=<base64>&view=system"`
3. **Expected**: HTTP 200, `Content-Type: image/svg+xml`, body contains `<svg`.

### AT-0043-3: `?view=` parameter selects diagram type

1. Use a `.krs` file that has system, deploy, and org sections.
2. Request with `view=system`, `view=deploy`, `view=org` in turn.
3. **Expected**: Each returns HTTP 200 with a different SVG.

### AT-0043-4: No `?view=` returns all-views bundled SVG

1. Request: `curl -i "http://localhost:3000/render?code=<base64>"` (no view param)
2. **Expected**: HTTP 200 with a bundled SVG containing all available views.

### AT-0043-5: SSRF protection — loopback blocked

1. Request: `curl -i "http://localhost:3000/render?src=http://127.0.0.1/evil.krs"`
2. **Expected**: HTTP 400, body contains "Invalid src URL".

### AT-0043-6: SSRF protection — private IP blocked

1. Request: `curl -i "http://localhost:3000/render?src=http://192.168.1.1/evil.krs"`
2. **Expected**: HTTP 400, body contains "Invalid src URL".

### AT-0043-7: Missing parameters returns 400

1. Request: `curl -i "http://localhost:3000/render"`
2. **Expected**: HTTP 400, body mentions `src or code`.

### AT-0043-8: Unreachable src returns 502

1. Request with a URL that will fail (e.g. non-existent domain):
   `curl -i "http://localhost:3000/render?src=https://does-not-exist.example.invalid/x.krs"`
2. **Expected**: HTTP 502.

### AT-0043-9: GitHub Markdown image embedding

1. In a GitHub README, add:
   ```markdown
   ![diagram](http://localhost:3000/render?code=<base64>&view=system)
   ```
   (Use a publicly hosted URL in practice.)
2. **Expected**: GitHub renders the `<img>` tag and displays the SVG diagram inline.

## Notes

- For production use, replace `localhost:3000` with a publicly hosted instance.
- The `src` parameter accepts any public `http`/`https` URL; GitHub Raw URLs are the primary use case.
