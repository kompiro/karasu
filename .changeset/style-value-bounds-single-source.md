---
"@karasu-tools/core": patch
"karasu": patch
"karasu-skills": patch
---

A `.krs.style` declaration whose value does not fit its property is now treated as if it were not written: the diagnostic says "ignored" and the value really is ignored, with a weaker rule's value applying instead of the default (#3141). An out-of-range `label-position` is no longer clamped; a length without a unit (other than `0`), a wrong unit or a malformed color is no longer drawn; `label-offset` accepts one or two lengths only. Unquoted multi-word font names (`font-family: Noto Sans, serif`) are accepted, and `border-width: 0` no longer needs a unit. `style-column-invalid-value` and `style-grid-columns-invalid-value` are retired: the declaration is reported once, where it was written, instead of once per node.

A value the parser cannot hold whole (an empty value such as `color: ;`, an empty comma item, or a stray `:`, `=`, bracket or parenthesis) is now an error, like the stray `-` of #3140: `karasu render` exits non-zero until it is fixed, and `tidy-style` / editor formatting leave a sheet with such an error unchanged instead of deleting the declaration. CSS color names are matched case-sensitively, so `color: White` is reported and no longer drawn; write `white`.
