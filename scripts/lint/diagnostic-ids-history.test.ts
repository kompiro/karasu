import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DIAGNOSTIC_IDS } from "../../packages/core/src/types/diagnostic-ids.ts";
import {
  REGISTRY_PATH,
  compareRegistries,
  parseRegistry,
  verdict,
} from "./diagnostic-ids-history.ts";

function registry(active: Record<string, string>, retired: Record<string, string> = {}) {
  return { active: new Map(Object.entries(active)), retired: new Map(Object.entries(retired)) };
}

describe("parseRegistry", () => {
  it("reads every entry of the real registry as text", () => {
    // The guard reads the registry from a release tag as text, so the file's
    // one-entry-per-line shape is part of the contract. A reformat that breaks
    // it would make the published side parse empty and the guard pass blind.
    const text = readFileSync(resolve(import.meta.dirname, "../..", REGISTRY_PATH), "utf8");
    const parsed = parseRegistry(text);
    expect(Object.fromEntries(parsed.active)).toEqual(DIAGNOSTIC_IDS);
  });

  it("reads retired entries", () => {
    const parsed = parseRegistry(
      [
        "export const RETIRED_DIAGNOSTIC_IDS = [",
        '  { id: "KRS007", code: "old-code" },',
        "];",
      ].join("\n"),
    );
    expect(Object.fromEntries(parsed.retired)).toEqual({ KRS007: "old-code" });
  });
});

describe("compareRegistries", () => {
  it("passes when HEAD keeps every published ID and adds new ones", () => {
    const published = registry({ a: "KRS001", b: "KRS002" });
    const head = registry({ a: "KRS001", b: "KRS002", c: "KRS003" });
    expect(compareRegistries(published, head)).toEqual([]);
  });

  it("passes when a published code is retired with its ID", () => {
    const published = registry({ a: "KRS001", b: "KRS002" });
    const head = registry({ a: "KRS001" }, { KRS002: "b" });
    expect(compareRegistries(published, head)).toEqual([]);
  });

  it("fails when a retired code's ID is given to a new code", () => {
    const published = registry({ a: "KRS001" }, { KRS002: "b" });
    const head = registry({ a: "KRS001", c: "KRS002" });
    expect(compareRegistries(published, head)).toEqual([
      { id: "KRS002", published: "b", head: "c" },
    ]);
  });

  it("fails when a published ID disappears without being retired", () => {
    const published = registry({ a: "KRS001", b: "KRS002" });
    const head = registry({ a: "KRS001" });
    expect(compareRegistries(published, head)).toEqual([
      { id: "KRS002", published: "b", head: undefined },
    ]);
  });

  it("fails when two published codes swap IDs", () => {
    const published = registry({ a: "KRS001", b: "KRS002" });
    const head = registry({ a: "KRS002", b: "KRS001" });
    expect(compareRegistries(published, head).map((p) => p.id)).toEqual(["KRS001", "KRS002"]);
  });

  it("allows renumbering an ID that was never published", () => {
    // Parallel PRs both took KRS003 after the release; the later one moves to
    // KRS004. Nothing published names KRS003 or KRS004, so this is not reuse.
    const published = registry({ a: "KRS001", b: "KRS002" });
    const head = registry({ a: "KRS001", b: "KRS002", c: "KRS003", d: "KRS004" });
    expect(compareRegistries(published, head)).toEqual([]);
  });
});

