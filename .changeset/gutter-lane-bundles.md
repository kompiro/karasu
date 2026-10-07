---
"@karasu-tools/core": minor
"karasu": minor
---

Gutter-routed edges that share a target (or a source) now share one gutter lane and draw as one spine with a count chip, on every canvas including the ungrouped one (#2958). Only the lane changes, never the route's side or shape; sync and async edges never share a lane. Dense canvases get much narrower: the reverse-engineered Dify Knowledge view goes from 135 gutter lanes and 4563px wide to 48 lanes and 2930px.
