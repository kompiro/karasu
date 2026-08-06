import { describe, expect, it } from "vitest";
import { assertStructureOnly, redact, redactFiles, StructureOnlyViolation } from "./redact.js";

/**
 * Composed at runtime rather than written as literals, so this file trips
 * neither `gitleaks` nor a reader's alarm: none of these are real.
 */
const PEM_LABEL = "RSA PRIVATE KEY";

const fake = {
  githubToken: `ghp_${"A1b2C3d4E5f6G7h8I9j0".repeat(2)}`,
  awsKeyId: `AKIA${"IOSFODNN7EXAMPLE".slice(0, 16)}`,
  slack: `xoxb-${"1".repeat(12)}-${"2".repeat(12)}-${"a1b2c3d4e5f6".slice(0, 12)}`,
  stripe: `sk_live_${"4eC39HqLyjWDarjtT1zdp7dc".slice(0, 24)}`,
  google: `AIza${"SyD-1234567890abcdefghijklmnopqrstu".slice(0, 35)}`,
  anthropic: `sk-ant-${"api03-abcdefghijklmnopqrstuvwxyz".slice(0, 28)}`,
  jwt: `eyJ${"hbGciOiJIUzI1NiJ9"}.${"eyJzdWIiOiIxMjM0NTY3ODkwIn0"}.${"dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1gFWFOEjXk"}`,
  pem: [`-----BEGIN ${PEM_LABEL}-----`, "MIIEowIBAAKCAQEA", `-----END ${PEM_LABEL}-----`].join(
    "\n",
  ),
};

describe("redact", () => {
  it.each([
    ["github-token", fake.githubToken],
    ["aws-access-key-id", fake.awsKeyId],
    ["slack-token", fake.slack],
    ["stripe-key", fake.stripe],
    ["google-api-key", fake.google],
    ["anthropic-key", fake.anthropic],
    ["jwt", fake.jwt],
  ])("redacts a %s and nothing around it", (ruleId, secret) => {
    // The exact text matters. A `contains` assertion passes even if the rule
    // is `/\S+/` and shredded the whole line, which is how an unanchored
    // pattern would ship looking tested.
    const result = redact(`const key = "${secret}";`);
    expect(result.text).toBe(`const key = "[REDACTED:${ruleId}]";`);
    expect(result.findings).toEqual([{ ruleId, where: "input", length: secret.length }]);
  });

  it("redacts a whole PEM block, not just its armour", () => {
    const result = redact(`const key = \`${fake.pem}\`;`);
    expect(result.text).not.toContain("MIIEowIBAAKCAQEA");
    expect(result.text).toContain("[REDACTED:private-key-block]");
  });

  it("keeps the key name and drops only the value", () => {
    // The model still learns the config has a password field, which is real
    // structure, without learning the password.
    const result = redact('database_password = "hunter2-but-longer-and-real"');
    expect(result.text).toBe('database_password = "[REDACTED:assigned-secret]"');
  });

  it("keeps a connection string's scheme, user and host", () => {
    const result = redact("postgres://app_user:s3cr3t-p4ssw0rd@db.internal:5432/orders");
    expect(result.text).toBe(
      "postgres://app_user:[REDACTED:connection-string-password]@db.internal:5432/orders",
    );
  });

  it("reports a finding's length but never the secret", () => {
    const result = redact(`const key = "${fake.githubToken}";`, "src/config.ts");
    expect(result.findings).toEqual([
      { ruleId: "github-token", where: "src/config.ts", length: fake.githubToken.length },
    ]);
    expect(JSON.stringify(result.findings)).not.toContain(fake.githubToken.slice(0, 12));
  });

  it("redacts every occurrence, not only the first", () => {
    const result = redact(`${fake.githubToken} and ${fake.githubToken}`);
    expect(result.text).toBe("[REDACTED:github-token] and [REDACTED:github-token]");
    expect(result.findings).toHaveLength(2);
  });

  it("is not stateful across calls", () => {
    // A shared global regex would make every other call miss.
    const source = `const key = "${fake.githubToken}";`;
    const counts = [0, 1, 2].map(() => redact(source).findings.length);
    expect(counts).toEqual([1, 1, 1]);
  });

  describe("what it must leave alone", () => {
    it.each([
      ["a normal identifier", "const applicationSecretsManager = new SecretsManager();"],
      ["a git commit SHA", `const base = "${"a1b2c3d4".repeat(5)}";`],
      ["a UUID", 'const id = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";'],
      ["a base64 asset", 'const px = "iVBORw0KGgoAAAANSUhEUg==";'],
      ["an import path", 'import { sign } from "./crypto/private-key-loader.js";'],
      ["a type name", "interface ApiKeyRotationPolicy { intervalDays: number }"],
      ["a tokenizer name", 'tokenizer = "gpt2-base-cased"'],
      ["a password-strength helper", "passwordStrength(candidate)"],
      ["an env reference", 'password = "${DB_PASSWORD}"'],
      ["a shell env reference", 'api_key = "$OPENAI_API_KEY"'],
      ["a function call", 'secret = "getSecret(name)"'],
      ["a documented placeholder", 'password = "changeme"'],
      ["a mask", 'token = "xxxxxxxxxxxx"'],
      ["a two-segment base64 string", 'const pair = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0";'],
    ])("leaves %s untouched", (_name, source) => {
      // A rule set that eats ordinary code produces a worthless model, and a
      // worthless safety measure is one that gets turned off.
      expect(redact(source)).toEqual({ text: source, findings: [] });
    });

    it("leaves an unquoted assignment alone", () => {
      // `password = getenv("DB_PASSWORD")` is a reference. Redacting it would
      // erase the fact that the value comes from the environment.
      const source = 'password = getenv("DB_PASSWORD")';
      expect(redact(source).findings).toEqual([]);
    });

    it("leaves a short assigned value alone", () => {
      expect(redact('token = "abc"').findings).toEqual([]);
    });

    it("leaves a dotted reference alone", () => {
      expect(redact("apiKey = config.credentials.token").findings).toEqual([]);
    });

    it("leaves an empty document alone", () => {
      expect(redact("")).toEqual({ text: "", findings: [] });
    });

    it("defaults the finding's location to input", () => {
      expect(redact(`const k = "${fake.githubToken}";`).findings[0]?.where).toBe("input");
    });
  });
});

