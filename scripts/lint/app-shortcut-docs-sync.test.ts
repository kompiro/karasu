import { afterAll, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  APP_SRC_DIR,
  check,
  chordToDisplay,
  collectChords,
  DOC_EXEMPT,
} from "./app-shortcut-docs-sync.ts";

const REPO_ROOT = resolve(import.meta.dirname, "../..");

describe("chordToDisplay", () => {
  it("maps mod to Ctrl/Cmd and upper-cases the key", () => {
    expect(chordToDisplay("mod+shift+p")).toBe("Ctrl/Cmd+Shift+P");
    expect(chordToDisplay("mod+b")).toBe("Ctrl/Cmd+B");
    expect(chordToDisplay("mod+1")).toBe("Ctrl/Cmd+1");
    expect(chordToDisplay("mod+shift+e")).toBe("Ctrl/Cmd+Shift+E");
  });

  it("handles alt and standalone ctrl", () => {
    expect(chordToDisplay("alt+shift+f")).toBe("Alt+Shift+F");
    expect(chordToDisplay("ctrl+k")).toBe("Ctrl+K");
  });
});

describe("collectChords", () => {
  it("finds the known shortcuts declared in the app source", () => {
    const chords = collectChords(resolve(REPO_ROOT, APP_SRC_DIR));
    // Spot-check both declaration syntaxes: `keybinding:` (object) and
    // `keybinding=` (JSX prop).
    expect(chords).toContain("mod+shift+p"); // command palette (object form)
    expect(chords).toContain("mod+shift+e"); // files tree (JSX prop form)
    expect(chords.size).toBeGreaterThan(5);
  });
});

describe("docs are in sync with the command registry", () => {
  it("documents every non-exempt app keybinding in both locales", () => {
    const problems = check(REPO_ROOT);
    // Surface the exact gap (chord + expected display + which file) on failure.
    expect(problems).toEqual([]);
  });

  it("keeps every DOC_EXEMPT entry justified with a reason", () => {
    for (const [, reason] of DOC_EXEMPT) {
      expect(reason.length).toBeGreaterThan(0);
    }
  });
});

describe("check (synthetic fixture)", () => {
  const root = mkdtempSync(join(tmpdir(), "shortcut-docs-sync-"));
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  function writeFixture(opts: { chordInSource: string; documented: string[] }) {
    const srcDir = join(root, APP_SRC_DIR);
    mkdirSync(srcDir, { recursive: true });
    writeFileSync(
      join(srcDir, "Shortcut.tsx"),
      `useCommand({ keybinding: "${opts.chordInSource}", run: () => {} });`,
    );
    mkdirSync(join(root, "docs/tools"), { recursive: true });
    writeFileSync(join(root, "docs/tools/app.md"), opts.documented[0] ?? "");
    writeFileSync(join(root, "docs/tools/app.ja.md"), opts.documented[1] ?? "");
  }

  it("flags a source chord that is missing from both locale docs", () => {
    writeFixture({ chordInSource: "mod+shift+z", documented: ["", ""] });
    const problems = check(root);
    expect(problems).toEqual([
      {
        chord: "mod+shift+z",
        display: "Ctrl/Cmd+Shift+Z",
        missingIn: ["docs/tools/app.md", "docs/tools/app.ja.md"],
      },
    ]);
  });

  it("flags a chord documented in only one locale", () => {
    writeFixture({ chordInSource: "mod+shift+z", documented: ["`Ctrl/Cmd+Shift+Z`", ""] });
    expect(check(root)).toEqual([
      { chord: "mod+shift+z", display: "Ctrl/Cmd+Shift+Z", missingIn: ["docs/tools/app.ja.md"] },
    ]);
  });

  it("passes when the chord's display form is present in both docs", () => {
    writeFixture({
      chordInSource: "mod+shift+z",
      documented: ["`Ctrl/Cmd+Shift+Z` opens X", "`Ctrl/Cmd+Shift+Z` で X"],
    });
    expect(check(root)).toEqual([]);
  });
});
