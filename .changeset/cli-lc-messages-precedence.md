---
"karasu": patch
---

Honor `LC_MESSAGES` when resolving the CLI's output locale. The message-catalog
locale now follows the POSIX precedence `LC_ALL` > `LC_MESSAGES` > `LANG`, so
the standard `LANG=en_US.UTF-8 LC_MESSAGES=ja_JP.UTF-8` split (English
formatting, Japanese program messages) selects the Japanese catalog.

This affects every localized string the CLI emits, not only `karasu render`'s
resolver warnings: `karasu diff` and `karasu lint-style` diagnostics, and the
422 bodies `karasu serve` returns to the browser. Note that `serve` resolves
from the *server* process environment while the app UI resolves from the
browser, so the two can now disagree if you set `LC_MESSAGES` for the server
but browse with a different language.
