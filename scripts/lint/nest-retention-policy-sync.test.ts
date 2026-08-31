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

/** The store whose two expiries every document below has to agree with. */
const SESSIONS = "packages/nest/src/store/sessions.ts";

/**
 * The two drafts a public submission surface needs (#2591).
 *
 * They are checked here for the same reason the technical document is, only
 * more so: a privacy policy that states a retention the code does not honour
 * is not a stale doc, it is a promise the service breaks. Three documents now
 * state the same facts, and three copies of a fact drift
 * (TPL-1032) — so every one of them is asserted against the code, not against
 * each other.
 *
 * They are drafts and are deliberately NOT in the docs site's
 * `PUBLISHED_EN_FILES`: publishing unreviewed legal text is the thing their
 * own warning banner forbids. This guard is what keeps them true while they
 * wait for review.
 */
const DRAFTS = ["docs/policy/nest-privacy.md", "docs/policy/nest-terms.md"];

/** The single window third-party complaints arrive through. */
const CONTACT = "https://github.com/kompiro/karasu/issues";

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

  it("says in the privacy policy that a submission is kept until its author deletes it", () => {
    // The privacy policy is what a submitter actually reads. If it says a
    // number and the code keeps things forever -- or the reverse -- the
    // document is the part that is wrong, and nothing else would catch it.
    expect(read("docs/policy/nest-privacy.md")).toContain("**投稿者が削除するまで**");
  });

  it("does not promise a session that renews itself indefinitely", () => {
    // The window used to be fixed at issue and this guard held the documents
    // to that. #2655 made it slide, which is what the guard was built to
    // catch: it is anchored on the code comment, so the implementation change
    // failed it until the documents followed. That is the whole point of it,
    // and the reason it was rewritten here rather than deleted.
    //
    // What it protects is unchanged. Sliding is safe only because a second,
    // unmovable expiry sits outside it -- so the **cap** is now the fact every
    // document has to state, where the fixed window used to be. A draft that
    // describes a session extended on use without saying where that stops is
    // describing a credential that renews itself forever.
    expect(read(SESSIONS)).toContain("Renewed on use, up to an absolute cap");
    for (const document of [POLICY, ...DRAFTS]) {
      expect(read(document)).toContain("発行から 90 日");
    }
  });

  it("keeps every draft out of the published set until a human has read it", () => {
    // Their own banner says they must not be published. This is that banner
    // as a check, because a banner is not a gate.
    const siteMap = read("packages/docs-site/scripts/lib/site-map.ts");
    for (const draft of DRAFTS) {
      expect(read(draft)).toContain("法務レビュー未了");
      expect(siteMap).not.toContain(draft.replace("docs/", ""));
    }
  });

  it("names one contact point, and the same one, in every draft", () => {
    // Third-party complaints arrive as GitHub Issues: no form, no new personal
    // data, publicly auditable. A draft that quietly grew an email address
    // would undo the reason no email is held.
    // "One" has to mean no second window beside it, not merely that this one
    // is present -- so every external URL in the draft is collected and the set
    // has to be exactly this one. An email address is caught separately because
    // it is the form a contact point grows in without looking like a link.
    for (const draft of DRAFTS) {
      const text = read(draft);
      // A link to one issue (`/issues/2591`) is a citation, not a window;
      // the window is the list you file into. Dropping the numbered form keeps
      // the check on contact points, and any other host still fails it.
      const urls = [...new Set(text.match(/https?:\/\/[^\s)>）]+/g) ?? [])].filter(
        (url) => !/\/issues\/\d+$/.test(url),
      );
      expect(urls).toEqual([CONTACT]);
      expect(text).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/);
    }
  });

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
    // Two numbers now, because a sliding window is only half the statement.
    // Both are asserted against the document: an idle window quoted without
    // its cap reads as a session that never ends.
    expect(constant(SESSIONS, "SESSION_IDLE_TTL_SECONDS")).toBe(30 * 24 * 60 * 60);
    expect(constant(SESSIONS, "SESSION_ABSOLUTE_TTL_SECONDS")).toBe(90 * 24 * 60 * 60);
    expect(policy).toMatch(
      /`sess\/v1\/<account>\/<session>` \| 最終使用から 30 日。ただし発行から 90 日を超えない/,
    );
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
