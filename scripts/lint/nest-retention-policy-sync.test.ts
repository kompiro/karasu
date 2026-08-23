/**
 * The data-handling document is a claim about what the code does. This makes
 * it a checkable one.
 *
 * `docs/policy/nest-data-handling.md` states how long karasu-nest keeps every
 * KV prefix it writes. Those periods are the material a privacy policy is
 * drafted from and the thing a submitter is asked to accept — so a constant
 * changed without the document is not a stale doc, it is a service doing
 * something other than what its users agreed to.
 *
 * Nothing else catches this. The constants live in the store modules, the
 * document lives in `docs/`, and no type, test or lint rule connects them. The
 * failure is silent by construction: the code keeps working and only the
 * promise breaks. That is the same shape as TPL-2226 (a new prefix the purge
 * does not sweep) one level up — there the drift is between code and code,
 * here it is between code and what we told people.
 *
 * Since #2590 the interesting half of the claim runs the other way. The
 * gallery's retention is stated as a **condition** ("kept until the submitter
 * deletes it") rather than a number, so what has to be checked is that no TTL
 * exists — see `assertNoTtl` below and TPL-2587.
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
  const match = new RegExp(`^export const ${name} = ([^;]+);|^const ${name} = ([^;]+);`, "m").exec(
    source,
  );
  const expression = match?.[1] ?? match?.[2];
  if (expression === undefined) {
    throw new Error(`${name} is not declared in ${path} any more`);
  }
  const cleaned = expression.replaceAll("_", "");
  if (!/^[\d\s*+]+$/.test(cleaned)) {
    throw new Error(`${name} in ${path} is no longer a plain arithmetic literal: ${cleaned}`);
  }
  // Only digits, whitespace and `*`/`+` reach here, checked directly above.
  return Number(
    cleaned
      .split("+")
      .map((term) => term.split("*").reduce((product, factor) => product * Number(factor), 1))
      .reduce((sum, term) => sum + term, 0),
  );
}

const POLICY = "docs/policy/nest-data-handling.md";

/**
 * Assert that a store never passes an expiry.
 *
 * The absence of a TTL cannot be proved by waiting, so it is checked at the
 * source: the store has exactly one `put` call site, and it must not carry
 * `expirationTtl`. The behavioural half of this lives in the package's own
 * suite (`submissions.test.ts`, `accounts.test.ts`), which asserts on the
 * fake's recorded `put` options; this half is what a reviewer of the document
 * can see.
 */
function assertNoTtl(path: string): void {
  const source = read(path).replaceAll(/\/\*[\s\S]*?\*\//g, "");
  expect(source).not.toMatch(/expirationTtl/);
}

describe("the data-handling document matches the code (#1996, #2591)", () => {
  const policy = read(POLICY);

  it("keeps a submission until its author deletes it, and says so", () => {
    // The decision, not an omission: content its author manages must not
    // vanish on its own, or the disappearance becomes the support request the
    // console exists to remove (TPL-2587).
    assertNoTtl("packages/nest/src/store/submissions.ts");
    expect(policy).toMatch(/`sub\/v1\/<account>\/<id>` \| \*\*投稿者が削除するまで\*\*/);
  });

  it("keeps the account record on the same condition", () => {
    assertNoTtl("packages/nest/src/store/accounts.ts");
    expect(policy).toMatch(/`acct\/v1\/<account>` \| \*\*アカウント削除まで\*\*/);
  });

  it("expires a session, which is the one credential here", () => {
    expect(constant("packages/nest/src/store/sessions.ts", "SESSION_TTL_SECONDS")).toBe(
      30 * 24 * 60 * 60,
    );
    expect(policy).toMatch(/`sess\/v1\/<account>\/<session>` \| 30 日/);
  });

  it("states the size limits a submitter is actually held to", () => {
    expect(constant("packages/nest/src/store/submissions.ts", "MAX_SUBMISSION_BYTES")).toBe(
      256 * 1024,
    );
    expect(constant("packages/nest/src/store/submissions.ts", "MAX_TITLE_LENGTH")).toBe(120);
    expect(policy).toContain("1 投稿あたり 256KB");
  });

  it("names each prefix the purge is wired for (not that the list is complete)", () => {
    // Deliberately narrow, and named for what it does. Both lists below are
    // written here, so a *new* prefix with no doc row and no purge wiring
    // passes this untouched — the gap TPL-2226 exists for, closed by a human
    // reading `gallery-purge-coverage.test.ts`'s seeder ledger rather than by
    // this file. Claiming otherwise in the test name would be worse than the
    // gap, because it would stop anyone looking.
    const store = read("packages/nest/src/store/gallery-store.ts");
    for (const member of ["sessions", "submissions", "accounts"]) {
      expect(store).toMatch(new RegExp(`this\\.${member}\\.purgeAccount`));
    }
    for (const key of [
      "`acct/v1/<account>`",
      "`sub/v1/<account>/<id>`",
      "`sess/v1/<account>/<session>`",
    ]) {
      expect(policy).toContain(key);
    }
  });

  it("says the service does not read anyone's repository", () => {
    // The single most consequential fact about the gallery, and the one a
    // privacy policy drafted from this document turns on. It is checkable:
    // the package no longer contains a GitHub repository client at all.
    expect(() => read("packages/nest/src/github/client.ts")).toThrow(/ENOENT/);
    expect(policy).toContain("ソースコードを読まない");
  });

  it("says an unlisted submission is withheld, and withholds it", () => {
    expect(read("packages/nest/src/routes/gallery.ts")).toContain(
      'submission.visibility !== "public" && !isOwner',
    );
    expect(policy).toContain("**非公開（unlisted）**: **配信しない。**");
  });

  it("does not claim a model provider is involved", () => {
    // If inference ever comes back, this document is where the consent copy is
    // drafted from and it would be describing a narrower service than the one
    // running. Both halves are asserted so neither can drift alone.
    //
    // Checked against the subprocessor table rather than by grepping the
    // provider's name out of the whole file: the document legitimately
    // records that the zero-retention contract item is gone, and a bare name
    // search would forbid saying so.
    expect(() => read("packages/nest/src/reverse/llm.ts")).toThrow(/ENOENT/);
    expect(policy).toContain("モデルプロバイダは**居ない**");
  });
});
