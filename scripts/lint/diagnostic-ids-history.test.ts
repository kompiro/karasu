import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { DIAGNOSTIC_IDS } from "../../packages/core/src/types/diagnostic-ids.ts";
import { REGISTRY_PATH, compareRegistries, parseRegistry } from "./diagnostic-ids-history.ts";

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
