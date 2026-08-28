import { describe, expect, it } from "vitest";
import { validateSubmission, type SubmissionRejection } from "./validate.js";
import { MAX_SUBMISSION_BYTES, MAX_TITLE_LENGTH } from "../store/submissions.js";

const KRS = "system Shop {\n  service api\n}\n";

/** Split so the literal never appears in this file; see the PEM test below. */
const PEM_LABEL = "RSA PRIVATE KEY";

/** A valid document whose free-text field carries `text`. */
const withDescription = (text: string): string =>
  `system Shop {\n  service api {\n    description "${text}"\n  }\n}\n`;

const rejectionOf = (title: unknown, krs: unknown): string | undefined => {
  const result = validateSubmission(title, krs);
  return result.ok ? undefined : result.rejection.code;
};

/** The rejection, or a failure that names what was accepted instead. */
const rejection = (title: unknown, krs: unknown): SubmissionRejection => {
  const result = validateSubmission(title, krs);
  if (result.ok) throw new Error("expected a rejection, but the submission was accepted");
  return result.rejection;
};

describe("validateSubmission", () => {
  it("accepts a document that parses, and trims the title", () => {
    const result = validateSubmission("  Shop  ", KRS);
    expect(result).toEqual({ ok: true, title: "Shop", krs: KRS });
  });

  it("refuses a document that cannot be opened", () => {
    // Not a quality bar: the difference between an entry and a broken link.
    expect(rejectionOf("Shop", "system Shop {\n  service\n")).toBe("does_not_parse");
  });

  it("says how many errors there are, not what they are", () => {
    // The submitter has the same compiler locally and gets the messages there
    // with line numbers. Relaying them would make this a second, worse
    // diagnostics surface that has to be kept in step with the first.
    expect(rejection("Shop", "system Shop {\n  service\n").message).toMatch(/error\(s\)/);
  });

  it("refuses a document carrying something credential-shaped", () => {
    const withSecret = withDescription(`ghp_${"a".repeat(36)}`);
    expect(rejectionOf("Shop", withSecret)).toBe("credential_shaped");
  });

  it("names the rule that fired, never the value it matched", () => {
    // Echoing the value would put the secret in a response, a log, and
    // possibly a screenshot.
    const secret = `ghp_${"a".repeat(36)}`;
    expect(rejection("Shop", withDescription(secret)).message).not.toContain(secret);
  });

  it("refuses an empty document and a missing one alike", () => {
    expect(rejectionOf("Shop", "")).toBe("empty");
    expect(rejectionOf("Shop", "   \n")).toBe("empty");
    expect(rejectionOf("Shop", undefined)).toBe("empty");
  });

  it("requires a title, and bounds it", () => {
    expect(rejectionOf("", KRS)).toBe("invalid_title");
    expect(rejectionOf("   ", KRS)).toBe("invalid_title");
    expect(rejectionOf("x".repeat(MAX_TITLE_LENGTH + 1), KRS)).toBe("invalid_title");
    expect(rejectionOf("x".repeat(MAX_TITLE_LENGTH), KRS)).toBeUndefined();
  });

  it("measures the cap in bytes, so multibyte labels are not three times the size", () => {
    // A `.krs` full of Japanese labels costs three bytes per character.
    // Counting characters would let a document three times the cap through.
    const multibyte = "あ".repeat(MAX_SUBMISSION_BYTES / 3);
    expect(multibyte.length).toBeLessThan(MAX_SUBMISSION_BYTES);
    expect(rejectionOf("Shop", `system Shop {\n  service api "${multibyte}"\n}\n`)).toBe(
      "too_large",
    );
  });

  it("accepts a document whose only errors are semantic, not syntactic", () => {
    // `compile` runs the project-level checks after parsing, so two edges
    // sharing an author-given id came back as `does_not_parse` -- a refusal
    // the decision does not authorise, and a false statement about a document
    // that parses cleanly and renders. Found by CodeRabbit on #2601.
    const duplicateEdgeIds = `system Shop {
  service api
  service worker
  resource db [database]
  api -> db #shared
  worker -> db #shared
}
`;
    expect(validateSubmission("Shop", duplicateEdgeIds).ok).toBe(true);
  });

  it("still refuses a document with a real syntax error", () => {
    expect(rejectionOf("Shop", "system Shop {\n  service\n")).toBe("does_not_parse");
  });

  it("scans the title, which is stored and published like the document", () => {
    const secret = `ghp_${"a".repeat(36)}`;
    expect(rejectionOf(`Shop ${secret}`, KRS)).toBe("credential_shaped");
  });

  it("says which field tripped, so the submitter knows where to look", () => {
    const secret = `ghp_${"a".repeat(36)}`;
    expect(rejection(`Shop ${secret}`, KRS).message).toContain("title");
    expect(rejection("Shop", withDescription(secret)).message).toContain(".krs");
  });

  it("gives a line number, because a rule id alone is not actionable", () => {
    // A rule id against a document of any length tells a submitter what was
    // recognised but not where; both are needed to fix it.
    const secret = `ghp_${"a".repeat(36)}`;
    const document = `system Shop {\n  service api {\n    description "${secret}"\n  }\n}\n`;
    expect(rejection("Shop", document).message).toMatch(/github-token at line 3/);
  });

  it("names a multi-line rule without inventing a line for it", () => {
    // `private-key-block` spans lines on purpose, so the line-by-line pass
    // cannot see it. Reporting it without a line beats reporting a wrong one.
    // The armour is assembled from a label rather than written out, so the
    // literal `gitleaks` scans for never appears in this source file
    // (`redact.test.ts` builds its fixture the same way).
    const pem = [`-----BEGIN ${PEM_LABEL}-----`, "a".repeat(64), `-----END ${PEM_LABEL}-----`].join(
      "\n",
    );
    const message = rejection(
      "Shop",
      `system Shop {\n  service api {\n    description "${pem}"\n  }\n}\n`,
    ).message;
    expect(message).toContain("private-key-block");
    expect(message).not.toMatch(/private-key-block at line/);
  });

  it("never puts the matched value in the message, wherever it was found", () => {
    const secret = `ghp_${"a".repeat(36)}`;
    expect(rejection(`Shop ${secret}`, KRS).message).not.toContain(secret);
    expect(rejection("Shop", withDescription(secret)).message).not.toContain(secret);
  });

  it("does not judge the decomposition, only that it opens", () => {
    // The quality of the decomposition is the submitter's own. A service that
    // rejected their idea of a boundary would be vouching for something it
    // has no standing to vouch for.
    const oneBigDomain = `system Everything {\n  domain all {\n${Array.from(
      { length: 40 },
      (_unused, index) => `    service s${index}`,
    ).join("\n")}\n  }\n}\n`;
    expect(validateSubmission("Everything", oneBigDomain).ok).toBe(true);
  });
});
