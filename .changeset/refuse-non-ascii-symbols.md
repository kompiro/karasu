---
"@karasu-tools/core": patch
"karasu": patch
"karasu-skills": patch
---

A non-ASCII character that is neither whitespace nor part of a name (an emoji, `→`, a zero-width space, a combining mark with no letter before it) is no longer silently dropped. `service 😀A` used to declare `A` and `A → B` read as `A B`, with no diagnostic; such a character now reaches the parser, which reports it like a name starting with a digit (#3093). Quote the name to use the character: `service "😀A"`.

Every character with the Unicode `White_Space` property (the ideographic space U+3000, no-break space, U+2028, ...) and the byte order mark are now read as whitespace, so files that relied on them being dropped keep parsing. ZWNJ and ZWJ now stay inside a word, so Persian and Indic names that contain them are one name instead of splitting apart. The syntax reference gains a Lexical structure section that lists how each character is read.
