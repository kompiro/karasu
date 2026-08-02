import { afterEach, describe, expect, it, vi } from "vitest";
import { GitHubClient } from "../github/client.js";
import type { LlmClient, LlmResponse } from "../reverse/llm.js";
import { MetricsStore } from "../meter/record.js";
import { NestStore } from "../store/nest-store.js";
import { RunStatusStore } from "../store/run-status.js";
import { MemoryKV } from "../testing/memory-kv.js";
import { generate, type GenerateDeps } from "./run.js";

const SHA = "a".repeat(40);
const CLOCK = new Date("2026-08-02T12:00:00Z");

const SURVEY = JSON.stringify({
  contexts: [{ name: "Payments", why: "billing", readPaths: ["src/pay.ts"] }],
});
const DECOMPOSE = JSON.stringify({
  domains: [{ name: "Payments", summary: "billing", confidence: "high" }],
});
const KRS = "```krs\nsystem Shop {\n  service Payments\n}\n```";

/** A GitHubClient whose archive read is a table, so no network and no App key. */
function stubGithub(
  files: { path: string; content: string; size?: number }[],
  overrides: { truncated?: boolean } = {},
): GitHubClient {
  const github = new GitHubClient({ appId: "1", privateKeyPem: "unused", fetchImpl: fetch });
  vi.spyOn(github, "defaultBranchSha").mockResolvedValue(SHA);
  // Mirrors `readGzippedArchive`: the caller's predicate and caps decide, so
  // the filter tests below exercise the real policy rather than a stub's.
  vi.spyOn(github, "sourceFiles").mockImplementation((_i, _o, _r, _s, options) => {
    const kept: { path: string; content: string }[] = [];
    let truncated = overrides.truncated ?? false;
    let bytes = 0;
    for (const file of files) {
      const size = file.size ?? file.content.length;
      if (options.accept({ path: file.path, size }) === "skip") continue;
      if (kept.length >= options.maxFiles || bytes + size > options.maxTotalBytes) {
        truncated = true;
        break;
      }
      kept.push({ path: file.path, content: file.content });
      bytes += size;
    }
    return Promise.resolve({ files: kept, truncated });
  });
  return github;
}

function scriptedLlm(replies: string[]): LlmClient & { prompts: string[] } {
  const prompts: string[] = [];
  let index = 0;
  return {
    prompts,
    complete(prompt: string): Promise<LlmResponse> {
      prompts.push(prompt);
      const text = replies[index] ?? "";
      index += 1;
      return Promise.resolve({
        text,
        model: "claude-opus-5",
        usage: { inputTokens: 10, outputTokens: 20 },
      });
    },
  };
}

function deps(
  github: GitHubClient,
  llm: LlmClient,
  kv = new MemoryKV(),
): GenerateDeps & { kv: MemoryKV } {
  return {
    github,
    llm,
    store: new NestStore(kv),
    runs: new RunStatusStore(kv),
    metrics: new MetricsStore(kv),
    now: () => CLOCK,
    kv,
  };
}

const input = { installationId: "42", owner: "kompiro", repo: "shop" };

// Prototype spies (the metrics-failure test mocks `MetricsStore.record`) leak
// into every later test in the file without this.
afterEach(() => {
  vi.restoreAllMocks();
});

