---
"@karasu-tools/core": patch
"karasu": patch
---

`karasu fmt` keeps a qualified edge endpoint spelled as the author wrote it: `-> Shop.Checkout.Payment` no longer comes back as `-> "Shop.Checkout.Payment"`. The target's segments now travel on the AST beside the joined form, so the endpoint serialises segment by segment like every other reference site (#2650).
