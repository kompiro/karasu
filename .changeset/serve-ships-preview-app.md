---
"karasu": patch
---

`karasu serve` works from the npm package. The package now ships the preview app (`dist/app/`, minified, no sourcemaps), so `npx --yes karasu@latest serve .` serves the live preview instead of answering every request with "App not built". When the app cannot be found, `serve` says where it looked and what to run, both at startup and in the response (#3017).
