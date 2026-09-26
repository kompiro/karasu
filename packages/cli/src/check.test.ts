import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { check } from "./check.js";
import { render } from "./render.js";

/**
 * `karasu check` (#2911) against the real compiler — no mocks, because the
 * contract under test is agreement with `karasu render`, and a mock would only
 * agree with itself.
 */

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), "karasu-check-test-"));
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

interface Outcome {
  exitCode: number | undefined;
  stderr: string;
  stdout: string;
}

async function run(fn: () => Promise<void>): Promise<Outcome> {
  let stderr = "";
  let stdout = "";
  let exitCode: number | undefined;
  vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
    stderr += String(chunk);
    return true;
  });
  vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    stdout += String(chunk);
    return true;
  });
  vi.spyOn(process, "exit").mockImplementation((code) => {
    exitCode = Number(code ?? 0);
    throw new Error("process.exit");
  });
  try {
    await fn();
  } catch (e) {
    if (!(e instanceof Error) || e.message !== "process.exit") throw e;
  }
  vi.restoreAllMocks();
  return { exitCode, stderr, stdout };
}

async function krsFile(name: string, source: string): Promise<string> {
  const path = join(tmpDir, name);
  await writeFile(path, source, "utf-8");
  return path;
}

const VALID = `system S {
  service A { label "A" }
  service B { label "B" }
  A -> B "calls"
}
`;

const PARSE_ERROR = `system S {
  service A { label: "A" }
}
`;

// Parses cleanly; the error only exists at the project level.
const DUPLICATE_EDGE_ID = `system S {
  service A {}
  service B {}
  service C {}
  A -> B "x" #e1
  A -> C "y" #e1
}
`;

// A usecase directly under a service warns node-not-in-context.
const WARNING_ONLY = `system S {
  service A {
    usecase Foo {}
  }
}
`;

describe("karasu check", () => {
  it("exits 0 and writes nothing for a valid file", async () => {
    const file = await krsFile("index.krs", VALID);
    const out = await run(() => check(file));
    expect(out.exitCode).toBeUndefined();
    expect(out.stdout).toBe("");
    expect(out.stderr).toBe("");
  });

  it("exits 1 on a parse error and reports its position", async () => {
    const file = await krsFile("index.krs", PARSE_ERROR);
    const out = await run(() => check(file));
    expect(out.exitCode).toBe(1);
    expect(out.stderr).toMatch(/^Error: .*index\.krs:2:\d+: /m);
    expect(out.stdout).toBe("");
  });

  it("exits 1 on a project-level error the parser does not see", async () => {
    const file = await krsFile("index.krs", DUPLICATE_EDGE_ID);
    const out = await run(() => check(file));
    expect(out.exitCode).toBe(1);
    expect(out.stderr).toContain('Duplicate edge id "#e1"');
  });

  it("prints warnings without failing", async () => {
    const file = await krsFile("index.krs", WARNING_ONLY);
    const out = await run(() => check(file));
    expect(out.exitCode).toBeUndefined();
    expect(out.stderr).toMatch(/^Warning: /m);
  });

  it("exits 1 when the file does not exist", async () => {
    const out = await run(() => check(join(tmpDir, "missing.krs")));
    expect(out.exitCode).toBe(1);
    expect(out.stderr).toContain("File not found");
  });

  // The point of `check`: "check passes" must mean "render succeeds", and the
  // two must print the same findings.
  it.each([
    ["valid", VALID],
    ["parse error", PARSE_ERROR],
    ["duplicate edge id", DUPLICATE_EDGE_ID],
    ["warning only", WARNING_ONLY],
  ])("agrees with karasu render on a %s file", async (_name, source) => {
    const file = await krsFile("index.krs", source);
    const checked = await run(() => check(file));
    const rendered = await run(() => render(file, {}));
    expect(checked.exitCode).toBe(rendered.exitCode);
    expect(checked.stderr).toBe(rendered.stderr);
  });
});
