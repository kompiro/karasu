---
"@karasu-tools/core": patch
"karasu": patch
---

Light-theme badge colors (deploy kinds oci/lambda/jar/war/function/assets/job/artifact/store and the new/experimental annotations) are darkened so badge labels meet WCAG AA (>= 4.5:1) on the white canvas; previously `function` rendered at 1.92:1. A contrast regression test now guards every builtin badge-color in both themes. Refs #2366 (proposal A).
