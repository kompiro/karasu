import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { tmpdir } from "node:os";
import { DIAGNOSTIC_IDS } from "@karasu-tools/core";

/**
 * The contract of how the CLI shows a catalog diagnostic (#3654, TPL-3654):
 * people read `<Severity>[KRS…]` lines, tools read `karasu check --format json`.
 * Run against the real compiler; the locale is fixed when `i18n.ts` loads, so
 * each locale gets freshly imported modules.
 */

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), "karasu-diag-output-"));
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.resetModules();
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
  const before = process.exitCode;
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
  // `--format json` reports failure through exitCode so stdout can drain.
  if (exitCode === undefined && process.exitCode !== before) {
    exitCode = Number(process.exitCode);
  }
  process.exitCode = before;
  return { exitCode, stderr, stdout };
}

async function file(name: string, source: string): Promise<string> {
  const path = join(tmpDir, name);
  await writeFile(path, source, "utf-8");
  return path;
}

/** The CLI's command modules, loaded under `locale`. */
async function commands(locale: "en" | "ja") {
  vi.stubEnv("LC_ALL", locale === "ja" ? "ja_JP.UTF-8" : "en_US.UTF-8");
  vi.resetModules();
  return {
    check: (await import("./check.js")).check,
    lintStyle: (await import("./lint-style.js")).lintStyle,
    tidyStyle: (await import("./tidy-style.js")).tidyStyle,
  };
}

const ids: Record<string, string> = DIAGNOSTIC_IDS;

// `Ghost` resolves nowhere: unresolved-edge-endpoint, a warning at 3:3.
const UNRESOLVED = `system S {
  service A {}
  A -> Ghost "x"
}
`;

// A declaration the parser refuses: an error.
const TOP_LEVEL_USER = `system S { service A {} }
user Bob
`;

const BAD_HEX = `service { color: #zzzz; }\n`;

describe("diagnostic lines carry the code's ID (#3654)", () => {
  it("puts the ID right after the severity word in check's lines", async () => {
    const { check } = await commands("en");
    const krs = await file("index.krs", `${UNRESOLVED}user Bob\n`);
    const out = await run(() => check(krs));
    expect(out.stderr).toContain(
      `Warning[${ids["unresolved-edge-endpoint"]}]: ${krs}:3:3: Edge "A → Ghost"`,
    );
    expect(out.stderr).toMatch(new RegExp(`^Error\\[${ids["top-level-declaration"]}\\]: `, "m"));
    expect(out.exitCode).toBe(1);
  });

  it("keeps the same ID under the ja locale", async () => {
    const { check } = await commands("ja");
    const krs = await file("index.krs", UNRESOLVED);
    const out = await run(() => check(krs));
    expect(out.stderr).toMatch(
      new RegExp(`^Warning\\[${ids["unresolved-edge-endpoint"]}\\]: \\S+:3:3: `, "m"),
    );
  });

  it("shows one ID for a code whose severity depends on the surface", async () => {
    // style-invalid-hex-color: an error in lint-style, a warning in check.
    const { check, lintStyle } = await commands("en");
    const sheet = await file("theme.krs.style", BAD_HEX);
    const krs = await file("index.krs", `@import "./theme.krs.style"\nsystem S { service A {} }\n`);
    const id = ids["style-invalid-hex-color"];

    const lint = await run(() => lintStyle([sheet], {}));
    expect(lint.stdout).toContain(`${sheet}:1:18 error[${id}]: `);

    const checked = await run(() => check(krs));
    expect(checked.stderr).toMatch(new RegExp(`^Warning\\[${id}\\]: `, "m"));
  });

  it("tags tidy-style's error lines", async () => {
    const { tidyStyle } = await commands("en");
    const sheet = await file("broken.krs.style", `service { color: red\n`);
    const out = await run(() => tidyStyle([sheet], { check: true }));
    expect(out.stderr).toMatch(/:\d+:\d+ error\[KRS\d{3}\]: /);
    expect(out.exitCode).toBe(1);
  });
});

