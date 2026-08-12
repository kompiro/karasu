---
"@karasu-tools/core": minor
"karasu": minor
---

Kind colors now follow two rules and a hue table instead of case-by-case picks
(#2421, spec: `docs/spec/style.md` § Kind color vocabulary). In the logical
layer, `usecase` renders fill-less and `resource` becomes neutral slate, so the
four kinds that shared one navy in the dark theme are finally distinguishable —
and a fill-less card lets a boundary frame's tint show through, making
membership readable in color. Every deploy kind's fill and label are now its
accent hue at low and high lightness, retiring the desaturated brown and olive
that left `war` and `function` looking muddy. A contrast guard verifies the
result in both themes, including the fill-less border over every boundary tint.
