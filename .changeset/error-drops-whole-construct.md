---
"@karasu-tools/core": patch
"karasu": patch
---

A misplaced `database` / `queue` / `storage` block (`infra-not-in-context`) and a property written on a kind that does not take it (`property-not-for-node-kind`) now raise one error each, over the whole construct, and the blocks after them parse as if the construct were not there. Before, only the keyword was consumed: a misplaced database with a body raised nine errors and closed its system early, and a rejected property's value raised a second error (#3072).
