---
"karasu-vscode": patch
---

The detail panel's "Open deploy view" now highlights the container that
realizes the service. The preview's highlight message names the attribute it
matches on (`data-realized-node-id` for a jump into the deploy view,
`data-node-id` otherwise), so the container is found from the node's id
regardless of how the container's own id is spelled (#2818).
