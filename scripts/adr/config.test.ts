import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AdrConfigInvalidError, AdrConfigMissingError, loadConfig } from "./config.ts";

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "adr-config-"));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

function write(content: string): void {
  writeFileSync(join(tmp, "adr.config.json"), content);
}

const VALID = {
  topics: ["a", "b"],
  concerns: ["c"],
  paths: { adrDir: "docs/adr", outputs: { effective: "e.md", graph: "g.md", graphByTopic: "gt/" } },
};

describe("loadConfig", () => {
  it("loads a valid adr.config.json", () => {
    write(JSON.stringify(VALID));
    const cfg = loadConfig(tmp);
    expect(cfg.topics).toEqual(["a", "b"]);
    expect(cfg.concerns).toEqual(["c"]);
    expect(cfg.paths.adrDir).toBe("docs/adr");
    expect(cfg.paths.outputs.effective).toBe("e.md");
  });

  it("throws AdrConfigMissingError when file absent", () => {
    expect(() => loadConfig(tmp)).toThrow(AdrConfigMissingError);
  });

  it("missing-error message points the user at adr:init", () => {
    expect(() => loadConfig(tmp)).toThrow(/adr:init/);
  });

  it("throws AdrConfigInvalidError for invalid JSON", () => {
    write("{not json");
    expect(() => loadConfig(tmp)).toThrow(AdrConfigInvalidError);
  });

  it("throws AdrConfigInvalidError when topics is missing", () => {
    const { topics: _t, ...rest } = VALID;
    write(JSON.stringify(rest));
    expect(() => loadConfig(tmp)).toThrow(/topics/);
  });

  it("throws AdrConfigInvalidError when paths.outputs.graph is missing", () => {
    write(
      JSON.stringify({
        ...VALID,
        paths: { ...VALID.paths, outputs: { effective: "e.md", graphByTopic: "gt/" } },
      }),
    );
    expect(() => loadConfig(tmp)).toThrow(/graph/);
  });

  it("ignores unknown top-level fields (forward-compat)", () => {
    write(JSON.stringify({ ...VALID, futureField: 42 }));
    const cfg = loadConfig(tmp);
    expect(cfg.topics).toEqual(["a", "b"]);
  });

  it("accepts empty arrays for topics and concerns", () => {
    write(JSON.stringify({ ...VALID, topics: [], concerns: [] }));
    const cfg = loadConfig(tmp);
    expect(cfg.topics).toEqual([]);
    expect(cfg.concerns).toEqual([]);
  });

  it("rejects non-string elements in topics", () => {
    write(JSON.stringify({ ...VALID, topics: ["a", 1] }));
    expect(() => loadConfig(tmp)).toThrow(/topics/);
  });
});
