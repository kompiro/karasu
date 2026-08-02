/**
 * The credential-shaped patterns karasu-nest looks for.
 *
 * ADR-1990 decision 2 requires two things of this rule set, pulling in
 * opposite directions: nothing credential-shaped may reach the LLM, and the
 * model must still see enough structure to describe the system. A rule that
 * redacts every long random-looking string satisfies the first and destroys
 * the second — a `.krs` reversed from a file where every identifier became
 * `[REDACTED]` is worthless, and worthless output is how a safety measure gets
 * turned off.
 *
 * So the rules are **anchored on the credential's own format**, not on
 * entropy. A GitHub token is recognisable because GitHub gave it a prefix and
 * a length; a private key is recognisable because PEM says so. Where a format
 * gives no anchor, an assignment keyword provides one: `password = "..."` is a
 * secret because of the left-hand side, not because of the right.
 *
 * There is no `gitleaks` binary in a Workers runtime, so these are ours. They
 * are informed by gitleaks' patterns rather than derived from them, and the
 * near-miss tests matter as much as the positive ones.
 */

export interface RedactionRule {
  /** Stable identifier, reported in findings and used in placeholders. */
  id: string;
  /** What it recognises, for a human reading a report. */
  description: string;
  pattern: RegExp;
  /**
   * Which capture group holds the secret. `0` means the whole match.
   *
   * Assignment rules match `key = value` and redact only the value, so the
   * key survives — the model still learns that a config has a `password`
   * field, which is real structure, without learning the password.
   */
  secretGroup: number;
}

/**
 * Every rule is written with the global flag stripped. `matchAll` needs `g`
 * and a shared stateful regex across calls is a classic source of
 * every-other-match bugs, so the scanner clones each pattern per use.
 */
export const REDACTION_RULES: readonly RedactionRule[] = [
  {
    id: "github-token",
    description: "GitHub personal access, OAuth, user, server or refresh token",
    // ghp_ / gho_ / ghu_ / ghs_ / ghr_ + 36 or more base62.
    pattern: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/,
    secretGroup: 0,
  },
  {
    id: "github-fine-grained-token",
    description: "GitHub fine-grained personal access token",
    pattern: /\bgithub_pat_[A-Za-z0-9_]{22,}\b/,
    secretGroup: 0,
  },
  {
    id: "aws-access-key-id",
    description: "AWS access key id",
    pattern: /\b(?:AKIA|ASIA|ABIA|ACCA)[A-Z0-9]{16}\b/,
    secretGroup: 0,
  },
  {
    id: "slack-token",
    description: "Slack bot, user or app token",
    pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/,
    secretGroup: 0,
  },
  {
    id: "stripe-key",
    description: "Stripe secret or restricted key",
    pattern: /\b[sr]k_(?:live|test)_[A-Za-z0-9]{16,}\b/,
    secretGroup: 0,
  },
  {
    id: "google-api-key",
    description: "Google API key",
    pattern: /\bAIza[A-Za-z0-9_-]{35}\b/,
    secretGroup: 0,
  },
  {
    id: "anthropic-key",
    description: "Anthropic API key",
    pattern: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/,
    secretGroup: 0,
  },
  {
    id: "openai-key",
    description: "OpenAI API key",
    // `sk-ant-` is excluded rather than relying on rule order: both would
    // redact the value, but the finding would name the wrong vendor, and a
    // finding's whole job is to say what leaked.
    pattern: /\bsk-(?!ant-)(?:proj-)?[A-Za-z0-9_-]{20,}\b/,
    secretGroup: 0,
  },
  {
    id: "private-key-block",
    description: "PEM private key block",
    // Spans lines on purpose: the armour without the body is not a secret,
    // and redacting only the header would leave the key material behind.
    pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/,
    secretGroup: 0,
  },
  {
    id: "jwt",
    description: "JSON Web Token",
    // Three base64url segments; the header segment must decode to something
    // starting `{"`, which `eyJ` is. Two segments alone are too common.
    pattern: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/,
    secretGroup: 0,
  },
  {
    id: "connection-string-password",
    description: "Password inside a URI's userinfo",
    // Only the password is redacted; scheme, user and host are structure the
    // model legitimately needs to describe a dependency.
    pattern: /\b([a-z][a-z0-9+.-]*:\/\/[^\s:/@]+):([^\s@/]+)@/i,
    secretGroup: 2,
  },
  {
    id: "assigned-secret",
    description: "A value assigned to a secret-sounding name",
    // The left-hand side is the evidence. Quoted values only: an unquoted
    // `password = getenv("X")` is a reference, not a secret, and redacting it
    // would erase the fact that the value comes from the environment.
    // The keyword may sit at the end of a longer name (`database_password`),
    // and may carry a suffix only after a separator. Requiring the separator
    // is what keeps `tokenizer = "gpt2-base"` out: `token` followed directly
    // by more letters is a different word, not a qualified name.
    pattern:
      /\b([a-z0-9_.-]*(?:api[_-]?keys?|secrets?|passwords?|passwd|pwd|tokens?|access[_-]?keys?|private[_-]?keys?|client[_-]?secrets?|auth[_-]?tokens?)(?:[_-][a-z0-9_-]+)?)\s*[:=]\s*["']([^"'\n]{8,})["']/i,
    secretGroup: 2,
  },
];

/**
 * Values that look assigned but are placeholders, examples or references.
 *
 * Without this, a redacted document is full of `[REDACTED:assigned-secret]`
 * where the source said `password = "changeme"`, and the model loses the
 * information that a default exists. Matched case-insensitively against the
 * whole captured value.
 */
const PLACEHOLDER_VALUES = new Set([
  "changeme",
  "password",
  "your_password",
  "your-password",
  "yourpassword",
  "secret",
  "your_secret",
  "mysecret",
  "example",
  "placeholder",
  "redacted",
  "xxxxxxxx",
  "todo",
  "none",
  "null",
  "undefined",
  "hunter2",
]);

/**
 * Whether a captured value is obviously not a real credential.
 *
 * Deliberately narrow. A false negative here means redacting a placeholder,
 * which costs a little fidelity; being too clever would mean *not* redacting
 * something real.
 */
export function isPlaceholder(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (PLACEHOLDER_VALUES.has(normalized)) return true;
  // `${VAR}`, `{{var}}`, `<your-key>`, `$ENV_VAR`, `os.environ[...]` — all
  // references to a value rather than the value.
  if (/^[$<{]/.test(normalized)) return true;
  if (/^[a-z_][a-z0-9_]*\s*\(/.test(normalized)) return true;
  // A single repeated character is a mask, not a key.
  if (/^(.)\1*$/.test(normalized)) return true;
  return false;
}
