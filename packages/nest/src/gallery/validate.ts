/**
 * What the gallery checks about a submission, and what it deliberately does
 * not.
 *
 * **Two judgements, and no more.** The gallery decides only:
 *
 * - **it parses** — a document that cannot be opened has no business in a
 *   gallery. This is not a quality bar; it is the difference between an entry
 *   and a broken link.
 * - **structure only** — a submission carrying something credential-shaped is
 *   refused rather than published.
 *
 * Three shape preconditions run alongside them (there is a document, it is
 * within the cap, it has a title). Those are not judgements about the model —
 * they are the difference between a request and a malformed one — but they do
 * reject, so counting the judgements as "the checks" and leaving them unsaid
 * would understate what this function can turn away.
 *
 * **The quality of the decomposition is the submitter's own.** ADR-2077 settled
 * bounded-context granularity for models the service generated, and
 * server-side generation could be held to it. A submission cannot be, and
 * should not: it is a model of the submitter's system, by them, and a service
 * that silently rejected their idea of a boundary would be vouching for
 * something it has no standing to vouch for.
 *
 * **The parse gate reads `Parser.parse`, not `compile`.** `compile` runs the
 * project-level checks after parsing — `duplicate-edge-id` among them — so a
 * syntactically perfect document with two edges sharing an author-given id
 * came back as `does_not_parse`, which was both a refusal the decision above
 * does not authorise and a false statement about the document. Those findings
 * are quality, and quality is the submitter's. (Verified: such a document
 * renders — `buildAllViewsSvg` returns an SVG and reports no error of its own.)
 *
 * **Line endings are normalised, and that is a storage decision rather than a
 * parsing one.** The parser reads CRLF perfectly well. But a browser
 * serialising a `<textarea>` as `application/x-www-form-urlencoded` rewrites
 * every line ending to CRLF, so a submitter who opens the console, edits only
 * the title and saves would have every line of their document rewritten —
 * `?format=krs` then hands back something that no longer matches the file on
 * their disk, and each line costs a byte against `MAX_SUBMISSION_BYTES`.
 * Normalising here rather than in the console route means both doors store one
 * spelling of a document, which is the property worth having.
 *
 * `assertStructureOnly` is reused rather than rebuilt, but its meaning moves.
 * It was the second half of an egress door: everything reaching the model went
 * through `redactFiles`, and this was the check that the model had not
 * reproduced a secret anyway. There is no model now and no egress, so this is
 * the *only* scan, and it runs on ingress. Failing closed still matters for the
 * same reason it did — a hit means something credential-shaped was about to be
 * published, and scrubbing would ship the artifact and hide the fault.
 */
import { Parser } from "@karasu-tools/core";
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
  // Before the size check, not after: the cap has to count the bytes that get
  // stored, and CRLF is one byte per line more than what is stored.
  const krs = typeof rawKrs === "string" ? rawKrs.replaceAll("\r\n", "\n") : "";

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
    errors = Parser.parse(krs).diagnostics.filter(
      (diagnostic) => diagnostic.severity === "error",
    ).length;
  } catch {
    // A parser that throws rather than reporting is still "this does not
    // parse" from where a submitter stands.
    return reject("does_not_parse", "This .krs could not be parsed.");
  }
  if (errors > 0) {
    // The count, not the diagnostics. A submitter has the same parser locally
    // and gets the messages there with the line numbers attached; relaying
    // them here would make this route a second, worse diagnostics surface
    // that has to be kept in step with the first.
    return reject(
      "does_not_parse",
      `This .krs has ${errors} syntax error(s) and cannot be opened.`,
    );
  }

  // The title is scanned too. It is stored and, at the default visibility,
  // published — so a scan that read only the document would leave the one
  // other field a submitter can put a secret in unguarded.
  const violation = firstCredentialViolation([
    { label: "title", text: title },
    { label: ".krs", text: krs },
  ]);
  if (violation !== undefined) return reject("credential_shaped", violation);

  return { ok: true, title, krs };
}

/**
 * Scan each field and describe the first that trips, or `undefined`.
 *
 * The message names the rule and **where in the document** it fired, never the
 * matched text: naming what was recognised tells the submitter what to remove,
 * while echoing the value would put the secret in a response, a log and
 * possibly a screenshot. Locations matter because the alternative is a rule id
 * against a document of any length, which is not enough to act on.
 */
function firstCredentialViolation(
  fields: readonly { label: string; text: string }[],
): string | undefined {
  for (const field of fields) {
    try {
      assertStructureOnly(field.text);
    } catch (cause) {
      if (!(cause instanceof StructureOnlyViolation)) throw cause;
      const kinds = [...new Set(cause.findings.map((finding) => finding.ruleId))];
      const where = locate(field.text, kinds);
      return (
        `The ${field.label} contains something credential-shaped ` +
        `(${where}) and was not stored.`
      );
    }
  }
  return undefined;
}

/**
 * Turn rule ids into `rule at line N` where a line can be pinned.
 *
 * `Finding` carries the rule and the secret's length but no offset, so the
 * lines are recovered by scanning again line by line. One rule
 * (`private-key-block`) spans lines on purpose and a single-line pass cannot
 * see it — that one is reported without a line rather than with a wrong one.
 */
function locate(text: string, ruleIds: readonly string[]): string {
  const lines = new Map<string, number[]>();
  text.split("\n").forEach((line, index) => {
    try {
      assertStructureOnly(line);
    } catch (cause) {
      if (!(cause instanceof StructureOnlyViolation)) throw cause;
      for (const finding of cause.findings) {
        lines.set(finding.ruleId, [...(lines.get(finding.ruleId) ?? []), index + 1]);
      }
    }
  });
  return ruleIds
    .map((ruleId) => {
      const found = lines.get(ruleId);
      return found === undefined ? ruleId : `${ruleId} at line ${found.join(", ")}`;
    })
    .join("; ");
}

const reject = (code: SubmissionRejection["code"], message: string): ValidationResult => ({
  ok: false,
  rejection: { code, message } as SubmissionRejection,
});
