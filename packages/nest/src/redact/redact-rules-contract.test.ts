import { describe, expect, it } from "vitest";
import { assertStructureOnly, redact } from "./redact.js";
import { REDACTION_RULES } from "./rules.js";

// Fences what TPL-2287 asks of every redaction rule, not of the rules that
// happened to have a bug. The table is keyed by rule id and checked against
// `REDACTION_RULES`, so a new rule cannot land without its row: a near-miss, a
// hostile input and, where the secret is a capture group, a decoy.
//
// The timing checks are evidence, not proof. They caught three quadratic rules,
// but a new rule can be slow on an input neither its row nor the generated ones
// try, which is why TPL-2287's timing item carries no guard marker.

interface RuleContract {
  /** The text around the secret; the secret between them is what gets replaced. */
  before: string;
  secret: string;
  after: string;
  /** Reads like this rule's input, and no rule may touch it. */
  nearMiss: string;
  /** Repeated, this makes the rule's pattern work hard. It need not end up redacted. */
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

/**
 * Whether scanning grows faster than the input, from two sizes four times apart:
 * a linear scan takes about 4x as long and a quadratic one about 16x. Wall-clock
 * clock time would depend on the machine, and a budget at `MAX_SUBMISSION_BYTES`
 * would make a quadratic rule run for minutes before it failed. A scan under
 * `NEGLIGIBLE_MS` at the large size passes, since the timing is noise down there.
 */
const SMALL_BYTES = 64 * 1024;
const LARGE_BYTES = SMALL_BYTES * 4;
const NEGLIGIBLE_MS = 30;
/** This test runs under Node; the package's types are for Workers, which have no `process`. */
declare const process: {
  cpuUsage(previous?: { user: number; system: number }): { user: number; system: number };
};

function growsSuperLinearly(unit: string, scan: (input: string) => void): boolean {
  // CPU time, so a busy machine cannot read as growth: on the wall clock a short
  // scan fits in one scheduler slice and a longer one gets preempted. The fastest
  // of three takes out a garbage collection. Vitest runs each file in its own
  // process here, so the count is this scan's.
  const timed = (bytes: number): number => {
    const input = unit.repeat(Math.ceil(bytes / unit.length));
    return Math.min(
      ...[0, 1, 2].map(() => {
        const started = process.cpuUsage();
        scan(input);
        const { user, system } = process.cpuUsage(started);
        return (user + system) / 1000;
      }),
    );
  };
  const small = timed(SMALL_BYTES);
  const large = timed(LARGE_BYTES);
  return large > NEGLIGIBLE_MS && large / Math.max(small, 1) > 8;
}

/** Separators worth repeating: each is a word boundary, a class member, or both. */
const STRESS_SEPARATORS = ["", ".", "-", "+", "_", "=", ":", "/", " ", "\n"];

/**
 * Inputs built from a rule's own secret: its leading characters and a separator,
 * repeated. Restarting at each repeat is how all three quadratic rules failed.
 */
const stressUnits = (secret: string): string[] =>
  [2, 3, 4, 6, 8].flatMap((length) =>
    STRESS_SEPARATORS.map((separator) => secret.slice(0, length) + separator),
  );

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
    hostile: "ghp_",
    decoy: null,
  },
  "github-fine-grained-token": {
    before: 'const key = "',
    secret: `github_pat_${alnum(22)}`,
    after: '";',
    nearMiss: `const key = "github_pat_${alnum(21)}";`,
    hostile: "github_pat-",
    decoy: null,
  },
  "aws-access-key-id": {
    before: 'const id = "',
    secret: `AKIA${"A1B2C3D4".repeat(2)}`,
    after: '";',
    nearMiss: `const id = "AKIA${"A1B2C3D4".repeat(2).slice(1)}";`,
    hostile: "AKIA",
    decoy: null,
  },
  "slack-token": {
    before: 'const key = "',
    secret: `xoxb-${alnum(10)}`,
    after: '";',
    nearMiss: `const key = "xoxb-${alnum(9)}";`,
    hostile: "xoxb_",
    decoy: null,
  },
  "stripe-key": {
    before: 'const key = "',
    secret: `sk_live_${alnum(16)}`,
    after: '";',
    nearMiss: `const key = "sk_live_${alnum(15)}";`,
    hostile: "sk_live_",
    decoy: null,
  },
  "google-api-key": {
    before: 'const key = "',
    secret: `AIza${alnum(35)}`,
    after: '";',
    nearMiss: `const key = "AIza${alnum(34)}";`,
    hostile: "AIza.",
    decoy: null,
  },
  "sendgrid-key": {
    before: 'const key = "',
    secret: `SG.${alnum(16)}.${alnum(16)}`,
    after: '";',
    nearMiss: `const key = "SG.${alnum(16)}.${alnum(15)}";`,
    hostile: "SG.",
    decoy: null,
  },
  "twilio-key": {
    before: 'const sid = "',
    secret: `AC${"0123456789abcdef".repeat(2)}`,
    after: '";',
    nearMiss: `const sid = "AC${"0123456789ABCDEF".repeat(2)}";`,
    hostile: "AC0123456789abcdef.",
    decoy: null,
  },
  "anthropic-key": {
    before: 'const key = "',
    secret: `sk-ant-${alnum(20)}`,
    after: '";',
    nearMiss: `const key = "sk-ant-${alnum(19)}";`,
    hostile: "sk-ant.",
    decoy: null,
  },
  "openai-key": {
    before: 'const key = "',
    secret: `sk-proj-${alnum(20)}`,
    after: '";',
    nearMiss: `const key = "sk-${alnum(19)}";`,
    hostile: "sk.",
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
    hostile: `-----BEGIN ${PRIVATE}-----\n`,
    decoy: null,
  },
  "bcrypt-hash": {
    before: 'users.push({ hash: "',
    secret: `$2b$10$${alnum(53)}`,
    after: '" });',
    nearMiss: `users.push({ hash: "$2b$10$${alnum(52)}" });`,
    hostile: "$2b$10$.",
    decoy: null,
  },
  "basic-auth-header": {
    before: "Authorization: Basic ",
    secret: alnum(16),
    after: "",
    nearMiss: "Basic authentication is required",
    hostile: "Basic ",
    decoy: null,
  },
  jwt: {
    before: 'const token = "',
    secret: `eyJ${alnum(8)}.${alnum(8)}.${alnum(8)}`,
    after: '";',
    nearMiss: `const pair = "eyJ${alnum(8)}.${alnum(8)}";`,
    hostile: "eyJ-",
    decoy: null,
  },
  "connection-string-password": {
    before: "postgres://app_user:",
    secret: alnum(12),
    after: "@db.internal:5432/orders",
    nearMiss: "postgres://app_user@db.internal:5432/orders",
    hostile: "a.",
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
    hostile: "token_",
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
    hostile: "token=",
    decoy: {
      source: "s3cr3tplus_token=s3cr3tplus",
      expected: "s3cr3tplus_token=[REDACTED:assigned-secret-bare]",
    },
  },
};

