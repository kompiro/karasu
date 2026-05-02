import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadConfig } from "./config.ts";
import { runInit } from "./init.ts";

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "adr-init-"));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe("runInit", () => {
  it("writes adr.config.json from the bundled template", () => {
    const result = runInit(tmp);
    expect(result.written).toBe(true);
    expect(existsSync(join(tmp, "adr.config.json"))).toBe(true);
    expect(result.message).toContain("Generated");
  });

  it("refuses to overwrite an existing file", () => {
    writeFileSync(join(tmp, "adr.config.json"), "existing");
    const result = runInit(tmp);
    expect(result.written).toBe(false);
    expect(result.message).toContain("already exists");
    expect(readFileSync(join(tmp, "adr.config.json"), "utf8")).toBe("existing");
  });

  it("generated config passes loadConfig roundtrip", () => {
    runInit(tmp);
    const cfg = loadConfig(tmp);
    expect(cfg.topics.length).toBeGreaterThan(0);
    expect(cfg.concerns.length).toBeGreaterThan(0);
    expect(cfg.paths.adrDir).toBe("docs/adr");
  });
});
