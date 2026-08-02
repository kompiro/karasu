import { describe, expect, it } from "vitest";
import type { LlmClient, LlmResponse } from "./llm.js";
import { reverseRepository, ReverseFailed, type RedactedRepo } from "./pipeline.js";

const usage = { inputTokens: 100, outputTokens: 200 };

/** Replies in order, and records the prompts it was given. */
function scriptedLlm(replies: string[]): LlmClient & { prompts: string[] } {
  const prompts: string[] = [];
  let index = 0;
  return {
    prompts,
    complete(prompt: string): Promise<LlmResponse> {
      prompts.push(prompt);
      const text = replies[index] ?? "";
      index += 1;
      return Promise.resolve({ text, usage });
    },
  };
}

const repo: RedactedRepo = {
  owner: "kompiro",
  repo: "karasu",
  sha: "a".repeat(40),
  files: [
    { path: "src/lending/loan.ts", content: "export class Loan {}" },
    { path: "src/lending/hold.ts", content: "export class Hold {}" },
    { path: "src/catalog/book.ts", content: "export class Book {}" },
  ],
  findings: [],
};

const SURVEY = JSON.stringify({
  contexts: [
    { name: "Lending", why: "loans and holds", readPaths: ["src/lending/loan.ts"] },
    { name: "Catalog", why: "books", readPaths: ["src/catalog/book.ts"] },
  ],
});

const DECOMPOSE = JSON.stringify({
  domains: [
    { name: "Lending", summary: "loans, holds, checkouts", confidence: "high" },
    { name: "Catalog", summary: "the book catalogue", confidence: "low" },
  ],
});

const KRS = `\`\`\`krs
system Library {
  service Circulation {
    domain Lending
    domain Catalog @draft(confidence: "low")
  }
}
\`\`\``;

