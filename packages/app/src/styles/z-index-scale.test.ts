import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * The z-index scale in tokens.css stays legible (TPL-1468): every `--z-*`
 * token carries a comment, and the tokens are declared from the lowest layer
 * to the highest, so a token's place in the list says what it sits above and
 * below. The comment's content (which surfaces belong to the layer) is still a
 * review read; this test only checks that one is there.
 */

const TOKENS_CSS = readFileSync(fileURLToPath(new URL("./tokens.css", import.meta.url)), "utf8");

interface ZToken {
  name: string;
  value: number;
  commented: boolean;
}

/** Every `--z-*` declaration, in source order, with whether a comment annotates it. */
function zTokens(css: string): ZToken[] {
  const lines = css.split("\n");
  const tokens: ZToken[] = [];
  lines.forEach((line, i) => {
    const m = /^\s*(--z-[\w-]+)\s*:\s*([^;]+);(.*)$/.exec(line);
    if (!m) return;
    const trailing = m[3].trim().startsWith("/*");
    // A comment above counts only when it is a comment of its own: the
    // trailing comment of the token above (one line or several) annotates
    // that token. Walk up to the line that opens the comment and require it
    // to start with `/*`.
    let previous = false;
    if ((lines[i - 1] ?? "").trim().endsWith("*/")) {
      let open = i - 1;
      while (open > 0 && !lines[open].includes("/*")) open -= 1;
      previous = lines[open].trim().startsWith("/*");
    }
    tokens.push({ name: m[1], value: Number(m[2].trim()), commented: trailing || previous });
  });
  return tokens;
}

describe("z-index scale in tokens.css (TPL-1468)", () => {
  const tokens = zTokens(TOKENS_CSS);

  it("finds the scale", () => {
    expect(tokens.length).toBeGreaterThanOrEqual(5);
  });

  it("gives every token an integer value", () => {
    expect(tokens.filter((t) => !Number.isInteger(t.value)).map((t) => t.name)).toEqual([]);
  });

  it("annotates every token with a comment", () => {
    expect(tokens.filter((t) => !t.commented).map((t) => t.name)).toEqual([]);
  });

  it("declares the tokens from the lowest layer to the highest", () => {
    const values = tokens.map((t) => t.value);
    expect(values).toEqual([...new Set(values)].sort((a, b) => a - b));
  });

  it("reads a trailing or a preceding comment, and flags a bare token", () => {
    expect(
      zTokens(
        [
          "  --z-a: 1; /* a */",
          "  /* b sits above a */",
          "  --z-b: 2;",
          "  --z-c: 3;",
          "  --z-d: 4; /* d */",
          "  --z-e: 5;",
          "  --z-f: 6; /* f, with a comment",
          "              that runs on */",
          "  --z-g: 7;",
          "  --radius: 4px; /* not a z token */",
        ].join("\n"),
      ),
    ).toEqual([
      { name: "--z-a", value: 1, commented: true },
      { name: "--z-b", value: 2, commented: true },
      { name: "--z-c", value: 3, commented: false },
      { name: "--z-d", value: 4, commented: true },
      { name: "--z-e", value: 5, commented: false },
      { name: "--z-f", value: 6, commented: true },
      { name: "--z-g", value: 7, commented: false },
    ]);
  });
});
