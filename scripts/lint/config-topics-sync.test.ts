import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ADR_CONFIG, check, checkLabels, run, TPL_CONFIG } from "./config-topics-sync.ts";

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

describe("checkLabels", () => {
  it("passes when every topic has its label and nothing else looks like one", () => {
    expect(checkLabels(["parser", "cli"], ["topic: cli", "bug", "topic: parser"])).toEqual({
      missingLabels: [],
      strayLabels: [],
    });
  });

  it("flags a topic added to adr.config.json without its label", () => {
    expect(checkLabels(["parser", "brand-new"], ["topic: parser"])).toEqual({
      missingLabels: ["topic: brand-new"],
      strayLabels: [],
    });
  });

  it("flags a topic: label with no matching topic", () => {
    expect(checkLabels(["parser"], ["topic: parser", "topic: obsolete"])).toEqual({
      missingLabels: [],
      strayLabels: ["topic: obsolete"],
    });
  });

  it("reports a rename done on one side only as both directions", () => {
    // adr.config.json renamed `app` to `app-ui`, the label still has the old name.
    expect(checkLabels(["app-ui"], ["topic: app"])).toEqual({
      missingLabels: ["topic: app-ui"],
      strayLabels: ["topic: app"],
    });
  });

  it("treats a label without the space after the colon as stray", () => {
    expect(checkLabels(["cli"], ["topic: cli", "topic:cli"])).toEqual({
      missingLabels: [],
      strayLabels: ["topic:cli"],
    });
  });

  it("treats a label with different case as stray (GitHub label names are case-insensitive)", () => {
    expect(checkLabels(["cli"], ["topic: cli", "Topic: cli", "TOPIC: foo"])).toEqual({
      missingLabels: [],
      strayLabels: ["TOPIC: foo", "Topic: cli"],
    });
  });

  it("ignores labels that do not start with topic:", () => {
    expect(
      checkLabels(["cli"], ["topic: cli", "status: ready", "topics", "epic: boundary"]),
    ).toEqual({
      missingLabels: [],
      strayLabels: [],
    });
  });
});

describe("run", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("exits 0 when the configs agree and the labels match", () => {
    write(["cli"], ["cli"]);
    expect(run(["--labels"], tmp, () => ["topic: cli", "bug"])).toBe(0);
  });

  it("exits 1 on label drift even when the configs agree", () => {
    write(["cli"], ["cli"]);
    expect(run(["--labels"], tmp, () => ["topic: cli", "topic: obsolete"])).toBe(1);
  });

  it("exits 1 on config drift with --labels even when the labels match", () => {
    write(["cli"], ["cli", "tpl-only"]);
    expect(run(["--labels"], tmp, () => ["topic: cli"])).toBe(1);
  });

  it("never reads labels without --labels", () => {
    write(["cli"], ["cli"]);
    const readLabels = vi.fn<() => string[]>(() => ["topic: obsolete"]);
    expect(run([], tmp, readLabels)).toBe(0);
    expect(readLabels).not.toHaveBeenCalled();
  });

  it("still exits 1 on config drift without --labels", () => {
    write(["cli"], ["parser"]);
    expect(run([], tmp, () => [])).toBe(1);
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
