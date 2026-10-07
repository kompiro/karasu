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

// A tag outside the tool vocabulary parses and warns (tag-not-builtin). A
// usecase directly under a service used to be the warning-only fixture, but
// `.krs language v2.0` makes that an error (#2924).
const WARNING_ONLY = `system S {
  service A [pci] {}
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

  // An import that cannot be resolved is an error diagnostic from the import
  // resolver, not the entry-file guard: the entry exists, so check must still
  // compile and fail on what it could not load.
  it.each([
    ["a wildcard .krs import", 'import "./nope.krs"\nsystem S { service A {} }\n', "nope.krs"],
    [
      "a named .krs import",
      'import { Pay } from "./nope.krs"\nsystem S { service A {} }\n',
      "nope.krs",
    ],
  ])("exits 1 when %s points at a missing file", async (_name, source, missing) => {
    const file = await krsFile("index.krs", source);
    const out = await run(() => check(file));
    expect(out.exitCode).toBe(1);
    expect(out.stderr).toMatch(
      new RegExp(`^Error: .*File not found: .*${missing.replace(/\./g, "\\.")}$`, "m"),
    );
    expect(out.stdout).toBe("");
  });

  // A style sheet is imported with `@import`, and a missing one is a warning
  // (`style-file-not-found`, docs/spec/diagnostics.md): the model still
  // renders with the sheets that did load, so check must not fail on it.
  it("warns but exits 0 when an @import style sheet is missing", async () => {
    const file = await krsFile(
      "index.krs",
      '@import "./nope.krs.style"\nsystem S { service A {} }\n',
    );
    const out = await run(() => check(file));
    expect(out.exitCode).toBeUndefined();
    expect(out.stderr).toMatch(/^Warning: .*Style file not found: .*nope\.krs\.style$/m);
    expect(out.stderr).not.toMatch(/^Error: /m);
    expect(out.stdout).toBe("");
  });

  it("exits 1 when a named import's id is not in the imported file", async () => {
    await krsFile("other.krs", "system T { service Other {} }\n");
    const file = await krsFile(
      "index.krs",
      'import { Pay } from "./other.krs"\nsystem S { service A {} }\n',
    );
    const out = await run(() => check(file));
    expect(out.exitCode).toBe(1);
    expect(out.stderr).toMatch(/^Error: .*index\.krs:1:\d+: .*"Pay"/m);
  });

  // The point of `check`: "check passes" must mean "render succeeds", and the
  // two must print the same findings.
  it.each([
    ["valid", VALID],
    ["parse error", PARSE_ERROR],
    ["duplicate edge id", DUPLICATE_EDGE_ID],
    ["warning only", WARNING_ONLY],
    ["missing import", 'import "./nope.krs"\nsystem S { service A {} }\n'],
    ["missing style sheet", '@import "./nope.krs.style"\nsystem S { service A {} }\n'],
  ])("agrees with karasu render on a %s file", async (_name, source) => {
    const file = await krsFile("index.krs", source);
    const checked = await run(() => check(file));
    const rendered = await run(() => render(file, {}));
    expect(checked.exitCode).toBe(rendered.exitCode);
    expect(checked.stderr).toBe(rendered.stderr);
  });
});
