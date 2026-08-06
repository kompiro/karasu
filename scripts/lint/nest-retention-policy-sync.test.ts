/**
 * The data-handling document is a claim about what the code does. This makes
 * it a checkable one.
 *
 * `docs/policy/nest-data-handling.md` states a retention period for every KV
 * prefix karasu-nest writes. Those periods are the material a privacy policy
 * is drafted from and the thing a repository owner is asked to accept at
 * install time — so a constant changed without the document is not a stale
 * doc, it is a service doing something other than what its users agreed to.
 *
 * Nothing else catches this. The constants live in five files, the document
 * lives in a sixth, and no type, test or lint rule connects them. The failure
 * is silent by construction: the code keeps working and only the promise
 * breaks. That is the same shape as TPL-2226 (a new prefix the purge does not
 * sweep) one level up — there the drift was between code and code, here it is
 * between code and what we told people.
 *
 * This test is deliberately literal: it reads the constants out of the source
 * rather than importing them, because `packages/nest` compiles with
 * `types: []` and importing it from a script-level test drags the Workers
 * environment in. Reading the text is also closer to what a reviewer does.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(import.meta.dirname, "../..");

const read = (path: string): string => readFileSync(join(root, path), "utf8");

/** Pull `const NAME = <expression>;` out of a source file and evaluate it. */
function constant(path: string, name: string): number {
  // Block comments stripped first, and the declaration anchored to the start
  // of a line. Unanchored, the regex takes the first textual match — and a
  // comment mentioning an old value ("Was: const TTL_SECONDS = 400 * …")
  // would shadow the real declaration and certify a number the code does not
  // use. Every file this reads is heavily commented, several about durations.
  const source = read(path).replaceAll(/\/\*[\s\S]*?\*\//g, "");
  const match = new RegExp(`^const ${name} = ([^;]+);`, "m").exec(source);
  if (match?.[1] === undefined) {
    throw new Error(`${name} is not declared in ${path} any more`);
  }
  const expression = match[1].replaceAll("_", "");
  if (!/^[\d\s*+]+$/.test(expression)) {
    throw new Error(`${name} in ${path} is no longer a plain arithmetic literal: ${expression}`);
  }
  // Only digits, whitespace and `*`/`+` reach here, checked directly above.
  return Number(
    expression
      .split("+")
      .map((term) => term.split("*").reduce((product, factor) => product * Number(factor), 1))
      .reduce((sum, term) => sum + term, 0),
  );
}

const POLICY = "docs/policy/nest-data-handling.md";

/**
 * Every retention the document states, and where the code decides it.
 *
 * Adding a KV prefix without adding a row here is the gap this file cannot
 * close by itself — which is why the list is short enough for a reviewer to
 * compare against `nest-purge-coverage.test.ts`'s seeder ledger by eye.
 */
const RETENTIONS: { what: string; file: string; name: string; days: number; row: RegExp }[] = [
  {
    what: "the generated .krs",
    file: "packages/nest/src/store/krs-cache.ts",
    name: "DEFAULT_TTL_SECONDS",
    days: 90,
    row: /`krs\/v1\/<installation>\/<owner>\/<repo>\/<sha>` \| 90 日/,
  },
  {
    what: "the run status record",
    file: "packages/nest/src/store/run-status.ts",
    name: "TTL_SECONDS",
    days: 1,
    // Trailing slash: `repoPrefix` ends in one, so that is the real key.
    row: /`runs\/krs\/v1\/<installation>\/<owner>\/<repo>\/` \| 24 時間/,
  },
  {
    what: "the cost record",
    file: "packages/nest/src/meter/record.ts",
    name: "TTL_SECONDS",
    days: 400,
    row: /`metrics\/krs\/v1\/[^`]+` \| 400 日/,
  },
  {
    what: "the read counter",
    file: "packages/nest/src/meter/reads.ts",
    name: "TTL_SECONDS",
    days: 400,
    row: /`reads\/krs\/v1\/[^`]+` \| 400 日/,
  },
  {
    what: "the monthly quota counter",
    file: "packages/nest/src/quota/ledger.ts",
    name: "QUOTA_TTL_SECONDS",
    days: 400,
    row: /`quota\/krs\/v1\/<installation>\/<YYYY-MM>` \| 400 日/,
  },
];

describe("the data-handling document matches the code (#1996)", () => {
  const policy = read(POLICY);

  it.each(RETENTIONS)("states the retention of $what", ({ file, name, days, row }) => {
    expect(constant(file, name)).toBe(days * 24 * 60 * 60);
    expect(policy).toMatch(row);
  });

  it("states the concurrency slot's 90 minutes", () => {
    expect(constant("packages/nest/src/quota/ledger.ts", "SLOT_TTL_SECONDS")).toBe(90 * 60);
    expect(policy).toMatch(/`busy\/krs\/v1\/[^`]+` \| 90 分/);
  });

  it("states the file limits the model actually sees", () => {
    // The document tells a repository owner how much of their code is read.
    // These two numbers are that answer.
    expect(constant("packages/nest/src/generate/run.ts", "MAX_FILES_FETCHED")).toBe(200);
    expect(constant("packages/nest/src/generate/run.ts", "MAX_FILE_BYTES")).toBe(200_000);
    expect(policy).toContain("最大 200 ファイル・1 ファイル 200KB まで");

    expect(constant("packages/nest/src/reverse/pipeline.ts", "DEFAULT_MAX_FILES_READ")).toBe(60);
    expect(constant("packages/nest/src/reverse/pipeline.ts", "DEFAULT_MAX_BYTES_READ")).toBe(
      400_000,
    );
    // Characters, not bytes: the accumulator counts UTF-16 code units, so a
    // CJK source's real payload exceeds the number. The document says so.
    expect(read("packages/nest/src/reverse/pipeline.ts")).toContain("bytes + file.content.length");
    expect(policy).toContain(
      "最大 60 ファイル分の、**redact 済み**ソース本文（1 パスあたり合計 40 万文字",
    );
  });

  it("names each prefix the purge is wired for (not that the list is complete)", () => {
    // Deliberately narrow, and named for what it does. Both lists below are
    // written here, so a *new* prefix with no doc row and no purge wiring
    // passes this untouched — the gap TPL-2226 exists for, closed by a human
    // reading `nest-purge-coverage.test.ts`'s seeder ledger rather than by
    // this file. Claiming otherwise in the test name would be worse than the
    // gap, because it would stop anyone looking.
    const store = read("packages/nest/src/store/nest-store.ts");
    const purged = ["cache", "directory", "runs", "metrics", "reads", "quota"];
    for (const member of purged) {
      expect(store).toMatch(new RegExp(`this\\.${member}\\.(purgeInstallation|unpublishOwnedBy)`));
    }
    // Full key shapes, not bare prefixes: `krs/v1/` alone is satisfied by the
    // `runs/krs/v1/…` row, which would let a missing row pass.
    for (const key of [
      "`krs/v1/<installation>/<owner>/<repo>/<sha>`",
      "`idx/v1/<owner>/<repo>`",
      "`runs/krs/v1/<installation>/<owner>/<repo>/`",
      "`metrics/krs/v1/",
      "`reads/krs/v1/",
      "`quota/krs/v1/<installation>/<YYYY-MM>`",
      "`busy/krs/v1/",
    ]) {
      expect(policy).toContain(key);
    }
  });

  it("says a private repository's model is not served", () => {
    // The single most consequential fact about this service for a repository
    // owner, and the one a privacy policy drafted from this document would
    // otherwise be silent on.
    expect(read("packages/nest/src/routes/repo.ts")).toContain("published.private !== false");
    expect(policy).toContain("private repository のモデルは配信しない");
  });

  it("does not claim PR-back is enabled while the switch defaults off", () => {
    // The document is what the consent copy is drafted from. If delivery ever
    // becomes default-on, this sentence has to be rewritten in the same
    // change -- the install prompt would be describing a narrower service
    // than the one running (ADR-1990 decision 6).
    expect(read("packages/nest/src/deliver/pull-request.ts")).toContain(
      'return env.PR_DELIVERY === "on";',
    );
    expect(policy).toContain("既定で無効");
  });
});
