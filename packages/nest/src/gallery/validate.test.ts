import { describe, expect, it } from "vitest";
import { validateSubmission, type SubmissionRejection } from "./validate.js";
import { MAX_SUBMISSION_BYTES, MAX_TITLE_LENGTH } from "../store/submissions.js";

const KRS = "system Shop {\n  service api\n}\n";

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
