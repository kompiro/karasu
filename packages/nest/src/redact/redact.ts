/**
 * The one direction of ADR-1990 decision 2 that survives.
 *
 * It described two. `redact` scrubbed fetched source on the way in, before a
 * byte reached the model, and `assertStructureOnly` scanned the generated
 * `.krs` on the way out. #2590 removed the model, and with it the way in, so
 * a single scan is left: it runs on ingress, over a document its own author
 * submitted (`gallery/validate.ts`).
 *
 * `redact` is still the matcher underneath, but only its findings are used.
 * `assertStructureOnly` throws the scrubbed text away, because refusing is the
 * whole response here; no production path consumes the substitution.
 *
 * Refusing rather than scrubbing is what did not change, and neither did the
 * reason. A hit means something credential-shaped was about to be published,
 * and quietly cleaning it would ship the artifact while hiding the fault.
 */
import {
  isOwnPlaceholder,
  isPlaceholder,
  isSecretKey,
  REDACTION_RULES,
  type RedactionRule,
} from "./rules.js";

export interface Finding {
  /** Which rule matched. */
  ruleId: string;
  /** Where it was found: a repository path on the way in, `output` on the way out. */
  where: string;
  /**
   * The secret's length. Never the secret. A length is enough to tell two
   * findings apart in a log without the log becoming the leak.
   */
  length: number;
}

export interface RedactionResult {
  text: string;
  findings: Finding[];
}

const placeholderFor = (ruleId: string): string => `[REDACTED:${ruleId}]`;

/**
 * Fresh copy of a rule's pattern with `g` and `d`.
 *
 * `d` (hasIndices) is what makes the splice exact. The previous version did
 * `match.replace(secret, placeholder)`, which replaces the *first* occurrence
 * of the secret text inside the match — so `hunter2plus_password =
 * "hunter2plus"` redacted the key name and shipped the value, and
 * `postgres://s3cr3t_admin:s3cr3t@host` redacted part of the username and
 * shipped the password. Group indices remove the guesswork.
 */
const scanPattern = (rule: RedactionRule): RegExp =>
  new RegExp(rule.pattern.source, `${rule.pattern.flags.replace(/[gd]/g, "")}gd`);

/**
 * Replace credential-shaped material with typed placeholders.
 *
 * The placeholder names the rule rather than blanking the text, so the model
 * still sees *that* there is a token there and what kind — which is real
 * structure, and often the only evidence that a dependency needs
 * authentication at all.
 */
export function redact(text: string, where = "input"): RedactionResult {
  const findings: Finding[] = [];
  let current = text;

  for (const rule of REDACTION_RULES) {
    let out = "";
    let copiedTo = 0;
    for (const match of current.matchAll(scanPattern(rule))) {
      const span = match.indices?.[rule.secretGroup];
      if (span === undefined) continue;
      const [start, end] = span;
      const secret = current.slice(start, end);
      if (secret.length === 0) continue;
      // Never re-process what this module already wrote — that is how a
      // specific `github-token` finding got overwritten by a generic
      // `assigned-secret` one, and how `assertStructureOnly` came to refuse
      // its own output.
      if (isOwnPlaceholder(secret)) continue;
      // The reference and placeholder heuristics apply only where the value
      // is not itself format-constrained. See `isPlaceholder`.
      if (rule.secretGroup > 0 && isPlaceholder(secret)) continue;
      // An assignment rule fires on the name, not the value, which is what
      // lets its value pattern be wide enough to cover `.env` and YAML.
      if (rule.keyGroup !== undefined) {
        const keySpan = match.indices?.[rule.keyGroup];
        if (keySpan === undefined) continue;
        if (!isSecretKey(current.slice(keySpan[0], keySpan[1]))) continue;
      }
      findings.push({ ruleId: rule.id, where, length: secret.length });
      out += current.slice(copiedTo, start) + placeholderFor(rule.id);
      copiedTo = end;
    }
    current = out + current.slice(copiedTo);
  }

  return { text: current, findings };
}

/** Thrown when a document carries something credential-shaped. */
export class StructureOnlyViolation extends Error {
  constructor(readonly findings: Finding[]) {
    const kinds = [...new Set(findings.map((f) => f.ruleId))].join(", ");
    super(`a submitted document matched credential patterns and was refused: ${kinds}`);
    this.name = "StructureOnlyViolation";
  }
}

/**
 * Refuse a document that carries anything credential-shaped.
 *
 * This was the second half of an egress door: everything reaching the model
 * was redacted first, and this checked that the model had not reproduced a
 * secret anyway. #2590 removed the model and the egress, so this is now the
 * **only** scan and it runs on ingress, over a document its author submitted
 * (`gallery/validate.ts`).
 *
 * Fails closed, and does not scrub — unchanged, and for the same reason it
 * always held. A hit means something credential-shaped was about to be
 * published; scrubbing would ship the artifact and hide the fault.
 *
 * The placeholders that `redact` itself writes are not matches, because they
 * do not look like credentials — so a `.krs` describing a `[REDACTED:jwt]`
 * passes, which is correct: that is structure, not a secret.
 */
export function assertStructureOnly(krs: string): void {
  const { findings } = redact(krs, "submission");
  if (findings.length > 0) throw new StructureOnlyViolation(findings);
}
