---
"@karasu-tools/core": patch
"karasu": patch
---

Shape mode now draws a card-design icon (`shape: url()` with `krs-label` /
`krs-description` slots) as a native-size pictogram in the card's top-left
corner plus the normal text stack, so the card keeps the meta row, `role` and
the client resource / capability chips it was measured for, wraps its
description, and no longer leaves the reserved height empty (#2803). Icon mode
is unchanged. Card sizes and layout are unaffected.