describe("what the review found leaking", () => {
  it("redacts the value, not an earlier copy of it in the key name", () => {
    // `match.replace(secret, ...)` replaced the *first* occurrence inside the
    // match, so the key name was redacted and the value shipped.
    expect(redact('hunter2plus_password = "hunter2plus"').text).toBe(
      'hunter2plus_password = "[REDACTED:assigned-secret]"',
    );
  });

  it("redacts the password, not a matching substring of the username", () => {
    expect(redact("postgres://s3cr3tadmin:s3cr3t@db.internal:5432/orders").text).toBe(
      "postgres://s3cr3tadmin:[REDACTED:connection-string-password]@db.internal:5432/orders",
    );
  });

  it("redacts a bcrypt hash instead of reading it as an env reference", () => {
    // `^[$<{]` treated every `$2b$…` as `${VAR}`.
    const hash = `$2b$10$${"N9qo8uLOickgx2ZMRZoMye".padEnd(53, "IjZAgcfl7p92ldGxad68LJZd")}`;
    const result = redact(`users.push({ hash: "${hash}" });`);
    expect(result.text).not.toContain(hash);
    expect(result.findings.map((f) => f.ruleId)).toContain("bcrypt-hash");
  });

  // Values are assembled at runtime so this file holds no literal that a
  // secret scanner will match — the same reason `fake` is built above.
  const configValue = ["aBcDeFgHiJ", "kLmNoPqRsT", "uVwXyZ0123"].join("");
  it.each([
    [".env", `API_KEY=${configValue}`],
    [".npmrc", `//registry.npmjs.org/:_authToken=${configValue}`],
    ["YAML", `  client_secret: ${configValue}`],
    ["JSON", `  "clientSecret": "${configValue}",`],
    ["Dockerfile", `ENV DB_PASSWORD=${configValue}`],
  ])("redacts an unquoted or config-style secret in %s", (_name, line) => {
    // The most common place a real credential lives does not use quotes.
    const result = redact(line);
    expect(result.findings.length).toBeGreaterThan(0);
    expect(result.text).not.toContain(configValue);
    expect(result.text).toContain("[REDACTED:");
  });

  it("keeps a specific finding rather than letting a generic rule overwrite it", () => {
    // `github_token = "ghp_…"` matched github-token, then assigned-secret
    // re-matched the placeholder and relabelled it.
    const result = redact(`github_token = "${fake.githubToken}"`);
    expect(result.findings.map((f) => f.ruleId)).toEqual(["github-token"]);
    expect(result.text).toBe('github_token = "[REDACTED:github-token]"');
  });

  it("does not refuse a document that quotes its own placeholder", () => {
    // A plausible echo of redacted input, and it made assertStructureOnly
    // throw on output it had itself produced.
    expect(() =>
      assertStructureOnly('system S {\n  service Api\n  description "token: [REDACTED:jwt]"\n}\n'),
    ).not.toThrow();
  });

  it("scans a pathological near-miss input in bounded time", () => {
    // The old `prefix + keyword + suffix` regex was quadratic here: 240 KB
    // took about four seconds, which is a CPU-limit kill on a Worker.
    const hostile = `${"token_".repeat(40_000)}x`;
    const started = performance.now();
    redact(hostile);
    expect(performance.now() - started).toBeLessThan(1000);
  });
});

