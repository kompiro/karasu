---
"@karasu-tools/core": patch
"karasu": patch
---

Stop `[external]` side-column cards from overlapping. The column divided its content span into equal steps, which folds the cards into each other once there are more of them than the span can hold — 14 externals overlapped by 25px each on a real model. A column that no longer fits now stacks at a fixed clearance and the system frame grows to wrap it; a column that already had room keeps the placement it had.
