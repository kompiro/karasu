---
"@karasu-tools/core": minor
"karasu": minor
---

Allow expanding multiple containers in place at once in the system view (#1923). Lifts the single-expansion cap and routes edges so each expanded frame's edges connect to its own domains/border while detouring around the other frames (extends the group router to frame-anchored endpoints — this also removes the residual frame-crossing from single expansion). Scoped-glance stays protected softly: Collapse all folds every expansion back to the overview and a hint appears when many are open.
