---
"karasu": patch
---

`karasu serve`'s `/render?src=` now checks the address each hop actually connects to, including every redirect, and refuses loopback, private, link-local, CGNAT, reserved and this machine's own addresses. Previously only the hostname as written in the first URL was checked, so a name that resolved to loopback, an IPv4-mapped IPv6 literal, or a redirect could reach local services. URLs with credentials are refused, the body is capped at 256 KiB (after decompression), and at most 2 `src` fetches run at once (503 beyond that). `src` no longer goes through `HTTP_PROXY`, so it is unavailable where the network requires a proxy; `?code=` still works. Requests sent by `/render` carry `X-Karasu-Render: 1`, and `serve` refuses them on every path (#3426).
