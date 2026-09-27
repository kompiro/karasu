---
"@karasu-tools/core": patch
"karasu": patch
---

The multi-system root view now draws every same-named node: two systems that
both declare `service Api` used to merge onto one card (the later system's), so
the other frame went empty and its edges started from nowhere (#2917). Both
cards keep `data-node-id="Api"`, and every node card on a logical-view canvas
now also carries `data-node-path` (`Shop.Api`, the same injective text form a
deploy container's id uses), naming the one node the card stands for. The
compile result exposes the same metadata keyed by that path as
`nodeMetadataByPath`, and `nodePathRefId` / `parseNodePathRefId` are exported
for readers of the attribute.
