---
"@karasu-tools/core": minor
"karasu": minor
---

The five comma-separated value properties (`facets`, `delivers`, `handles`, `operations`, `realizes`) now read on one grammar. A list is held to the line its keyword is on, so a trailing comma no longer absorbs the next line; a separator with no value after it raises one `expected-id-after` anchored on the comma itself rather than on the following token; a leading comma (`facets ,pii`) is now reported on the comma too rather than on the keyword, which is what the spec always promised; and `realizes` moves onto `expected-id-after` from `expected-property-value`, so the same mistake reports the same way whichever property it is written on (#2551).