describe("verdict", () => {
  // Throwaway repositories, so each way the guard could skip the comparison
  // is exercised end to end. GIT_* variables from a calling hook are dropped
  // so the commands cannot reach the real repository.
  const repos: string[] = [];
  afterEach(() => {
    for (const r of repos.splice(0)) rmSync(r, { recursive: true, force: true });
  });

  function repo(): (args: string[]) => void {
    const dir = mkdtempSync(join(tmpdir(), "diag-ids-history-"));
    repos.push(dir);
    const env = { ...process.env };
    for (const key of Object.keys(env)) if (key.startsWith("GIT_")) delete env[key];
    const run = (args: string[]) =>
      void execFileSync("git", args, { cwd: dir, env, stdio: "ignore" });
    run(["init", "-q"]);
    run(["config", "user.email", "test@example.com"]);
    run(["config", "user.name", "test"]);
    run(["config", "commit.gpgsign", "false"]);
    run(["config", "tag.gpgsign", "false"]);
    Object.assign(run, { dir });
    return run;
  }

  function write(dir: string, path: string, text: string): void {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }

  const registryText = (entries: Record<string, string>) =>
    [
      "export const DIAGNOSTIC_IDS = {",
      ...Object.entries(entries).map(([c, id]) => `  "${c}": "${id}",`),
      "};",
      "export const RETIRED_DIAGNOSTIC_IDS = [];",
    ].join("\n");

  function release(run: (args: string[]) => void, tag: string): void {
    run(["add", "-A"]);
    run(["commit", "-q", "--allow-empty", "-m", tag]);
    run(["tag", tag]);
  }

  const dirOf = (run: (args: string[]) => void) => (run as unknown as { dir: string }).dir;

  it("fails without any release tag", () => {
    const run = repo();
    write(dirOf(run), REGISTRY_PATH, registryText({ alpha: "KRS001" }));
    run(["add", "-A"]);
    run(["commit", "-q", "-m", "init"]);
    expect(verdict(dirOf(run)).message).toContain("no karasu@* tag");
  });

  it("passes when the release has no registry yet", () => {
    const run = repo();
    write(dirOf(run), "packages/core/src/index.ts", "export {};\n");
    release(run, "karasu@0.1.0");
    write(dirOf(run), REGISTRY_PATH, registryText({ alpha: "KRS001" }));
    expect(verdict(dirOf(run))).toMatchObject({ ok: true });
  });

  it("fails when HEAD gives a published ID to another code", () => {
    const run = repo();
    write(dirOf(run), REGISTRY_PATH, registryText({ alpha: "KRS001", beta: "KRS002" }));
    release(run, "karasu@0.1.0");
    write(dirOf(run), REGISTRY_PATH, registryText({ alpha: "KRS001", gamma: "KRS002" }));
    expect(verdict(dirOf(run)).message).toContain("✗ KRS002 named `beta`");
  });

  it("still compares when the release kept its registry at another path", () => {
    const run = repo();
    write(
      dirOf(run),
      "packages/core/src/ids.ts",
      registryText({ alpha: "KRS001", beta: "KRS002" }),
    );
    release(run, "karasu@0.1.0");
    write(dirOf(run), REGISTRY_PATH, registryText({ alpha: "KRS001", gamma: "KRS002" }));
    expect(verdict(dirOf(run)).message).toContain("✗ KRS002 named `beta`");
  });

  it("fails when the release's registry parses to no entries", () => {
    const run = repo();
    write(
      dirOf(run),
      REGISTRY_PATH,
      'export const DIAGNOSTIC_IDS = { alpha: "KRS001", beta: "KRS002" };\n',
    );
    release(run, "karasu@0.1.0");
    write(dirOf(run), REGISTRY_PATH, registryText({ alpha: "KRS001", beta: "KRS002" }));
    expect(verdict(dirOf(run)).message).toContain("parsed to no entries");
  });

  it("compares against the newest release in version order", () => {
    const run = repo();
    write(dirOf(run), REGISTRY_PATH, registryText({ alpha: "KRS001" }));
    release(run, "karasu@0.9.0");
    write(dirOf(run), REGISTRY_PATH, registryText({ alpha: "KRS001", beta: "KRS002" }));
    release(run, "karasu@0.10.0");
    write(dirOf(run), REGISTRY_PATH, registryText({ alpha: "KRS001", gamma: "KRS002" }));
    // Only 0.10.0 published KRS002 as `beta`; 0.9.0 would not see the reuse.
    expect(verdict(dirOf(run)).message).toContain("✗ KRS002 named `beta`");
  });
});
