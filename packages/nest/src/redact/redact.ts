/**
 * The two directions of ADR-1990 decision 2.
 *
 * `redact` runs on the way in: fetched source is scrubbed before a single byte
 * reaches the model. `assertStructureOnly` runs on the way out: the generated
 * `.krs` is scanned again, and a document that trips it is **refused**, not
 * cleaned. The asymmetry is the point. On the input side a false positive
 * costs a little fidelity, so redaction is the right response. On the output
 * side a hit means something went wrong upstream — the model reproduced
 * something it should never have seen, or a rule missed on the way in — and
 * quietly scrubbing it would hide the failure while shipping the artifact.
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

/** Redact a whole file set, tagging each finding with its path. */
export function redactFiles(files: readonly { path: string; content: string }[]): {
  files: { path: string; content: string }[];
  findings: Finding[];
} {
  const findings: Finding[] = [];
  const redacted = files.map((file) => {
    const result = redact(file.content, file.path);
    findings.push(...result.findings);
    return { path: file.path, content: result.text };
  });
  return { files: redacted, findings };
}

/** Thrown when generated output carries something credential-shaped. */
export class StructureOnlyViolation extends Error {
  constructor(readonly findings: Finding[]) {
    const kinds = [...new Set(findings.map((f) => f.ruleId))].join(", ");
    super(`generated output matched credential patterns and was refused: ${kinds}`);
    this.name = "StructureOnlyViolation";
  }
}

/**
 * Refuse a generated document that carries anything credential-shaped.
 *
 * Fails closed, and does not scrub. A hit here is evidence that the input
 * redaction missed or that the model reproduced something it should not have,
 * and both need to be visible. Scrubbing would ship the artifact and hide the
 * fault, which is the same trade the ADR refused when it put a second scan
 * here at all.
 *
 * The placeholders that `redact` itself writes are not matches, because they
 * do not look like credentials — so a `.krs` describing a `[REDACTED:jwt]`
 * passes, which is correct: that is structure, not a secret.
 */
export function assertStructureOnly(krs: string): void {
  const { findings } = redact(krs, "output");
  if (findings.length > 0) throw new StructureOnlyViolation(findings);
}
