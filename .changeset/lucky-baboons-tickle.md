---
"@karasu-tools/core": patch
"karasu": patch
---

The five comma-separated value properties (`facets`, `delivers`, `handles`, `operations`, `realizes`) now read on one grammar. A list is held to the line its keyword is on, so a trailing comma no longer absorbs the next line; a separator with no value after it raises one `expected-id-after` anchored on the comma itself rather than on the following token; and `realizes` moves onto `expected-id-after` from `expected-property-value`, so the same mistake reports the same way whichever property it is written on (#2551).
