---
"@karasu-tools/core": patch
"karasu": patch
---

Deploy containers now carry `data-realized-node-id`, the bare id of the node
the container realizes, beside their `data-container-id` identity. A viewer
matches a cross-navigation highlight against it, so a container whose id is
qualified (`Shop.Api`) or quoted (`"www.example.com"`) is found from the
node's own id and vice versa (#2818, ADR-2714). The attribute is absent when no
single node answers to the bare id.
