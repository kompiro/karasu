import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { evaluateAll, evaluateAssumption } from "./assumptions.ts";
import type { ParsedAdr } from "./validator.ts";

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "adr-assumptions-"));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

function fakeAdr(id: string, assumptions: string[]): ParsedAdr {
  return {
    file: `${id}.md`,
    id,
    fm: {
      id,
      title: id,
      status: "accepted",
      date: "2026-01-01",
      topic: "core-concepts",
      assumptions,
    },
    bodyHeading: null,
    body: "",
  };
}

describe("evaluateAssumption", () => {
  it("passes file: when the path exists", () => {
    writeFileSync(join(tmp, "foo.ts"), "");
    const r = evaluateAssumption(fakeAdr("ADR-X", ["file: foo.ts"]), "file: foo.ts", tmp);
    expect(r.status).toBe("ok");
  });

  it("fails file: when the path is missing", () => {
    const r = evaluateAssumption(fakeAdr("ADR-X", ["file: nope.ts"]), "file: nope.ts", tmp);
    expect(r.status).toBe("fail");
    expect(r.message).toContain("missing");
  });

  it("passes grep: when the pattern matches", () => {
    writeFileSync(join(tmp, "foo.ts"), "export function hello() {}");
    const r = evaluateAssumption(
      fakeAdr("ADR-X", []),
      "grep: foo.ts :: export function hello",
      tmp,
    );
    expect(r.status).toBe("ok");
  });

  it("fails grep: when the pattern is absent", () => {
    writeFileSync(join(tmp, "foo.ts"), "export function hello() {}");
    const r = evaluateAssumption(fakeAdr("ADR-X", []), "grep: foo.ts :: goodbye", tmp);
    expect(r.status).toBe("fail");
    expect(r.message).toContain("pattern not found");
  });

  it("fails grep: when the target file is missing", () => {
    const r = evaluateAssumption(fakeAdr("ADR-X", []), "grep: nope.ts :: anything", tmp);
    expect(r.status).toBe("fail");
    expect(r.message).toContain("missing file");
  });

  it("returns manual for free-text assumptions", () => {
    const r = evaluateAssumption(fakeAdr("ADR-X", []), "external IdP is available", tmp);
    expect(r.status).toBe("manual");
  });

  it("allows regex-style patterns in grep:", () => {
    writeFileSync(join(tmp, "foo.ts"), "export type FooBar = 'a' | 'b'");
    const r = evaluateAssumption(fakeAdr("ADR-X", []), "grep: foo.ts :: export type \\w+Bar", tmp);
    expect(r.status).toBe("ok");
  });
});

describe("evaluateAll", () => {
  it("iterates every ADR's assumptions array", () => {
    writeFileSync(join(tmp, "a.ts"), "");
    const adrs = [
      fakeAdr("ADR-1", ["file: a.ts", "manual note"]),
      fakeAdr("ADR-2", ["file: missing.ts"]),
      fakeAdr("ADR-3", []),
    ];
    const results = evaluateAll(adrs, tmp);
    expect(results).toHaveLength(3);
    expect(results.filter((r) => r.status === "ok")).toHaveLength(1);
    expect(results.filter((r) => r.status === "manual")).toHaveLength(1);
    expect(results.filter((r) => r.status === "fail")).toHaveLength(1);
  });
});