describe("karasu check --format json (#3654)", () => {
  interface Report {
    schemaVersion: number;
    errorCount: number;
    diagnostics: {
      id: string;
      code: string;
      severity: string;
      file?: string;
      line?: number;
      column?: number;
      params: Record<string, unknown>;
      message: string;
      details: string[];
    }[];
  }

  it("prints one document on stdout and keeps catalog lines off stderr", async () => {
    const { check } = await commands("en");
    const krs = await file("index.krs", UNRESOLVED);
    const out = await run(() => check(krs, { format: "json" }));
    expect(out.exitCode).toBeUndefined();
    expect(out.stderr).toBe("");
    const report = JSON.parse(out.stdout) as Report;
    expect(report.schemaVersion).toBe(1);
    expect(report.errorCount).toBe(0);
    expect(report.diagnostics).toEqual([
      {
        id: ids["unresolved-edge-endpoint"],
        code: "unresolved-edge-endpoint",
        severity: "warning",
        file: krs,
        line: 3,
        column: 3,
        params: { from: "A", to: "Ghost", unresolvedId: "Ghost" },
        message: expect.stringContaining('references unknown node "Ghost"'),
        details: [],
      },
    ]);
  });

  it("returns the same id, code and params under the ja locale", async () => {
    const strip = (r: Report) =>
      r.diagnostics.map(({ id, code, params }) => ({ id, code, params }));
    const en = await commands("en");
    const krs = await file("index.krs", UNRESOLVED);
    const enReport = JSON.parse((await run(() => en.check(krs, { format: "json" }))).stdout);
    const ja = await commands("ja");
    const jaOut = await run(() => ja.check(krs, { format: "json" }));
    const jaReport = JSON.parse(jaOut.stdout) as Report;
    expect(strip(jaReport)).toEqual(strip(enReport));
    expect(jaReport.diagnostics[0].message).not.toBe(enReport.diagnostics[0].message);
  });

  it("prints readable JSON and exits 1 when the model has an error", async () => {
    const { check } = await commands("en");
    const krs = await file("index.krs", TOP_LEVEL_USER);
    const out = await run(() => check(krs, { format: "json" }));
    expect(out.exitCode).toBe(1);
    expect(out.stderr).toBe("");
    const report = JSON.parse(out.stdout) as Report;
    expect(report.errorCount).toBe(1);
    expect(report.diagnostics[0]).toMatchObject({
      id: ids["top-level-declaration"],
      code: "top-level-declaration",
      severity: "error",
      file: krs,
      line: 2,
      column: 1,
    });
  });

  it("lists findings in the order the text lines print them", async () => {
    const { check } = await commands("en");
    const krs = await file("index.krs", `${UNRESOLVED}user Bob\n`);
    const text = await run(() => check(krs));
    const json = JSON.parse((await run(() => check(krs, { format: "json" }))).stdout) as Report;
    const textIds = [...text.stderr.matchAll(/^\w+\[(KRS\d{3})\]: /gm)].map((m) => m[1]);
    expect(textIds.length).toBeGreaterThan(1);
    expect(json.diagnostics.map((d) => d.id)).toEqual(textIds);
  });

  it("names the entry for a Diagnostic without a position", async () => {
    // A missing style sheet is a Diagnostic without a position, so like its
    // text line it names the entry and no line. `line` and `column` come as a
    // pair, and only with a file.
    const { check } = await commands("en");
    const krs = await file("index.krs", '@import "./nope.krs.style"\nsystem S { service A {} }\n');
    const report = JSON.parse((await run(() => check(krs, { format: "json" }))).stdout) as Report;
    const missing = report.diagnostics.find((d) => d.code === "style-file-not-found");
    expect(missing).toBeDefined();
    expect(missing!.file).toBe(krs);
    expect(missing!.line).toBeUndefined();
    const unpaired = report.diagnostics.filter(
      (d) =>
        (d.line === undefined) !== (d.column === undefined) || (d.line !== undefined && !d.file),
    );
    expect(unpaired).toEqual([]);
  });

  it("gives a Warning without a position no file, line or column", async () => {
    // The text line of such a warning names no file, so neither does the JSON;
    // borrowing the entry's path would name a file the warning did not mean.
    const { diagnosticsJson } = await import("./report-diagnostics.js");
    const report = JSON.parse(
      diagnosticsJson(
        "index.krs",
        [],
        [{ kind: "domain-dispersal", params: { domainId: "Order", services: ["A", "B"] } }],
      ),
    ) as Report;
    expect(report.diagnostics).toHaveLength(1);
    expect(Object.keys(report.diagnostics[0])).toEqual([
      "id",
      "code",
      "severity",
      "params",
      "message",
      "details",
    ]);
  });

  it("prints nothing on stdout and fails when the file does not exist", async () => {
    const { check } = await commands("en");
    const out = await run(() => check(join(tmpDir, "missing.krs"), { format: "json" }));
    expect(out.stdout).toBe("");
    expect(out.exitCode).not.toBe(0);
    expect(out.exitCode).toBeDefined();
  });

  it("rejects an unknown format", async () => {
    const { check } = await commands("en");
    const krs = await file("index.krs", UNRESOLVED);
    const out = await run(() => check(krs, { format: "yaml" }));
    expect(out.exitCode).toBe(1);
    expect(out.stdout).toBe("");
    expect(out.stderr).toContain('unknown --format "yaml"');
  });
});

describe("every CLI line for a catalog diagnostic goes through diagnosticParts (TPL-1417)", () => {
  // Calling the bare renderers prints a message without its ID. Only i18n.ts
  // (which wraps them) and the serve endpoint's 422 body (out of scope, #3654)
  // may.
  const ALLOWED = new Set(["i18n.ts", "render-endpoint.ts"]);
  const here = import.meta.dirname;

  function sources(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const path = join(dir, e.name);
      if (e.isDirectory()) return sources(path);
      return e.name.endsWith(".ts") && !e.name.endsWith(".test.ts") ? [path] : [];
    });
  }

  it("finds the source files", () => {
    expect(sources(here).length).toBeGreaterThan(20);
  });

  it("calls the bare renderers only where allowed", () => {
    const offenders = sources(here)
      .filter((path) => !ALLOWED.has(relative(here, path)))
      .filter((path) =>
        /\b(formatDiagnostic|formatWarning|renderDiagnostic|renderWarning)\b/.test(
          readFileSync(path, "utf8"),
        ),
      )
      .map((path) => relative(here, path));
    expect(offenders).toEqual([]);
  });
});
