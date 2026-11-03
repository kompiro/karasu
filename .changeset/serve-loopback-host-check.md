---
"karasu": minor
---

`karasu serve` now listens on `127.0.0.1` only, and its file API (`/api/*`) answers only requests whose `Host` is `localhost`, a `*.localhost` name or an IP address, which stops DNS rebinding (#3418). If you opened the preview from another machine or from outside a container, start it with `--host 0.0.0.0`; `serve` then warns that the served directory is readable from that address. If you open it through a forwarded or proxied name (a Codespaces `*.app.github.dev` URL, or a proxy that passes its own DNS name as `Host`), add that name with `--allowed-host <name>`. `--allowed-host` is not access control: restrict who reaches the proxy or forwarded port there.
