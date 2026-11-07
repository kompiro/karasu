import { describe, expect, it } from "vitest";
import { assertStructureOnly, redact } from "./redact.js";
import { REDACTION_RULES } from "./rules.js";

// Fences what TPL-2287 asks of every rule, not of the rules that happened to
// have a bug. The table is keyed by rule id and checked against
// `REDACTION_RULES`, so a new rule cannot land without its row: a near-miss, a
// hostile input and, where the secret is a capture group, a decoy.

interface RuleContract {
  /** The text around the secret; the secret between them is what gets replaced. */
  before: string;
  secret: string;
  after: string;
  /** Reads like this rule's input, and no rule may touch it. */
  nearMiss: string;
  /** Built to make this rule's pattern work hard. It need not end up redacted. */
  hostile: string;
  /**
   * A match holding an earlier copy of the secret, so a splice by substring
   * would hit the copy. `null` when the rule cannot hold one: the secret is the
   * whole match, or the text before it is fixed.
   */
  decoy: { source: string; expected: string } | null;
}

/**
 * Capture-group rules with no room for a decoy, because the text before the
 * secret is a fixed word that the secret's own pattern cannot repeat.
 */
const FIXED_TEXT_BEFORE_SECRET = ["basic-auth-header"];

/** About the size of the input the original quadratic pattern took 4 seconds on. */
const HOSTILE_BYTES = 240_000;
const hostileFrom = (unit: string): string => unit.repeat(Math.ceil(HOSTILE_BYTES / unit.length));

// Composed at runtime so this file trips neither `gitleaks` nor a reader's
// alarm: none of these are real.
const PRIVATE = "PRIVATE KEY";
const alnum = (length: number): string => "a1B2c3D4e5F6g7H8".repeat(8).slice(0, length);

const CONTRACTS: Record<string, RuleContract> = {
  "github-token": {
    before: 'const key = "',
    secret: `ghp_${alnum(36)}`,
    after: '";',
    nearMiss: `const key = "ghp_${alnum(35)}";`,
    hostile: hostileFrom("ghp_"),
    decoy: null,
  },
  "github-fine-grained-token": {
    before: 'const key = "',
    secret: `github_pat_${alnum(22)}`,
    after: '";',
    nearMiss: `const key = "github_pat_${alnum(21)}";`,
    hostile: hostileFrom("github_pat-"),
    decoy: null,
  },
  "aws-access-key-id": {
    before: 'const id = "',
    secret: `AKIA${"A1B2C3D4".repeat(2)}`,
    after: '";',
    nearMiss: `const id = "AKIA${"A1B2C3D4".repeat(2).slice(1)}";`,
    hostile: hostileFrom("AKIA"),
    decoy: null,
  },
  "slack-token": {
    before: 'const key = "',
    secret: `xoxb-${alnum(10)}`,
    after: '";',
    nearMiss: `const key = "xoxb-${alnum(9)}";`,
    hostile: hostileFrom("xoxb_"),
    decoy: null,
  },
  "stripe-key": {
    before: 'const key = "',
    secret: `sk_live_${alnum(16)}`,
    after: '";',
    nearMiss: `const key = "sk_live_${alnum(15)}";`,
    hostile: hostileFrom("sk_live_"),
    decoy: null,
  },
  "google-api-key": {
    before: 'const key = "',
    secret: `AIza${alnum(35)}`,
    after: '";',
    nearMiss: `const key = "AIza${alnum(34)}";`,
    hostile: hostileFrom("AIza."),
    decoy: null,
  },
  "sendgrid-key": {
    before: 'const key = "',
    secret: `SG.${alnum(16)}.${alnum(16)}`,
    after: '";',
    nearMiss: `const key = "SG.${alnum(16)}.${alnum(15)}";`,
    hostile: hostileFrom("SG."),
    decoy: null,
  },
  "twilio-key": {
    before: 'const sid = "',
    secret: `AC${"0123456789abcdef".repeat(2)}`,
    after: '";',
    nearMiss: `const sid = "AC${"0123456789ABCDEF".repeat(2)}";`,
    hostile: hostileFrom("AC0123456789abcdef."),
    decoy: null,
  },
  "anthropic-key": {
    before: 'const key = "',
    secret: `sk-ant-${alnum(20)}`,
    after: '";',
    nearMiss: `const key = "sk-ant-${alnum(19)}";`,
    hostile: hostileFrom("sk-ant."),
    decoy: null,
  },
  "openai-key": {
    before: 'const key = "',
    secret: `sk-proj-${alnum(20)}`,
    after: '";',
    nearMiss: `const key = "sk-${alnum(19)}";`,
    hostile: hostileFrom("sk."),
    decoy: null,
  },
  "private-key-block": {
    before: "const key = `",
    secret: [
      `-----BEGIN RSA ${PRIVATE}-----`,
      "MIIEowIBAAKCAQEA",
      `-----END RSA ${PRIVATE}-----`,
    ].join("\n"),
    after: "`;",
    nearMiss: "const key = `-----BEGIN PUBLIC KEY-----\nMIIBIjAN\n-----END PUBLIC KEY-----`;",
    hostile: hostileFrom(`-----BEGIN ${PRIVATE}-----\n`),
    decoy: null,
  },
  "bcrypt-hash": {
    before: 'users.push({ hash: "',
    secret: `$2b$10$${alnum(53)}`,
    after: '" });',
    nearMiss: `users.push({ hash: "$2b$10$${alnum(52)}" });`,
    hostile: hostileFrom("$2b$10$."),
    decoy: null,
  },
  "basic-auth-header": {
    before: "Authorization: Basic ",
    secret: alnum(16),
    after: "",
    nearMiss: "Basic authentication is required",
    hostile: hostileFrom("Basic "),
    decoy: null,
  },
  jwt: {
    before: 'const token = "',
    secret: `eyJ${alnum(8)}.${alnum(8)}.${alnum(8)}`,
    after: '";',
    nearMiss: `const pair = "eyJ${alnum(8)}.${alnum(8)}";`,
    hostile: hostileFrom("eyJabcdefgh."),
    decoy: null,
  },
  "connection-string-password": {
    before: "postgres://app_user:",
    secret: alnum(12),
    after: "@db.internal:5432/orders",
    nearMiss: "postgres://app_user@db.internal:5432/orders",
    hostile: hostileFrom("a://b:c"),
    decoy: {
      source: "postgres://s3cr3tadmin:s3cr3t@db.internal/orders",
      expected: "postgres://s3cr3tadmin:[REDACTED:connection-string-password]@db.internal/orders",
    },
  },
  "assigned-secret": {
    before: 'database_password = "',
    secret: alnum(12),
    after: '"',
    nearMiss: `database_name = "${alnum(12)}"`,
    hostile: hostileFrom("token_"),
    decoy: {
      source: 'hunter2plus_password = "hunter2plus"',
      expected: 'hunter2plus_password = "[REDACTED:assigned-secret]"',
    },
  },
  "assigned-secret-bare": {
    before: "API_KEY=",
    secret: alnum(16),
    after: "",
    nearMiss: `API_URL=${alnum(16)}`,
    hostile: hostileFrom("token="),
    decoy: {
      source: "s3cr3tplus_token=s3cr3tplus",
      expected: "s3cr3tplus_token=[REDACTED:assigned-secret-bare]",
    },
  },
};

