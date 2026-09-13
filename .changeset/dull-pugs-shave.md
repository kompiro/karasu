---
"@karasu-tools/core": patch
"karasu": patch
---

Fix the deploy view giving two containers one id when a node id itself contains a dot. A quoted id such as `service "Shop.Api"` spelled the same string as the qualified path `Shop.Api`, so the two containers shared `data-container-id` and every ghost edge addressed to that id landed on whichever was drawn last. Container ids now quote a segment that carries the separator, a double quote or a backslash, or is empty (`Weird."Shop.Api"`); an id with none of those is unchanged.

The consumers that match a container against the node it realizes, namely the system view's deploy-jump button and the draw.io metadata lookup, now key on the node's own id, so a dotted id keeps both. Two behaviors change alongside: a ref that narrows to one of several same-named nodes (`realizes Shop.Api` while `Admin.Api` also exists) no longer lights the deploy-jump button on both of them, and in the draw.io export two same-named services with qualified container ids each keep their own tags and annotations instead of sharing whichever was read last (#2714, ADR-2714).
