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
import { isPlaceholder, REDACTION_RULES, type RedactionRule } from "./rules.js";

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

/** Fresh, global-flagged copy of a rule's pattern; the rules are stateless. */
const globalPattern = (rule: RedactionRule): RegExp =>
  new RegExp(rule.pattern.source, `${rule.pattern.flags.replace("g", "")}g`);

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
    const pattern = globalPattern(rule);
    current = current.replace(pattern, (match, ...groups: unknown[]) => {
      const secret =
        rule.secretGroup === 0 ? match : ((groups[rule.secretGroup - 1] as string) ?? "");
      if (secret.length === 0) return match;
      if (isPlaceholder(secret)) return match;
      findings.push({ ruleId: rule.id, where, length: secret.length });
      // For a group rule, splice the placeholder in and keep the surroundings
      // — the scheme, host and key name are structure worth preserving.
      return rule.secretGroup === 0
        ? placeholderFor(rule.id)
        : match.replace(secret, placeholderFor(rule.id));
    });
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
