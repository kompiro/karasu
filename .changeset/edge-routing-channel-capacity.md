---
"@karasu-tools/core": minor
"karasu": minor
---

Size inter-row channels from the traffic they carry (#2608). Edges that share a
channel between two rows now sit one fixed lane pitch apart whatever their route
shape — a gutter route's approach runs take part too — and a channel that needs
more room than the default gap holds gets it: the rows are placed once more with
that room reserved, instead of an 18px band being split N ways until the lines
drew on top of each other. Fanned-out gutter ports are spread over the part of the
side the outline actually offers, so outline seating no longer folds them back
onto one point. Views whose channels already fit are laid out exactly as before;
the multi-system root view keeps its default gaps.