describe("reverseRepository", () => {
  it("runs three passes and returns a parseable .krs", async () => {
    const llm = scriptedLlm([SURVEY, DECOMPOSE, KRS]);
    const result = await reverseRepository(repo, llm);
    expect(llm.prompts).toHaveLength(3);
    expect(result.krs).toContain("system Library");
    expect(result.krs.endsWith("\n")).toBe(true);
    expect(result.domains.map((d) => d.name)).toEqual(["Lending", "Catalog"]);
  });

  it("sends paths but not contents to the survey pass", async () => {
    // The pass whose only job is choosing what to read must not pay to read
    // everything first.
    const llm = scriptedLlm([SURVEY, DECOMPOSE, KRS]);
    await reverseRepository(repo, llm);
    expect(llm.prompts[0]).toContain("src/lending/loan.ts");
    expect(llm.prompts[0]).not.toContain("export class Loan");
  });

  it("carries the bounded-context directive into both reasoning passes", async () => {
    // ADR-2077 measured this wording; summarising it regresses the result.
    const llm = scriptedLlm([SURVEY, DECOMPOSE, KRS]);
    await reverseRepository(repo, llm);
    const carried = [0, 1].map((index) => ({
      pass: index,
      granularity: llm.prompts[index]?.includes("bounded-context granularity"),
      splitConditions: llm.prompts[index]?.includes("disjoint schema"),
    }));
    expect(carried).toEqual([
      { pass: 0, granularity: true, splitConditions: true },
      { pass: 1, granularity: true, splitConditions: true },
    ]);
  });

  it("reads only the files the survey asked for", async () => {
    const llm = scriptedLlm([SURVEY, DECOMPOSE, KRS]);
    await reverseRepository(repo, llm);
    expect(llm.prompts[1]).toContain("export class Loan");
    expect(llm.prompts[1]).toContain("export class Book");
    // Not requested by the survey.
    expect(llm.prompts[1]).not.toContain("export class Hold");
  });

  it("ignores a path the survey invented", async () => {
    // A hallucinated path must not become a silent empty read.
    const survey = JSON.stringify({
      contexts: [
        { name: "Ghost", why: "?", readPaths: ["src/does/not/exist.ts", "src/catalog/book.ts"] },
      ],
    });
    const llm = scriptedLlm([survey, DECOMPOSE, KRS]);
    await reverseRepository(repo, llm);
    expect(llm.prompts[1]).not.toContain("src/does/not/exist.ts");
    expect(llm.prompts[1]).toContain("export class Book");
  });

  it("caps how many files a pass may read", async () => {
    const many: RedactedRepo = {
      ...repo,
      files: Array.from({ length: 10 }, (_, index) => ({
        path: `src/f${index}.ts`,
        content: `export const f${index} = ${index};`,
      })),
    };
    const survey = JSON.stringify({
      contexts: [{ name: "All", why: "everything", readPaths: many.files.map((f) => f.path) }],
    });
    const llm = scriptedLlm([survey, DECOMPOSE, KRS]);
    await reverseRepository(many, llm, { maxFilesRead: 3 });
    expect(llm.prompts[1]).toContain("export const f2 = 2;");
    expect(llm.prompts[1]).not.toContain("export const f3 = 3;");
  });

  it("passes the decomposition's confidence through to the synthesis prompt", async () => {
    const llm = scriptedLlm([SURVEY, DECOMPOSE, KRS]);
    await reverseRepository(repo, llm);
    expect(llm.prompts[2]).toContain("Catalog (confidence: low)");
    expect(llm.prompts[2]).toContain("@draft");
  });

  it("sums usage per pass and in total", async () => {
    const llm = scriptedLlm([SURVEY, DECOMPOSE, KRS]);
    const result = await reverseRepository(repo, llm);
    expect(result.passes.map((p) => p.name)).toEqual(["survey", "decompose", "synthesise"]);
    expect(result.usage).toEqual({ inputTokens: 300, outputTokens: 600 });
  });

  it("tolerates prose around the JSON", async () => {
    const llm = scriptedLlm([`Sure! Here you go:\n${SURVEY}\nHope that helps.`, DECOMPOSE, KRS]);
    await expect(reverseRepository(repo, llm)).resolves.toBeDefined();
  });

  it("accepts an unfenced .krs reply", async () => {
    const llm = scriptedLlm([SURVEY, DECOMPOSE, "system Library {\n  service Circulation\n}"]);
    expect((await reverseRepository(repo, llm)).krs).toContain("system Library");
  });

  describe("what it refuses", () => {
    it("fails when the survey returns no JSON", async () => {
      const llm = scriptedLlm(["I could not read the repository.", DECOMPOSE, KRS]);
      await expect(reverseRepository(repo, llm)).rejects.toThrowError(/survey/);
    });

    it("fails when the survey returns no contexts", async () => {
      const llm = scriptedLlm(['{"contexts": []}', DECOMPOSE, KRS]);
      await expect(reverseRepository(repo, llm)).rejects.toThrowError(ReverseFailed);
    });

    it("fails when the decomposition returns no domains", async () => {
      const llm = scriptedLlm([SURVEY, '{"domains": []}', KRS]);
      await expect(reverseRepository(repo, llm)).rejects.toThrowError(/decompose/);
    });

    it("refuses output that carries a credential", async () => {
      // The structure-only scan, at the point where it can still stop the
      // document from being cached and served.
      const leak = `\`\`\`krs\nsystem S {\n  service Api "ghp_${"A1b2C3d4E5f6G7h8I9j0".repeat(2)}"\n}\n\`\`\``;
      const llm = scriptedLlm([SURVEY, DECOMPOSE, leak]);
      await expect(reverseRepository(repo, llm)).rejects.toThrowError(/credential patterns/);
    });

    it("refuses output that is not a model", async () => {
      // Prose that reaches the cache would be served as a diagram.
      const llm = scriptedLlm([SURVEY, DECOMPOSE, "```krs\nthis is not karasu syntax\n```"]);
      await expect(reverseRepository(repo, llm)).rejects.toThrowError(/did not parse/);
    });

    it("refuses an empty .krs", async () => {
      const llm = scriptedLlm([SURVEY, DECOMPOSE, "```krs\n\n```"]);
      await expect(reverseRepository(repo, llm)).rejects.toThrowError(ReverseFailed);
    });
  });
});