describe("the URI scheme bound", () => {
  it("still finds a URI at the end of a long run of scheme characters", () => {
    // `.` is a word boundary, so the match restarts at `postgres` however long
    // the run before it is. The bound cannot hide a real connection string.
    const run = "a.".repeat(100);
    expect(redact(`${run}postgres://app_user:s3cr3t-p4ssw0rd@db.internal`).text).toBe(
      `${run}postgres://app_user:[REDACTED:connection-string-password]@db.internal`,
    );
  });
});

describe("every redaction rule meets the detector contract (TPL-2287)", () => {
  it("has a contract row for exactly the rules in REDACTION_RULES", () => {
    expect(Object.keys(CONTRACTS).sort()).toEqual(REDACTION_RULES.map((r) => r.id).sort());
  });

  it("has a decoy for every rule whose secret is a capture group", () => {
    const missing = REDACTION_RULES.filter(
      (rule) =>
        rule.secretGroup > 0 &&
        CONTRACTS[rule.id]?.decoy === null &&
        !FIXED_TEXT_BEFORE_SECRET.includes(rule.id),
    ).map((rule) => rule.id);
    expect(missing).toEqual([]);
  });

  it.each(
    Object.entries(CONTRACTS).flatMap(([id, { decoy }]) => (decoy ? [[id, decoy] as const] : [])),
  )("%s splices by position, not by searching for the secret text", (_id, decoy) => {
    expect(redact(decoy.source).text).toBe(decoy.expected);
  });

  describe.each(REDACTION_RULES.map((rule) => rule.id))("%s", (id) => {
    const contract = (): RuleContract => {
      const row = CONTRACTS[id];
      if (!row) throw new Error(`no contract row for ${id}`);
      return row;
    };
    const source = (): string => {
      const { before, secret, after } = contract();
      return `${before}${secret}${after}`;
    };

    it("replaces the secret and nothing around it", () => {
      const { before, secret, after } = contract();
      expect(redact(source())).toEqual({
        text: `${before}[REDACTED:${id}]${after}`,
        findings: [{ ruleId: id, where: "input", length: secret.length }],
      });
    });

    it("leaves its near-miss untouched", () => {
      const { nearMiss } = contract();
      expect(redact(nearMiss)).toEqual({ text: nearMiss, findings: [] });
    });

    it("does not re-detect its own output", () => {
      const { text } = redact(source());
      expect(redact(text)).toEqual({ text, findings: [] });
      expect(() => assertStructureOnly(text)).not.toThrow();
    });

    it("scans its hostile input in bounded time", () => {
      const started = performance.now();
      redact(contract().hostile);
      expect(performance.now() - started).toBeLessThan(1000);
    });
  });
});
