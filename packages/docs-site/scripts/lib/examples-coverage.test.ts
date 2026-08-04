import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { GALLERY_PAGES, resolveGithubDir } from "./examples-manifest.ts";
import { REPO_ROOT } from "../sources.ts";

// Coverage guard for `examples/` ↔ the gallery manifest ↔ en/ja parity (#2310).
//
// The three findings in #2310 were one shape: the examples tree and its
// consumers disagreed about what was there, and nothing checked. `hato/`
// belonged to no gallery entry, `ec-platform/` had a page decided for it in
// ADR-1628's design doc and never built, and the two deliberate en-only
// directories each justified themselves through a different mechanism in the
// manifest, so a reader could not tell deliberate from forgotten.
//
// The invariants below are exemption-free on purpose. `EN_ONLY` is not an
// escape hatch — it is the machine-readable half of the table in
// `examples/README.md` § "en-only examples (and why)", and this file asserts
// that a directory is en-only *if and only if* it is listed there. So a new
// example authored in `en` alone fails until someone either writes the `ja`
// counterpart or writes down which exception class it falls into.

const EXAMPLES = path.join(REPO_ROOT, "examples");

/**
 * Directories deliberately published from `en` alone. Each must match a row of
 * the table in `examples/README.md`; the reason is recorded there, not here,
 * so there is one place to read and one place to edit.
 */
const EN_ONLY = new Set(["feature-samples", "client-mcp", "hato"]);

function dirsUnder(locale: "en" | "ja"): string[] {
  return readdirSync(path.join(EXAMPLES, locale), { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
}

/** Every file under `dir`, relative to it, recursively. */
function filesUnder(dir: string, prefix = ""): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...filesUnder(path.join(dir, e.name), rel));
    else out.push(rel);
  }
  return out.sort();
}

/** The `examples/<lang>/<name>` directory names the manifest publishes. */
function publishedDirs(): Set<string> {
  const names = new Set<string>();
  for (const page of GALLERY_PAGES) {
    for (const locale of ["en", "ja"] as const) {
      const m = resolveGithubDir(page, locale).match(/^examples\/(?:en|ja)\/([^/]+)$/);
      if (m) names.add(m[1]);
    }
  }
  return names;
}

describe("examples/ ↔ gallery manifest coverage (#2310)", () => {
  const enDirs = dirsUnder("en");
  const published = publishedDirs();

  it("publishes every example directory", () => {
    // An example nobody can reach from the gallery reads as a fixture that
    // happens to live in `examples/`. If it really is a fixture, it belongs
    // with the tests that consume it — not here.
    const unpublished = enDirs.filter((d) => !published.has(d));
    expect(unpublished).toEqual([]);
  });

  it("publishes nothing that is not an example directory", () => {
    const missing = [...published].filter((d) => !enDirs.includes(d)).sort();
    expect(missing).toEqual([]);
  });
});

describe("examples/ en–ja parity (ADR-1642, #2310)", () => {
  const enDirs = dirsUnder("en");
  const jaDirs = dirsUnder("ja");

  it("has a ja counterpart for every directory that is not listed en-only", () => {
    const shouldHaveJa = enDirs.filter((d) => !EN_ONLY.has(d));
    const missing = shouldHaveJa.filter((d) => !jaDirs.includes(d));
    expect(missing).toEqual([]);
  });

  it("has no ja-only directory", () => {
    expect(jaDirs.filter((d) => !enDirs.includes(d))).toEqual([]);
  });

  it("lists as en-only exactly the directories that have no ja counterpart", () => {
    // The `if and only if` half. Without it, `EN_ONLY` would silently absorb a
    // forgotten translation the moment someone appended a name to it.
    const actuallyEnOnly = enDirs.filter((d) => !jaDirs.includes(d)).sort();
    expect(actuallyEnOnly).toEqual([...EN_ONLY].sort());
  });

  it("names every en-only directory in examples/README.md, with a reason", () => {
    // `EN_ONLY` on its own would just move the unexplained omission from the
    // manifest into a test file. The prose is the actual deliverable of #2310's
    // third finding; this asserts it exists and mentions each member.
    const text = readFileSync(path.join(EXAMPLES, "README.md"), "utf8");
    const start = text.indexOf("### en-only examples");
    expect(start).toBeGreaterThan(-1);
    const section = text.slice(start);
    for (const dir of EN_ONLY) {
      expect(section).toContain(`${dir}/`);
    }
  });

  it.each([...new Set([...dirsUnder("en"), ...dirsUnder("ja")])].filter((d) => !EN_ONLY.has(d)))(
    "`%s` has identical file sets in en and ja",
    (dir) => {
      expect(filesUnder(path.join(EXAMPLES, "ja", dir))).toEqual(
        filesUnder(path.join(EXAMPLES, "en", dir)),
      );
    },
  );
});
