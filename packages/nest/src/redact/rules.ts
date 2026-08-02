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
 * gives no anchor, the assignment's left-hand side provides one: a value is a
 * secret because of the name it was assigned to.
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
  /** Which capture group holds the secret. `0` means the whole match. */
  secretGroup: number;
  /**
   * For assignment rules: which group holds the name the value was assigned
   * to. The rule only fires when that name reads as a secret, which is what
   * lets the value pattern stay wide enough to cover `.env` and YAML without
   * eating every string in the repository.
   */
  keyGroup?: number;
}

/**
 * The name half of an assignment rule.
 *
 * Tested against a separator-normalised key, so `clientSecret`, `client_secret`
 * and `CLIENT-SECRET` all read the same. The keyword must sit on a separator
 * boundary: that is what keeps `tokenizer` and `passwordStrength` out, where a
 * substring test would not.
 */
const SECRET_KEY_WORDS =
  /(?:^|_)(?:api_?keys?|secrets?|passwords?|passwd|pwd|tokens?|access_?keys?|private_?keys?|client_?secrets?|auth_?tokens?|authtokens?|credentials?|passphrase)(?:$|_)/;

/** Whether a name reads as holding a credential. */
export function isSecretKey(key: string): boolean {
  const normalized = key
    // camelCase and dotted / dashed paths all become `_`-separated.
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[.\-\s]+/g, "_")
    .toLowerCase();
  return SECRET_KEY_WORDS.test(normalized);
}

/**
 * The assignment shape, split from the key test on purpose.
 *
 * The identifier is a bounded, single-pass character class rather than a
 * `prefix + keyword + suffix` regex. The regex form backtracked quadratically:
 * `"token_".repeat(n) + "x"` took ~4 seconds at 240 KB, which is a CPU-limit
 * kill on a Worker scanning untrusted repository content.
 */
// The optional quotes around the key are what let JSON (`"clientSecret": …`)
// participate; without them the closing quote breaks the match.
const ASSIGNMENT_KEY = String.raw`["']?([A-Za-z_][A-Za-z0-9_.\-]{0,63})["']?\s*[:=]\s*`;

/**
 * Every rule is written without the global flag. A shared stateful regex
 * across calls is a classic source of every-other-match bugs, so the scanner
 * clones each pattern per use.
 */
export const REDACTION_RULES: readonly RedactionRule[] = [
  {
    id: "github-token",
    description: "GitHub personal access, OAuth, user, server or refresh token",
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
    id: "sendgrid-key",
    description: "SendGrid API key",
    pattern: /\bSG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\b/,
    secretGroup: 0,
  },
  {
    id: "twilio-key",
    description: "Twilio account or API SID",
    pattern: /\b(?:AC|SK)[0-9a-f]{32}\b/,
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
    // redact the value, but the finding would name the wrong vendor, and
    // naming what leaked is a finding's whole job.
    pattern: /\bsk-(?!ant-)(?:proj-)?[A-Za-z0-9_-]{20,}\b/,
    secretGroup: 0,
  },
  {
    id: "private-key-block",
    description: "PEM or OpenSSH private key block",
    // Spans lines on purpose: the armour without the body is not a secret,
    // and redacting only the header would leave the key material behind.
    // OpenSSH keys are covered because their armour says "PRIVATE KEY" too.
    pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/,
    secretGroup: 0,
  },
  {
    id: "bcrypt-hash",
    description: "bcrypt / crypt password hash",
    // Not reversible, but it is a credential in a htpasswd or a fixture and
    // there is no reason to hand it to a model.
    pattern: /\$2[aby]?\$\d{2}\$[./A-Za-z0-9]{53}/,
    secretGroup: 0,
  },
  {
    id: "basic-auth-header",
    description: "HTTP Basic credentials",
    pattern: /\bBasic\s+([A-Za-z0-9+/]{16,}={0,2})/,
    secretGroup: 1,
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
    pattern: /\b[a-z][a-z0-9+.-]*:\/\/[^\s:/@]+:([^\s@/]+)@/i,
    secretGroup: 1,
  },
  {
    id: "assigned-secret",
    description: "A quoted value assigned to a secret-sounding name",
    pattern: new RegExp(`\\b${ASSIGNMENT_KEY}["']([^"'\\n]{8,})["']`),
    secretGroup: 2,
    keyGroup: 1,
  },
  {
    id: "assigned-secret-bare",
    description: "An unquoted value assigned to a secret-sounding name",
    // `.env`, `.npmrc`, YAML and Dockerfiles do not quote. Without this the
    // most common place a real credential lives is invisible to the scanner.
    // A reference (`$VAR`, `config.token`, `getSecret(x)`) is excluded by
    // `isPlaceholder`, so what is left is a literal.
    // Brackets are excluded from the value so a `[REDACTED:…]` placeholder
    // cannot be partially captured — that made `assertStructureOnly` refuse
    // output this module had itself produced.
    pattern: new RegExp(`\\b${ASSIGNMENT_KEY}([^\\s"'\\n#;,}\\]\\[)]{8,})`),
    secretGroup: 2,
    keyGroup: 1,
  },
];

/**
 * Values that look assigned but are placeholders, examples or references.
 *
 * Without this, a redacted document is full of `[REDACTED:assigned-secret]`
 * where the source said `password = "changeme"`, and the model loses the
 * information that a default exists.
 */
const PLACEHOLDER_VALUES = new Set([
  "changeme",
  "change_me",
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
  "todo",
  "none",
  "null",
  "nil",
  "undefined",
  "hunter2",
]);

/** `${VAR}`, `{{var}}`, `<your-key>`, `$UPPER_SNAKE` — a reference, not a value. */
const REFERENCE_FORMS = [/^\$\{[^}]*\}$/, /^\{\{.*\}\}$/, /^<[^>]*>$/, /^\$[A-Z][A-Z0-9_]*$/];

/** `getSecret(name)` — a call, not a value. */
const CALL_FORM = /^[A-Za-z_][A-Za-z0-9_]*\s*\(/;

/** `config.token`, `process.env.API_KEY` — a path to a value, not the value. */
const DOTTED_PATH_FORM = /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)+$/;

/** What this module itself writes. Never re-redact, never refuse. */
const OWN_PLACEHOLDER = /^\[REDACTED:[a-z-]+\]$/;

/** Whether a value is a placeholder this module already wrote. */
export function isOwnPlaceholder(value: string): boolean {
  return OWN_PLACEHOLDER.test(value.trim());
}

/**
 * Whether a captured value is obviously not a real credential.
 *
 * Deliberately narrow, and specific about reference syntax rather than
 * checking a leading character: `^[$<{]` once whitelisted every bcrypt hash,
 * because those start `$2b$`.
 *
 * Only consulted for rules whose captured value is **not** itself
 * format-constrained (the assignment rules, a URI's userinfo, a Basic header).
 * A format-anchored rule already knows what it matched, and running these
 * heuristics against it can only produce a miss — a JWT is three dot-separated
 * identifier-ish segments, which is exactly the shape of `config.token`.
 */
export function isPlaceholder(value: string): boolean {
  const trimmed = value.trim();
  if (OWN_PLACEHOLDER.test(trimmed)) return true;
  const normalized = trimmed.toLowerCase();
  if (PLACEHOLDER_VALUES.has(normalized)) return true;
  if (REFERENCE_FORMS.some((form) => form.test(trimmed))) return true;
  if (CALL_FORM.test(trimmed)) return true;
  if (DOTTED_PATH_FORM.test(trimmed)) return true;
  // A single repeated character is a mask, not a key.
  if (/^(.)\1*$/.test(normalized)) return true;
  return false;
}
