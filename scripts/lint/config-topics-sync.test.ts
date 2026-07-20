import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ADR_CONFIG, check, TPL_CONFIG } from "./config-topics-sync.ts";

const REPO_ROOT = resolve(import.meta.dirname, "../..");

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "config-topics-sync-"));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

function write(adrTopics: string[], tplTopics: string[]): void {
  writeFileSync(join(tmp, ADR_CONFIG), JSON.stringify({ topics: adrTopics }, null, 2));
  writeFileSync(
    join(tmp, TPL_CONFIG),
    JSON.stringify({ idFormat: "date-sequence", topics: tplTopics }, null, 2),
  );
}

describe("check", () => {
  it("passes when both files declare identical topics", () => {
    write(["parser", "renderer"], ["parser", "renderer"]);
    expect(check(tmp)).toEqual({ missingFromTpl: [], missingFromAdr: [], orderDiffers: false });
  });

  it("flags a topic added to adr.config.json only — the expected drift direction", () => {
    write(["parser", "renderer", "brand-new"], ["parser", "renderer"]);
    const r = check(tmp);
    expect(r.missingFromTpl).toEqual(["brand-new"]);
    expect(r.missingFromAdr).toEqual([]);
  });

  it("flags a topic added to tpl.config.json only", () => {
    write(["parser"], ["parser", "tpl-only"]);
    const r = check(tmp);
    expect(r.missingFromAdr).toEqual(["tpl-only"]);
    expect(r.missingFromTpl).toEqual([]);
  });

  it("reports both directions at once", () => {
    write(["parser", "adr-only"], ["parser", "tpl-only"]);
    const r = check(tmp);
    expect(r.missingFromTpl).toEqual(["adr-only"]);
    expect(r.missingFromAdr).toEqual(["tpl-only"]);
  });

  it("flags a pure ordering difference", () => {
    write(["parser", "renderer"], ["renderer", "parser"]);
    const r = check(tmp);
    expect(r.orderDiffers).toBe(true);
    expect(r.missingFromTpl).toEqual([]);
    expect(r.missingFromAdr).toEqual([]);
  });

  it("does not report ordering when membership already differs", () => {
    // Otherwise an add/remove would surface as a confusing ordering complaint.
    write(["parser", "renderer"], ["renderer"]);
    expect(check(tmp).orderDiffers).toBe(false);
  });

  it("ignores idFormat, which the two files intentionally disagree on", () => {
    writeFileSync(
      join(tmp, ADR_CONFIG),
      JSON.stringify({ idFormat: "issue-number", topics: ["parser"] }),
    );
    writeFileSync(
      join(tmp, TPL_CONFIG),
      JSON.stringify({ idFormat: "date-sequence", topics: ["parser"] }),
    );
    expect(check(tmp).missingFromTpl).toEqual([]);
  });

  it("rejects a config whose topics field is not a string array", () => {
    writeFileSync(join(tmp, ADR_CONFIG), JSON.stringify({ topics: "parser" }));
    writeFileSync(join(tmp, TPL_CONFIG), JSON.stringify({ topics: ["parser"] }));
    expect(() => check(tmp)).toThrow(/must be an array of strings/);
  });
});

describe("the real repo", () => {
  it("keeps adr.config.json and tpl.config.json in sync", () => {
    expect(check(REPO_ROOT)).toEqual({
      missingFromTpl: [],
      missingFromAdr: [],
      orderDiffers: false,
    });
  });
});