describe("generate", () => {
  it("publishes a model and records the run as done", async () => {
    const llm = scriptedLlm([SURVEY, DECOMPOSE, KRS]);
    const d = deps(stubGithub([{ path: "src/pay.ts", content: "export class Payment {}" }]), llm);
    const outcome = await generate(input, d);

    expect(outcome.sha).toBe(SHA);
    expect((await d.store.latest("kompiro", "shop"))?.krs).toContain("system Shop");
    expect(await d.runs.get(input)).toEqual({
      state: "done",
      sha: SHA,
      startedAt: CLOCK.toISOString(),
      finishedAt: CLOCK.toISOString(),
    });
  });

  it("redacts before the model sees anything", async () => {
    // The one-way door. A credential in the source must not reach a prompt.
    const token = `ghp_${"A1b2C3d4E5f6G7h8I9j0".repeat(2)}`;
    const llm = scriptedLlm([SURVEY, DECOMPOSE, KRS]);
    const d = deps(stubGithub([{ path: "src/pay.ts", content: `const key = "${token}";` }]), llm);
    const outcome = await generate(input, d);

    expect(outcome.redactions).toBe(1);
    for (const prompt of llm.prompts) expect(prompt).not.toContain(token);
    expect(llm.prompts[1]).toContain("[REDACTED:github-token]");
  });

  it("marks the run running before the work starts", async () => {
    // A caller polling during a 15-minute run must see something other than
    // "never requested".
    let observed: string | undefined;
    const llm: LlmClient = {
      complete: async () => {
        observed ??= (await runs.get(input))?.state;
        return { text: SURVEY, usage: { inputTokens: 0, outputTokens: 0 } };
      },
    };
    const kv = new MemoryKV();
    const runs = new RunStatusStore(kv);
    await expect(
      generate(input, deps(stubGithub([{ path: "a.ts", content: "x" }]), llm, kv)),
    ).rejects.toThrowError(/survey/);
    expect(observed).toBe("running");
  });

  it("records a failure with a message safe to show a caller", async () => {
    const llm = scriptedLlm(["not json", DECOMPOSE, KRS]);
    const d = deps(stubGithub([{ path: "src/pay.ts", content: "x" }]), llm);
    await expect(generate(input, d)).rejects.toThrowError(/survey/);
    const status = await d.runs.get(input);
    expect(status?.state).toBe("failed");
    expect(status?.error).toContain("survey");
  });

  it("does not publish anything when the reverse fails", async () => {
    // Four replies: the pipeline asks for a repair before it gives up.
    const broken = "```krs\nnot karasu syntax\n```";
    const llm = scriptedLlm([SURVEY, DECOMPOSE, broken, broken]);
    const d = deps(stubGithub([{ path: "src/pay.ts", content: "x" }]), llm);
    await expect(generate(input, d)).rejects.toThrowError(/did not parse/);
    expect(await d.store.latest("kompiro", "shop")).toBeUndefined();
  });

  describe("which files it reads", () => {
    const cases = [
      ["a lockfile", "pnpm-lock.yaml"],
      ["a vendored tree", "node_modules/left-pad/index.js"],
      ["a build output", "dist/bundle.js"],
      ["a minified bundle", "static/app.min.js"],
      ["a binary", "docs/logo.png"],
      ["a font", "assets/Inter.woff2"],
    ] as const;

    it.each(cases)("skips %s", async (_name, path) => {
      const llm = scriptedLlm([SURVEY, DECOMPOSE, KRS]);
      const d = deps(
        stubGithub([
          { path, content: "SKIPPED-CONTENT" },
          { path: "src/pay.ts", content: "export class Payment {}" },
        ]),
        llm,
      );
      await generate(input, d);
      for (const prompt of llm.prompts) expect(prompt).not.toContain("SKIPPED-CONTENT");
    });

    it("skips a file too large to be source", async () => {
      const llm = scriptedLlm([SURVEY, DECOMPOSE, KRS]);
      const d = deps(
        stubGithub([
          { path: "data/dump.json", content: "HUGE", size: 5_000_000 },
          { path: "src/pay.ts", content: "export class Payment {}" },
        ]),
        llm,
      );
      await generate(input, d);
      expect(llm.prompts[0]).not.toContain("data/dump.json");
    });

    it("fails rather than reversing nothing when every file is skipped", async () => {
      const llm = scriptedLlm([SURVEY, DECOMPOSE, KRS]);
      const d = deps(stubGithub([{ path: "pnpm-lock.yaml", content: "x" }]), llm);
      await expect(generate(input, d)).rejects.toThrowError(/no readable source files/);
    });

    it("reports no GitHub-side truncation, because an archive is never partial", async () => {
      // The tree API can answer "there is more than I will list"; a tarball
      // cannot. The field stays so the pull-request body keeps distinguishing
      // the two kinds of partial, and only our own cap can now cause one.
      const llm = scriptedLlm([SURVEY, DECOMPOSE, KRS]);
      const d = deps(stubGithub([{ path: "src/pay.ts", content: "x" }]), llm);
      const outcome = await generate(input, d);
      expect([outcome.truncatedTree, outcome.truncatedByCap]).toEqual([false, false]);
    });

    it("never reports an unreadable file, because there are no per-file reads", async () => {
      const llm = scriptedLlm([SURVEY, DECOMPOSE, KRS]);
      const d = deps(stubGithub([{ path: "src/pay.ts", content: "x" }]), llm);
      expect((await generate(input, d)).unreadableFiles).toBe(0);
    });

    it("reports its own file cap as the reason the model saw less", async () => {
      // Two different reasons the model saw less than the repository, and a
      // caller reading "truncated" needs to know which one it was: one is ours
      // to raise, the other is not.
      const llm = scriptedLlm([SURVEY, DECOMPOSE, KRS]);
      // The first entry is the one the scripted survey asks to read back.
      const many = [
        { path: "src/pay.ts", content: "export class Payment {}" },
        ...Array.from({ length: 204 }, (_unused, index) => ({
          path: `src/f${index}.ts`,
          content: "export const x = 1;",
        })),
      ];
      const outcome = await generate(input, deps(stubGithub(many), llm));
      expect([outcome.truncatedTree, outcome.truncatedByCap]).toEqual([false, true]);
    });

    it("fails when the archive yields nothing usable", async () => {
      // Every file skipped by the filter, or an empty repository. Reversing
      // nothing would produce a confident model of no system.
      const llm = scriptedLlm([SURVEY, DECOMPOSE, KRS]);
      const d = deps(stubGithub([{ path: "pnpm-lock.yaml", content: "x" }]), llm);
      await expect(generate(input, d)).rejects.toThrowError(/no readable source files/);
    });
  });

  describe("what a failure message may say", () => {
    it("passes through a message this codebase wrote", async () => {
      const llm = scriptedLlm(["not json", DECOMPOSE, KRS]);
      const d = deps(stubGithub([{ path: "src/pay.ts", content: "x" }]), llm);
      await expect(generate(input, d)).rejects.toThrowError(/survey/);
      expect((await d.runs.get(input))?.error).toContain("survey");
    });

    it("replaces a message from anywhere else", async () => {
      // An allowlist, not a denylist: a runtime `TypeError` raised inside a
      // fetch or a decode carries text nobody vetted, and this endpoint is
      // public while the repository it read may be private.
      const llm: LlmClient = {
        complete: () => Promise.reject(new TypeError("connect ECONNREFUSED 10.0.0.7:443")),
      };
      const d = deps(stubGithub([{ path: "src/pay.ts", content: "x" }]), llm);
      await expect(generate(input, d)).rejects.toThrowError(/ECONNREFUSED/);
      const status = await d.runs.get(input);
      expect(status?.error).toBe("the generation failed");
    });
  });

  describe("what it records for #2226", () => {
    it("writes tokens, wall-clock and input size against the commit", async () => {
      const llm = scriptedLlm([SURVEY, DECOMPOSE, KRS]);
      const d = deps(stubGithub([{ path: "src/pay.ts", content: "export class Payment {}" }]), llm);
      await generate(input, d);

      const recorded = await new MetricsStore(d.kv).latestFor(input, SHA);
      expect(recorded).toMatchObject({
        sha: SHA,
        outcome: "done",
        inputTokens: 30,
        outputTokens: 60,
        files: 1,
        bytesRead: 23,
        redactions: 0,
        unreadableFiles: 0,
      });
      // Three passes, so a cost report can say which one is expensive.
      expect(recorded?.passes.map((pass: { name: string }) => pass.name)).toEqual([
        "survey",
        "decompose",
        "synthesise",
      ]);
    });

    it("measures input size before redaction, which only ever shrinks it", async () => {
      const llm = scriptedLlm([SURVEY, DECOMPOSE, KRS]);
      const secret = 'password = "s3cr3t-value-not-a-placeholder"';
      const d = deps(stubGithub([{ path: "src/pay.ts", content: secret }]), llm);
      await generate(input, d);

      const recorded = await new MetricsStore(d.kv).latestFor(input, SHA);
      expect(recorded?.bytesRead).toBe(secret.length);
      expect(recorded?.redactions).toBeGreaterThan(0);
    });

    it("keeps a model that was produced even if the metric cannot be written", async () => {
      // A run that took a quarter of an hour and produced a document has
      // succeeded. Failing it to protect a token count would be the wrong
      // trade in both directions.
      vi.spyOn(console, "error").mockImplementation(() => {});
      const llm = scriptedLlm([SURVEY, DECOMPOSE, KRS]);
      const d = deps(stubGithub([{ path: "src/pay.ts", content: "x" }]), llm);
      vi.spyOn(MetricsStore.prototype, "record").mockRejectedValue(new Error("KV is down"));

      await expect(generate(input, d)).resolves.toBeDefined();
      expect((await d.runs.get(input))?.state).toBe("done");
      expect(await d.store.latest("kompiro", "shop")).toBeDefined();
    });

    it("records what a failed attempt spent before it threw", async () => {
      // A Workflow retries, and every attempt is billed. A report that counts
      // only the attempt that succeeded understates the bill by exactly the
      // amount the retries cost.
      const llm = scriptedLlm([SURVEY, DECOMPOSE, "not a krs document", "still not one"]);
      const d = deps(stubGithub([{ path: "src/pay.ts", content: "x" }]), llm);
      await expect(generate(input, d)).rejects.toThrowError(/synthesise/);

      const recorded = await new MetricsStore(d.kv).latestFor(input, SHA);
      expect(recorded?.outcome).toBe("failed");
      // Named, not "unknown": a cost record that cannot say which model ran
      // cannot be priced, and pricing is most of what it is for.
      expect(recorded?.model).toBe("claude-opus-5");
      // Four passes ran before the failure -- survey, decompose, synthesise
      // and the repair attempt -- and every one of them was billed.
      expect(recorded?.outputTokens).toBe(80);
      // Named individually, because "did the repair actually run" is a
      // question a failed run has to be able to answer from its own record.
      expect(recorded?.passes.map((pass) => pass.name)).toEqual([
        "survey",
        "decompose",
        "synthesise",
        "repair",
      ]);
      // And each carries its own cost, not the running total.
      expect(recorded?.passes.every((pass) => pass.outputTokens === 20)).toBe(true);
    });

    it("records why a parse failure failed, without the generated text", async () => {
      // Otherwise diagnosing a failed run means paying to reproduce it with a
      // `wrangler tail` open -- and the failure record is the one thing that
      // outlives the run.
      // Attributes on a brace-carrying line: the deterministic prune refuses
      // to delete it, so this still reaches the diagnostics path.
      const broken =
        "```krs\nsystem S {\n  service Svc {\n    domain D {\n      entity B { id: UUID }\n    }\n  }\n}\n```";
      const llm = scriptedLlm([SURVEY, DECOMPOSE, broken, broken]);
      const d = deps(stubGithub([{ path: "src/pay.ts", content: "x" }]), llm);
      await expect(generate(input, d)).rejects.toThrowError(/did not parse/);

      const recorded = await new MetricsStore(d.kv).latestFor(input, SHA);
      expect(recorded?.diagnostics?.length).toBeGreaterThan(0);
      expect(recorded?.diagnostics?.[0]?.at).toMatch(/^\d+:\d+$/);
      // The record still carries no repository or generated text.
      expect(JSON.stringify(recorded)).not.toContain("UUID");
    });

    it("runs without a metrics store at all", async () => {
      // Optional on purpose: measurement must never be the reason a
      // generation fails.
      const llm = scriptedLlm([SURVEY, DECOMPOSE, KRS]);
      const { metrics: _unused, ...rest } = deps(
        stubGithub([{ path: "src/pay.ts", content: "x" }]),
        llm,
      );
      await expect(generate(input, rest)).resolves.toBeDefined();
    });
  });

  describe("pull-request delivery (#2289)", () => {
    it("delivers the model it just published, with the domains it found", async () => {
      const llm = scriptedLlm([SURVEY, DECOMPOSE, KRS]);
      const delivered: unknown[] = [];
      const d = {
        ...deps(stubGithub([{ path: "src/pay.ts", content: "x" }]), llm),
        deliver: (received: unknown) => {
          delivered.push(received);
          return Promise.resolve({
            number: 7,
            url: "https://github.com/kompiro/shop/pull/7",
            created: true,
            branch: "karasu-nest/model-aaaaaaaaaaaa",
            path: "docs/architecture.krs",
          });
        },
      };

      const outcome = await generate(input, d);
      expect(outcome.delivery).toMatchObject({ number: 7, created: true });
      expect(delivered[0]).toMatchObject({
        owner: "kompiro",
        repo: "shop",
        sha: SHA,
        domains: [{ name: "Payments" }],
      });
    });

    it("keeps the model when the pull request cannot be opened", async () => {
      // The document is already cached and served by GET /<owner>/<repo>. A
      // delivery failure costs the pull request, not the model.
      vi.spyOn(console, "error").mockImplementation(() => {});
      const llm = scriptedLlm([SURVEY, DECOMPOSE, KRS]);
      const d = {
        ...deps(stubGithub([{ path: "src/pay.ts", content: "x" }]), llm),
        deliver: () => Promise.reject(new Error("no write permission")),
      };

      const outcome = await generate(input, d);
      expect(outcome.delivery).toBeUndefined();
      expect(await d.store.latest("kompiro", "shop")).toBeDefined();
      expect((await d.runs.get(input))?.state).toBe("done");
    });

    it("does not deliver at all when no deliverer is wired", async () => {
      // Off by default: PR-back needs write scopes the install consent does
      // not cover until #1996 lands.
      const llm = scriptedLlm([SURVEY, DECOMPOSE, KRS]);
      const d = deps(stubGithub([{ path: "src/pay.ts", content: "x" }]), llm);
      expect((await generate(input, d)).delivery).toBeUndefined();
    });
  });
});
