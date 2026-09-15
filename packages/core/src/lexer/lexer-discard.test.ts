// Which characters the `.krs` lexer drops without emitting a token (#2707).
//
// `readToken` skips any character it has no branch for. A dropped character
// leaves the parser nothing to refuse: digits were dropped until #2707, so
// `@deprecated(until: 2026-12-31)` reached the parser as `-` `-` and was
// recorded as `until: "-"`, which `fmt` then wrote back into the file.
//
// The first test pins the dropped set among printable ASCII and a sample of
// non-ASCII digits and letters exactly, so a character that starts (or stops)
// being dropped is a visible change to this list, not a silent one. It does not
// cover characters outside the BMP: the lexer tests one UTF-16 unit at a time
// and still drops each half of a surrogate pair. The last test checks that the
// `.krs` in `examples/` and in the doc fences `lint:krs-fences` parses relies
// on no dropped character other than `=` and `;`.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { Lexer } from "./lexer.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");

/** Every character of `source` that no token covers, ignoring whitespace. */
function droppedCharacters(source: string): Set<string> {
  const covered = new Uint8Array(source.length);
  for (const token of new Lexer(source).tokenizeWithComments()) {
    if (token.end === undefined) continue;
    covered.fill(1, token.loc.offset, token.end.offset);
  }
  const dropped = new Set<string>();
  for (let i = 0; i < source.length; i++) {
    if (!covered[i] && !/\s/.test(source[i])) dropped.add(source[i]);
  }
  return dropped;
}

/**
 * The characters the lexer drops today. `=` and `;` are relied on (see the
 * corpus test below); the rest are dropped because nothing reads them.
 */
const DROPPED = [
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

describe("characters the lexer drops (#2707)", () => {
  it("drops exactly the documented set", () => {
    const candidates: string[] = [];
    for (let code = 0x21; code <= 0x7e; code++) candidates.push(String.fromCharCode(code));
    // Non-ASCII digits and letters, which `\p{N}` / `\p{L}` must keep.
    candidates.push("２", "٣", "Ⅻ", "é", "日");

    // One character per source, so `//`, `-->` or an unterminated string
    // cannot cover a neighbour.
    const dropped = candidates.filter((ch) => droppedCharacters(ch).has(ch));
    expect(dropped).toEqual(DROPPED);
  });

  it("keeps every digit of a hyphenated date", () => {
    expect([...droppedCharacters("until: 2026-12-31")]).toEqual([]);
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