describe("the limits the timing fixes put on detection", () => {
  const password = "s3cr3t-p4ssw0rd";
  const uri = (scheme: string) => `${scheme}://app_user:${password}@db.internal`;

  it("finds a URI at the end of a long run of scheme characters", () => {
    // `.` is a word boundary, so the match restarts at `postgres`.
    expect(redact(uri(`${"a.".repeat(100)}postgres`)).text).not.toContain(password);
  });

  it("finds a scheme of 32 characters and, by the bound, not one of 33", () => {
    expect(redact(uri("a".repeat(32))).text).not.toContain(password);
    expect(redact(uri("a".repeat(33))).text).toContain(password);
  });

  it("finds a scheme holding `_`, as SQLAlchemy URLs do", () => {
    expect(redact(uri("oracle+cx_oracle")).text).not.toContain(password);
  });

  it("finds a JWT with a long header, and by `(?<!-)` not one right after `-`", () => {
    const token = `eyJ${alnum(100).repeat(80)}.${alnum(8)}.${alnum(8)}`;
    expect(redact(`token ${token}`).findings.map((f) => f.ruleId)).toEqual(["jwt"]);
    expect(redact(`x-${token}`).findings).toEqual([]);
  });

  it("redacts both of two private key blocks, and not a body with no END", () => {
    const block = `-----BEGIN ${PRIVATE}-----\nMIIE\n-----END ${PRIVATE}-----`;
    expect(redact(`${block}\n${block}`).text).toBe(
      "[REDACTED:private-key-block]\n[REDACTED:private-key-block]",
    );
    expect(redact(`-----BEGIN ${PRIVATE}-----\nAAA\n${block}`).text).toBe(
      `-----BEGIN ${PRIVATE}-----\nAAA\n[REDACTED:private-key-block]`,
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
  )("%s splices by position, not by searching for the secret text", (id, decoy) => {
    expect(decoy.expected).toContain(`[REDACTED:${id}]`);
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

    it("scans its hostile input in linear time", () => {
      expect(growsSuperLinearly(contract().hostile, redact)).toBe(false);
    });

    it("scans inputs built from its own secret in linear time", () => {
      const rule = REDACTION_RULES.find((r) => r.id === id)!;
      const flags = `${rule.pattern.flags.replace(/[gd]/g, "")}gd`;
      const scan = (input: string): void => {
        // Draining the matches is the work being timed.
        for (const _ of input.matchAll(new RegExp(rule.pattern.source, flags)));
      };
      // `find`, so a regression fails on its first slow input.
      expect(
        stressUnits(contract().secret).find((unit) => growsSuperLinearly(unit, scan)),
      ).toBeUndefined();
    });
  });
});
