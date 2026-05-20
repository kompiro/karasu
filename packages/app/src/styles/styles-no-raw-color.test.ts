import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Meta-test — component CSS must reference themed colors through tokens,
 * never as raw literals.
 *
 * TPL-20260510-06: a theme is a global rendering toggle, and every
 * "surface" must honour it. In CSS the surfaces are the component
 * stylesheets; the failure mode is a rule that hard-codes a color and so
 * silently stays dark-only. Routing every color through a token in
 * themes.css is what lets `:root[data-theme="light"]` re-skin the app.
 *
 * Scope: layout.css, base.css and components/*.css. tokens.css /
 * themes.css / index.css are excluded — they are *where* raw colors are
 * legitimately defined.
 */

const STYLES_DIR = fileURLToPath(new URL(".", import.meta.url));

/** Strip `/* ... *\/` comments so issue refs like `#1399` don't false-positive. */
function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

/** Raw color literals: hex, and rgb()/rgba()/hsl()/hsla() functional forms. */
const HEX = /#[0-9a-fA-F]{3,8}\b/g;
const FUNCTIONAL = /\b(?:rgba?|hsla?)\(/gi;

function scopedFiles(): { name: string; path: string }[] {
  const files = [
    { name: "base.css", path: `${STYLES_DIR}base.css` },
    { name: "layout.css", path: `${STYLES_DIR}layout.css` },
  ];
  const componentsDir = `${STYLES_DIR}components`;
  for (const entry of readdirSync(componentsDir).sort()) {
    if (entry.endsWith(".css")) {
      files.push({ name: `components/${entry}`, path: `${componentsDir}/${entry}` });
    }
  }
  return files;
}

describe("component CSS uses theme tokens, not raw colors", () => {
  for (const file of scopedFiles()) {
    it(`${file.name} has no raw color literals`, () => {
      const css = stripComments(readFileSync(file.path, "utf8"));
      const offenders = [...(css.match(HEX) ?? []), ...(css.match(FUNCTIONAL) ?? [])];
      // A non-empty list means a rule hard-coded a color — define a token
      // in themes.css and reference it with var(--…) instead.
      expect(offenders).toEqual([]);
    });
  }

  it("scans every component stylesheet", () => {
    // Guard against the glob silently matching nothing.
    expect(scopedFiles().length).toBeGreaterThanOrEqual(8);
  });
});
