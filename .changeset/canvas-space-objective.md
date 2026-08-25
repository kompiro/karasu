---
"@karasu-tools/core": minor
"karasu": minor
---

Choose the row-width budget by canvas area instead of leaving it at a fixed constant, so a view holds the least empty space it can while staying inside a screen-shaped aspect band. Deep views that used to grow into a tall narrow ribbon now spread sideways; a view that already fits keeps exactly the layout it had. Deploy containers also wrap their units into a balanced grid rather than stacking them in one column.
