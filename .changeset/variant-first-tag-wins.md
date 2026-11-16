---
"@karasu-tools/core": patch
"karasu": patch
"karasu-skills": patch
---

A node with two or more variant tags of its kind (`resource Orders [table, api]`, `client App [mobile, desktop]`) is now drawn by the first tag written, in shape mode, Icon Mode and the Outline alike; a multi-variant `resource` used to take whichever variant the builtin sheet declared last (#3775). An author rule that picks another variant's icon for such a node, such as `#App { shape: url("client-desktop"); }`, is no longer rewritten to the first tag's icon (#3776).
