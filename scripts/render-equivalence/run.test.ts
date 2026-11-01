import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Manifest } from "./inputs.ts";
import { childEnv, compareCheckouts, renderInChild } from "./run.ts";

const REPO_ROOT = resolve(import.meta.dirname, "../..");

let work: string;

beforeEach(() => {
  work = mkdtempSync(join(tmpdir(), "render-equivalence-run-"));
});
afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(work, { recursive: true, force: true });
});

function write(root: string, rel: string, text: string): void {
  const path = join(root, rel);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
}

/**
 * A checkout whose "core" draws, as its SVG, the names of the GITHUB_*
 * variables it can see: what a PR's core could read or write in the job.
 */
function envProbeCheckout(root: string): void {
  write(
    root,
    "packages/core/src/index.ts",
    `const seen = () => JSON.stringify(Object.keys(process.env).filter((k) => k.startsWith("GITHUB_")).sort());
export function compile() { return { svg: seen(), diagnostics: [], warnings: [], systems: [] }; }
export async function compileProject() { return compile(); }
export function format(source: string) { return source; }
export function tidyStyleSheet(source: string) { return { output: source, diagnostics: [] }; }
export function extractCrudMatrix() { return {}; }
export function renderMatrixAsSvg() { return ""; }
`,
  );
  write(
    root,
    "packages/i18n/src/index.ts",
    `export function bindTranslate() { return null; }
export function renderDiagnostic() { return ""; }
export function renderWarning() { return {}; }
`,
  );
}

const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");

describe("childEnv", () => {
  it("points tsx at the side's own tsconfig", () => {
    expect(childEnv({}, REPO_ROOT).TSX_TSCONFIG_PATH).toBe(join(REPO_ROOT, "tsconfig.json"));
    expect(childEnv({}, "/no/such/checkout").TSX_TSCONFIG_PATH).toBeUndefined();
  });

  it("keeps what node needs and drops the runner's variables", () => {
    const env = childEnv({
      PATH: "/bin",
      HOME: "/home/runner",
      GITHUB_OUTPUT: "/out",
      GITHUB_STEP_SUMMARY: "/summary",
      GITHUB_TOKEN: "t",
      ACTIONS_RUNTIME_TOKEN: "t",
      RUNNER_TEMP: "/tmp",
      NODE_OPTIONS: "--require evil",
    });
    expect(env).toEqual({
      PATH: "/bin",
      HOME: "/home/runner",
      NODE_ENV: "production",
      TZ: "UTC",
      LANG: "C.UTF-8",
    });
  });
});

describe("renderInChild", () => {
  it("runs a side's core without the runner's GITHUB_* variables", () => {
    vi.stubEnv("GITHUB_OUTPUT", "/nowhere/output");
    vi.stubEnv("GITHUB_STEP_SUMMARY", "/nowhere/summary");
    const root = join(work, "probe");
    envProbeCheckout(root);
    const manifest: Manifest = {
      entries: [{ kind: "fence", name: "f", source: "system S {}" }],
      krs: [],
      styles: [],
    };
    const manifestPath = join(work, "manifest.json");
    writeFileSync(manifestPath, JSON.stringify(manifest));

    const output = renderInChild(root, manifestPath, join(work, "out.json"));
    expect(output["render f :: system"]).toEqual({
      ok: true,
      output: sha256("[]"),
      diagnostics: [],
    });
  });

  it("fails, naming the checkout, when the side cannot even load", () => {
    const root = join(work, "empty");
    mkdirSync(root);
    const manifestPath = join(work, "manifest.json");
    writeFileSync(manifestPath, JSON.stringify({ entries: [], krs: [], styles: [] }));
    expect(() => renderInChild(root, manifestPath, join(work, "out.json"))).toThrow(
      `rendering with ${root} failed`,
    );
  });
});

describe("compareCheckouts", () => {
  // The check rests on "the same code produces the same outputs in another
  // process". If rendering ever stops being deterministic, every refactor
  // would fail; this fails first instead.
  it("finds no difference between this checkout and itself", () => {
    const result = compareCheckouts({
      baseRoot: REPO_ROOT,
      headRoot: REPO_ROOT,
      baseSha: "a".repeat(40),
      headSha: "b".repeat(40),
    });
    expect(result.differences).toEqual([]);
    expect(result.compared).toBeGreaterThan(1000);
  }, 120_000);
});
