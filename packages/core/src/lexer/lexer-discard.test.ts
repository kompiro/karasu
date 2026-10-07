// Which characters the `.krs` lexer drops without emitting a token (#2707).
//
// `readToken` skips any character it has no branch for. A dropped character
// leaves the parser nothing to refuse: digits were dropped until #2707, so
// `@deprecated(until: 2026-12-31)` reached the parser as `-` `-` and was
// recorded as `until: "-"`, which `fmt` then wrote back into the file.
//
// The first test pins the dropped set among printable ASCII and a sample of
// non-ASCII characters exactly, so a character that starts (or stops) being
// dropped is a visible change to this list, not a silent one. The sample
// includes characters outside the BMP and combining marks, which were dropped
// until #2848 because the lexer tested one UTF-16 unit at a time. The last test
// checks that the `.krs` in `examples/` and in the doc fences `lint:krs-fences`
// parses relies on no dropped character other than `=` and `;`.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { Lexer } from "./lexer.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");

/**
 * Every code point of `source` that no token covers, ignoring whitespace. Read
 * by code point, so a dropped character outside the BMP is reported whole
 * rather than as two surrogate halves.
 */
function droppedCharacters(source: string): Set<string> {
  const covered = new Uint8Array(source.length);
  for (const token of new Lexer(source).tokenizeWithComments()) {
    if (token.end === undefined) continue;
    covered.fill(1, token.loc.offset, token.end.offset);
  }
  const dropped = new Set<string>();
  for (let i = 0; i < source.length;) {
    const ch = String.fromCodePoint(source.codePointAt(i) ?? 0);
    if (!covered[i] && !/[ \t\r\n]/.test(ch)) dropped.add(ch);
    i += ch.length;
  }
  return dropped;
}

/**
 * The characters the lexer drops today. `=` and `;` are relied on (see the
 * corpus test below); the rest are dropped because nothing reads them.
 */
const DROPPED_ASCII = [
  "!",
  "$",
  "%",
  "&",
  "'",
  "*",
  "+",
  "/",
  ";",
  "<",
  "=",
  ">",
  "?",
  "\\",
  "^",
  "`",
  "|",
  "~",
];

/**
 * Non-ASCII characters that read as part of a word: a sample of digits and
 * letters (`\p{N}` / `\p{L}`), including ones outside the BMP (#2848).
 */
const KEPT_NON_ASCII = ["２", "٣", "Ⅻ", "é", "日", "𠮷", "𝟘"];

/**
 * Non-ASCII characters the lexer still drops: a combining mark with no
 * character before it to modify, a symbol outside the BMP, an unpaired
 * surrogate, and the ideographic space and byte order mark, which only reach
 * the parser as separators because they are dropped (#2848).
 */
const DROPPED_NON_ASCII = ["\u0301", "😀", "\uD842", "\u3000", "\uFEFF"];

describe("characters the lexer drops (#2707)", () => {
  it("drops exactly the documented set", () => {
    const candidates: string[] = [];
    for (let code = 0x21; code <= 0x7e; code++) candidates.push(String.fromCharCode(code));
    candidates.push(...KEPT_NON_ASCII, ...DROPPED_NON_ASCII);

    // One character per source, so `//`, `-->` or an unterminated string
    // cannot cover a neighbour.
    const dropped = candidates.filter((ch) => droppedCharacters(ch).has(ch));
    expect(dropped).toEqual([...DROPPED_ASCII, ...DROPPED_NON_ASCII]);
  });

  it("keeps every digit of a hyphenated date", () => {
    expect([...droppedCharacters("until: 2026-12-31")]).toEqual([]);
  });

  it("keeps every character of a word with characters outside the BMP or combining marks (#2848)", () => {
    // `𠮷野家` was read as `野家` and a decomposed `café` as `cafe`.
    expect([...droppedCharacters("𠮷野家 cafe\u0301 हिन्दी A𝟘")]).toEqual([]);
  });

  it(`is relied on only for "=" and ";" by examples and linted doc fences`, () => {
    // `label = "x"` and `runtime "n"; realizes X` parse only because these two
    // are dropped. Anything else appearing here is a new silent dependency.
    // ADR fences are left out on purpose: they hold pseudo-syntax templates
    // such as `resource <Resource>Resource`.
    const sources = [
      ...krsFiles(join(repoRoot, "examples")),
      ...["docs/acceptance", "docs/spec", "docs/guide"].flatMap((dir) =>
        krsFences(markdownFiles(join(repoRoot, dir))),
      ),
      ...krsFences(
        readdirSync(join(repoRoot, "docs"))
          .filter((f) => /^concepts.*\.md$/.test(f))
          .map((f) => join(repoRoot, "docs", f)),
      ),
    ];
    expect(sources.length).toBeGreaterThan(300);

    const relied = new Set<string>();
    for (const source of sources) for (const ch of droppedCharacters(source)) relied.add(ch);
    // A subset check: losing the last `=` spelling from the docs is harmless.
    expect([...relied].filter((ch) => ch !== "=" && ch !== ";")).toEqual([]);
  });
});

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

function krsFiles(dir: string): string[] {
  return walk(dir)
    .filter((f) => f.endsWith(".krs"))
    .map((f) => readFileSync(f, "utf8"));
}

function markdownFiles(dir: string): string[] {
  return walk(dir).filter((f) => f.endsWith(".md"));
}

/**
 * The body of every ```krs fence in the files, including `krs fragment` and
 * `krs invalid`, and fences indented up to three spaces inside a list item (as
 * `lint:krs-fences` reads them). A `krs.style` fence is a style sheet, read by
 * another lexer.
 */
function krsFences(files: string[]): string[] {
  const fence = /^( {0,3})```krs(?:[ \t][^\n]*)?\n([\s\S]*?)^ {0,3}```/gm;
  return files.flatMap((file) =>
    [...readFileSync(file, "utf8").matchAll(fence)].map(([, indent, body]) =>
      body.replace(new RegExp(`^ {0,${indent.length}}`, "gm"), ""),
    ),
  );
}
