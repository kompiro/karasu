import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

// Fences the reporting rule decided in ADR-2807: the `ci: nightly-e2e` tracker
// follows the *suite's* verdict, not the job's result. A job cancelled by its
// own budget during setup reached no verdict and must not be reported as a
// failing test (#2807), while a job that failed before the suite ran leaves
// main unverified and still has to be reported.
//
// The script is inline JavaScript inside YAML, so nothing else can see it. It
// is extracted and run here against stubs, the way `actions/github-script`
// runs it: an async function body with `github`, `context` and `core` in scope.

const REPO_ROOT = resolve(import.meta.dirname, "../..");
const WORKFLOW = join(REPO_ROOT, ".github/workflows/e2e-nightly.yml");

/** Pulls the `script: |` block out of the notify step and dedents it. */
function readNotifyScript(): string {
  const lines = readFileSync(WORKFLOW, "utf8").split("\n");
  const start = lines.findIndex((line) => /^ {10}script: \|\s*$/.test(line));
  if (start === -1) throw new Error("notify step's `script: |` block not found");
  const body: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (line.trim() !== "" && !/^ {12}/.test(line)) break;
    body.push(line.slice(12));
  }
  return body.join("\n");
}

const script = readNotifyScript();
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor as new (
  ...args: string[]
) => (...args: unknown[]) => Promise<unknown>;

type IssueCall = { readonly method: string; readonly body?: string; readonly state?: string };

async function runNotify(options: {
  jobResult: string;
  testOutcome: string;
  openIssues?: readonly { number: number }[];
}): Promise<{ calls: IssueCall[]; notices: string[] }> {
  const calls: IssueCall[] = [];
  const notices: string[] = [];
  const openIssues = options.openIssues ?? [];

  vi.stubEnv("OUTCOME", options.jobResult);
  vi.stubEnv("TEST_OUTCOME", options.testOutcome);

  const github = {
    rest: {
      issues: {
        listForRepo: async () => ({ data: openIssues }),
        create: async (args: { body: string }) => {
          calls.push({ method: "create", body: args.body });
        },
        createComment: async (args: { body: string }) => {
          calls.push({ method: "createComment", body: args.body });
        },
        update: async (args: { state: string }) => {
          calls.push({ method: "update", state: args.state });
        },
      },
    },
  };
  const context = {
    serverUrl: "https://github.com",
    repo: { owner: "kompiro", repo: "karasu" },
    runId: 42,
    sha: "abc1234def5678",
  };
  const core = {
    notice: (message: string) => {
      notices.push(message);
    },
  };

  await new AsyncFunction("github", "context", "core", script)(github, context, core);
  return { calls, notices };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("nightly tracking issue follows the suite's verdict (ADR-2807)", () => {
  it("opens the tracker when the suite ran and failed", async () => {
    const { calls } = await runNotify({ jobResult: "failure", testOutcome: "failure" });
    expect(calls.map((call) => call.method)).toEqual(["create"]);
    expect(calls[0].body).toContain("Nightly E2E failed on `abc1234`");
  });

  it("closes the tracker when the suite passed", async () => {
    const { calls } = await runNotify({
      jobResult: "success",
      testOutcome: "success",
      openIssues: [{ number: 7 }],
    });
    expect(calls.map((call) => call.method)).toEqual(["createComment", "update"]);
    expect(calls[1].state).toBe("closed");
  });

  it("closes the tracker when the suite passed but a later step failed", async () => {
    // The flake summary and the artifact uploads run `if: always()`. Their
    // failure makes the job red, but the suite is green and the tracker is
    // about the suite.
    const { calls } = await runNotify({
      jobResult: "failure",
      testOutcome: "success",
      openIssues: [{ number: 7 }],
    });
    expect(calls.map((call) => call.method)).toEqual(["createComment", "update"]);
    expect(calls[1].state).toBe("closed");
  });

  it("leaves the tracker alone when the job was cancelled before a verdict", async () => {
    // The #2805 shape: the budget ran out in `apt-get`, no test ever ran.
    const { calls, notices } = await runNotify({
      jobResult: "cancelled",
      testOutcome: "",
      openIssues: [{ number: 7 }],
    });
    expect(calls).toEqual([]);
    expect(notices[0]).toContain("reached no suite verdict");
  });

  it("reports a job that failed before the suite ran, without claiming a test failed", async () => {
    // `pnpm install` or the browser download broke: main is unverified, so the
    // tracker still opens — but it says the suite never reported.
    const { calls } = await runNotify({ jobResult: "failure", testOutcome: "" });
    expect(calls.map((call) => call.method)).toEqual(["create"]);
    expect(calls[0].body).toContain("could not run");
    expect(calls[0].body).not.toContain("Nightly E2E failed on");
  });
});
