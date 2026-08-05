import { describe, expect, it, vi } from "vitest";
import { GitHubClient } from "../github/client.js";
import type { LlmClient, LlmResponse } from "../reverse/llm.js";
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
      return Promise.resolve({ text, usage: { inputTokens: 10, outputTokens: 20 } });
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
    now: () => CLOCK,
    kv,
  };
}

const input = { installationId: "42", owner: "kompiro", repo: "shop" };

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
      // cannot. The field stays so the pull-request body can keep saying which
      // kind of partial happened, and only our own cap can now cause one.
      const llm = scriptedLlm([SURVEY, DECOMPOSE, KRS]);
      const d = deps(stubGithub([{ path: "src/pay.ts", content: "x" }]), llm);
      const outcome = await generate(input, d);
      expect([outcome.truncatedTree, outcome.truncatedByCap]).toEqual([false, false]);
    });

    it("never reports an unreadable file, because there are no per-file reads", async () => {
      // A blob call could 404 on its own; an entry inside an archive we
      // already hold cannot. The count stays in the record because the metrics
      // schema is retained for 400 days and its meaning is unchanged.
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
});
