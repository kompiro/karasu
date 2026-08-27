---
"@karasu-tools/core": minor
"karasu": minor
---

Choose the row-width budget by canvas area instead of leaving it at a fixed constant, so a view holds the least empty space it can while staying inside a screen-shaped aspect band. Deep views that used to grow into a tall narrow ribbon now spread sideways; a view that already fits keeps exactly the layout it had. A deploy container holding more than three units also wraps them into a grid rather than stacking them in one column; smaller containers keep the single column they had, so no existing deploy diagram changes.
