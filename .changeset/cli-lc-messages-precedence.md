---
"karasu": patch
---

Honor `LC_MESSAGES` when resolving the CLI's output locale. The message-catalog
locale now follows the POSIX precedence `LC_ALL` > `LC_MESSAGES` > `LANG`, so
the standard `LANG=en_US.UTF-8 LC_MESSAGES=ja_JP.UTF-8` split (English
formatting, Japanese program messages) makes `karasu render` print its resolver
warnings in Japanese instead of English.
