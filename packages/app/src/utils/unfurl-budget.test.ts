import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Meta-test — every site that builds a server-visible `/s?s=<payload>` URL must
 * be a known one, so a new one cannot appear without deciding how it stays
 * inside the payload budget.
 *
 * TPL-2259: `MAX_UNFURL_PAYLOAD` bounds what may travel in that URL, but a
 * constant only binds the code that remembers to compare against it.
 * `buildShareUrls` did; `resolveRepoPermalink` did not, so a repo-backed
 * permalink emitted exactly the over-length redirect the constant exists to
 * prevent (Issue #2259). The fix shares the comparison (`fitsUnfurlPayload`) —
 * this guard keeps the *set of callers* reviewed as more surfaces appear
 * (#1961 bare route, #1960 private repos, karasu-nest).
 *
 * Failure means: you added a `/s?s=` builder. Gate it on `fitsUnfurlPayload`
 * (or establish that it only reflects a payload already on the wire), then add
 * it below with that rationale.
 */

const REPO_ROOT = fileURLToPath(new URL("../../../../", import.meta.url));

/** Roots that can contain a `/s?s=` builder. */
const SCANNED = ["packages/app/src", "functions"];

/**
 * Known builders → why each is safe. Keys are repo-relative paths.
 *
 * A "producer" turns a payload into a `/s?s=` URL and must be gated. A
 * "reflector" re-emits a payload that already arrived over the wire; the budget
 * was decided upstream and re-checking it there cannot prevent anything.
 */
const KNOWN_BUILDERS: Record<string, string> = {
  "packages/app/src/utils/inline-share.ts":
    "producer — buildShareUrls gates on fitsUnfurlPayload and returns null past the cap",
  "functions/r/[[path]].ts":
    "producer — payload comes from resolveRepoPermalink, which refuses (413) past the cap",
  "packages/app/src/render/share-page.ts":
    "reflector — og:url self-reference for a payload that already arrived in the request",
};

/**
 * Strip block comments and whole-line `//` comments so prose mentioning
 * `/s?s=` is not counted as a builder (TPL-2185).
 *
 * Trailing `//` comments are deliberately left in place: stripping from `//`
 * to end of line would also cut a line at the `//` of a `https://…` literal,
 * and a builder written as `` `https://host/s?s=${x}` `` would then go
 * unnoticed. A leftover trailing comment can only cause a false failure, which
 * announces itself and is fixed by moving the comment to its own line; a false
 * pass would silently defeat the guard.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir).sort()) {
    const path = `${dir}/${entry}`;
    if (statSync(path).isDirectory()) {
      out.push(...walk(path));
    } else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      out.push(path);
    }
  }
  return out;
}

/** Builds the share-page URL literally, or via the module's own constants. */
const BUILDS_SHARE_URL = /\/s\?s=|SHARE_PAGE_PATH\}\?/;

function findBuilders(): string[] {
  const found: string[] = [];
  for (const root of SCANNED) {
    for (const path of walk(`${REPO_ROOT}${root}`)) {
      if (BUILDS_SHARE_URL.test(stripComments(readFileSync(path, "utf8")))) {
        found.push(path.slice(REPO_ROOT.length));
      }
    }
  }
  return found.sort();
}

describe("unfurl payload budget — /s?s= builders", () => {
  it("only known builders construct a server-visible share URL", () => {
    expect(findBuilders()).toEqual(Object.keys(KNOWN_BUILDERS).sort());
  });

  it("the guard is looking at real files (it would notice if the scan went empty)", () => {
    // A broken path or glob would make the assertion above pass vacuously
    // against an empty allowlist edit; anchor it to a builder that must exist.
    expect(findBuilders()).toContain("packages/app/src/utils/inline-share.ts");
  });
});
