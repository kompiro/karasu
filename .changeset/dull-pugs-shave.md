---
"@karasu-tools/core": patch
"karasu": patch
---

Fix the deploy view giving two containers one id when a node id itself contains a dot. A quoted id such as `service "Shop.Api"` spelled the same string as the qualified path `Shop.Api`, so the two containers shared `data-container-id` and every ghost edge addressed to that id landed on whichever was drawn last. Container ids now quote a segment that carries the separator (`Weird."Shop.Api"`), and the consumers that match a container against the node it realizes — the system view's deploy-jump button and the draw.io metadata lookup — key on the node's own id, so a dotted id keeps both. Every id in a model without dotted ids is unchanged (#2714).
