---
"@karasu-tools/core": minor
"karasu": minor
---

Under *Group by: boundary*, a node listed in more than one `boundary` is now enclosed by every frame that can reach it — the frame widens out of its band into a rectilinear outline, and the node is still drawn exactly once. Each boundary gets an identifying colour (stroke, faint fill and title), without which two overlapping frames read as one nested in the other. A frame is widened only when the corridor to the card holds no non-member, so no frame ever encloses a node it does not contain; where it cannot reach, the card carries a dashed `◇ <boundary>` tab and the view reports the new info diagnostic `boundary-membership-not-drawn`. Team frames are unaffected. Slice B of #2161 (#2179).
