/**
 * What the gallery checks about a submission, and what it deliberately does
 * not.
 *
 * Two checks, and no more:
 *
 * - **it parses** — a document that cannot be opened has no business in a
 *   gallery. This is not a quality bar; it is the difference between an entry
 *   and a broken link.
 * - **structure only** — a submission carrying something credential-shaped is
 *   refused rather than published.
 *
 * **The quality of the decomposition is the submitter's own.** ADR-2077 settled
 * bounded-context granularity for models the service generated, and
 * server-side generation could be held to it. A submission cannot be, and
 * should not: it is a model of the submitter's system, by them, and a service
 * that silently rejected their idea of a boundary would be vouching for
 * something it has no standing to vouch for.
 *
 * `assertStructureOnly` is reused rather than rebuilt, but its meaning moves.
 * It was the second half of an egress door: everything reaching the model went
 * through `redactFiles`, and this was the check that the model had not
 * reproduced a secret anyway. There is no model now and no egress, so this is
 * the *only* scan, and it runs on ingress. Failing closed still matters for the
 * same reason it did — a hit means something credential-shaped was about to be
 * published, and scrubbing would ship the artifact and hide the fault.
 */
import { compile } from "@karasu-tools/core";
import { assertStructureOnly, StructureOnlyViolation } from "../redact/redact.js";
import { MAX_SUBMISSION_BYTES, MAX_TITLE_LENGTH } from "../store/submissions.js";

export type SubmissionRejection =
  | { code: "empty"; message: string }
  | { code: "too_large"; message: string }
  | { code: "invalid_title"; message: string }
  | { code: "does_not_parse"; message: string }
  | { code: "credential_shaped"; message: string };

export type ValidationResult =
  | { ok: true; title: string; krs: string }
  | { ok: false; rejection: SubmissionRejection };

/**
 * Byte length, not character count.
 *
 * The cap is about storage and abuse, and a `.krs` full of Japanese labels
 * costs three bytes per character. Counting characters would let a document
 * three times the intended size through.
 */
const byteLength = (value: string): number => new TextEncoder().encode(value).length;

export function validateSubmission(rawTitle: unknown, rawKrs: unknown): ValidationResult {
  const title = typeof rawTitle === "string" ? rawTitle.trim() : "";
  const krs = typeof rawKrs === "string" ? rawKrs : "";

  if (krs.trim().length === 0) {
    return reject("empty", "A submission needs a .krs document.");
  }
  if (byteLength(krs) > MAX_SUBMISSION_BYTES) {
    return reject("too_large", `A submission must be at most ${MAX_SUBMISSION_BYTES} bytes.`);
  }
  if (title.length === 0 || title.length > MAX_TITLE_LENGTH) {
    return reject(
      "invalid_title",
      `A submission needs a title of at most ${MAX_TITLE_LENGTH} characters.`,
    );
  }

  let errors: number;
  try {
    errors = compile(krs).diagnostics.filter(
      (diagnostic) => diagnostic.severity === "error",
    ).length;
  } catch {
    // A parser that throws rather than reporting is still "this does not
    // parse" from where a submitter stands.
    return reject("does_not_parse", "This .krs could not be parsed.");
  }
  if (errors > 0) {
    // The count, not the diagnostics. A submitter has the same compiler
    // locally and gets the messages there with the line numbers attached;
    // relaying them here would make this route a second, worse diagnostics
    // surface that has to be kept in step with the first.
    return reject("does_not_parse", `This .krs has ${errors} error(s) and cannot be opened.`);
  }

  try {
    assertStructureOnly(krs);
  } catch (cause) {
    if (cause instanceof StructureOnlyViolation) {
      // The rule ids, not the matched text. Naming what was recognised tells
      // the submitter what to remove; echoing the value would put the secret
      // in a response, a log and possibly a screenshot.
      const kinds = [...new Set(cause.findings.map((finding) => finding.ruleId))].join(", ");
      return reject(
        "credential_shaped",
        `This .krs contains something credential-shaped (${kinds}) and was not stored.`,
      );
    }
    throw cause;
  }

  return { ok: true, title, krs };
}

const reject = (code: SubmissionRejection["code"], message: string): ValidationResult => ({
  ok: false,
  rejection: { code, message } as SubmissionRejection,
});