describe("redactFiles", () => {
  it("tags each finding with the file it came from", () => {
    const result = redactFiles([
      { path: "src/a.ts", content: `const k = "${fake.githubToken}";` },
      { path: "src/b.ts", content: "export const answer = 42;" },
      { path: "src/c.ts", content: `const k = "${fake.stripe}";` },
    ]);
    expect(result.findings.map((f) => [f.where, f.ruleId])).toEqual([
      ["src/a.ts", "github-token"],
      ["src/c.ts", "stripe-key"],
    ]);
    expect(result.files[1]?.content).toBe("export const answer = 42;");
  });

  it("returns every file, redacted or not", () => {
    const result = redactFiles([{ path: "a", content: "x" }]);
    expect(result.files).toEqual([{ path: "a", content: "x" }]);
  });
});

describe("assertStructureOnly", () => {
  it("accepts a .krs that carries no credential", () => {
    expect(() => assertStructureOnly("system Payments {\n  service Ledger\n}\n")).not.toThrow();
  });

  it("refuses rather than scrubs", () => {
    // A hit means input redaction missed or the model reproduced something it
    // should never have seen. Scrubbing would ship the artifact and hide the
    // fault, which is the reason for having a second scan at all.
    const krs = `system S {\n  service Api "${fake.githubToken}"\n}\n`;
    expect(() => assertStructureOnly(krs)).toThrowError(StructureOnlyViolation);
  });

  it("names the rules it matched, and no secret, in the error", () => {
    const krs = `system S {\n  service Api "${fake.stripe}"\n}\n`;
    const thrown = (() => {
      try {
        assertStructureOnly(krs);
        return undefined;
      } catch (cause) {
        return cause as StructureOnlyViolation;
      }
    })();
    expect(thrown?.message).toContain("stripe-key");
    expect(thrown?.message).not.toContain(fake.stripe);
    expect(thrown?.findings[0]?.where).toBe("output");
  });

  it("accepts a document that describes a redaction", () => {
    // `[REDACTED:jwt]` is structure the model legitimately learned from the
    // redacted input; it must not read as a credential on the way out.
    expect(() =>
      assertStructureOnly("system S {\n  service Api\n  // auth: [REDACTED:jwt]\n}\n"),
    ).not.toThrow();
  });
});
