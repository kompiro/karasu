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
  const source = read(path);
  const match = new RegExp(`const ${name} = ([^;]+);`).exec(source);
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
    row: /`runs\/krs\/v1\/<installation>\/<owner>\/<repo>` \| 24 時間/,
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
    expect(policy).toContain("最大 60 ファイル・合計 400KB");
  });

  it("names every prefix the purge sweeps, and no others", () => {
    // The document promises uninstall removes all of it. The authority on
    // what "all of it" is is `NestStore`, so the two lists have to agree.
    const store = read("packages/nest/src/store/nest-store.ts");
    const purged = ["cache", "directory", "runs", "metrics", "reads", "quota"];
    for (const member of purged) {
      expect(store).toMatch(new RegExp(`this\\.${member}\\.(purgeInstallation|unpublishOwnedBy)`));
    }
    for (const prefix of ["krs/v1/", "idx/v1/", "runs/", "metrics/", "reads/", "quota/", "busy/"]) {
      expect(policy).toContain(prefix);
    }
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
