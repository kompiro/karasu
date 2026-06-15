import { describe, it, expect } from "vitest";
import { interpretUntil, getMigrationIntent } from "./migration-intent.js";

describe("interpretUntil (#1595)", () => {
  it("interprets a full date (YYYY-MM-DD) as machine-usable", () => {
    expect(interpretUntil("2026-03-15")).toEqual({
      kind: "machine",
      precision: "date",
      sortKey: "2026-03-15",
      raw: "2026-03-15",
    });
  });

  it("interprets a year-month (YYYY-MM) as machine-usable, lower-bound sortKey", () => {
    expect(interpretUntil("2026-03")).toEqual({
      kind: "machine",
      precision: "month",
      sortKey: "2026-03-01",
      raw: "2026-03",
    });
  });

  it("interprets a quarter (YYYY-Qn) at the quarter's first month", () => {
    const sortKeyOf = (v: string) => {
      const r = interpretUntil(v);
      return r.kind === "machine" ? r.sortKey : null;
    };
    expect(sortKeyOf("2026-Q1")).toBe("2026-01-01");
    expect(sortKeyOf("2026-Q2")).toBe("2026-04-01");
    expect(interpretUntil("2026-Q3")).toEqual({
      kind: "machine",
      precision: "quarter",
      sortKey: "2026-07-01",
      raw: "2026-Q3",
    });
    expect(sortKeyOf("2026-Q4")).toBe("2026-10-01");
  });

  it("produces sortKeys that compare correctly across precisions", () => {
    const sortKeyOf = (v: string) => {
      const r = interpretUntil(v);
      return r.kind === "machine" ? r.sortKey : null;
    };
    const a = sortKeyOf("2026-Q1"); // 2026-01-01
    const b = sortKeyOf("2026-03"); // 2026-03-01
    const c = sortKeyOf("2026-07-15"); // 2026-07-15
    expect([c, a, b].sort()).toEqual([a, b, c]);
  });

  it("keeps an opaque (non-date) phrase verbatim without error", () => {
    expect(interpretUntil("sometime next year")).toEqual({
      kind: "opaque",
      raw: "sometime next year",
    });
  });

  it("treats an out-of-range month/day or quarter as opaque (no machine meaning)", () => {
    expect(interpretUntil("2026-13").kind).toBe("opaque"); // month 13
    expect(interpretUntil("2026-02-30").kind).toBe("opaque"); // Feb 30 does not exist
    expect(interpretUntil("2026-00-10").kind).toBe("opaque"); // month 00
    expect(interpretUntil("2026-Q5").kind).toBe("opaque"); // quarter 5
  });

  it("preserves the raw value verbatim even when machine-usable", () => {
    // raw keeps surrounding whitespace; matching is on the trimmed form.
    expect(interpretUntil(" 2026-Q3 ")).toEqual({
      kind: "machine",
      precision: "quarter",
      sortKey: "2026-07-01",
      raw: " 2026-Q3 ",
    });
  });
});

describe("getMigrationIntent (#1595)", () => {
  it("returns undefined when there are no annotation params", () => {
    expect(getMigrationIntent(undefined)).toBeUndefined();
    expect(getMigrationIntent({})).toBeUndefined();
  });

  it("returns undefined when params carry no recognized migration key", () => {
    expect(getMigrationIntent({ deprecated: {} })).toBeUndefined();
  });

  it("reads `until` from @deprecated", () => {
    expect(getMigrationIntent({ deprecated: { until: "2026-Q3" } })).toEqual({
      until: { kind: "machine", precision: "quarter", sortKey: "2026-07-01", raw: "2026-Q3" },
      untilAnnotation: "deprecated",
    });
  });

  it("reads `until` from @experimental", () => {
    expect(getMigrationIntent({ experimental: { until: "2026-03" } })).toEqual({
      until: { kind: "machine", precision: "month", sortKey: "2026-03-01", raw: "2026-03" },
      untilAnnotation: "experimental",
    });
  });

  it("prefers @deprecated's until when both deprecated and experimental carry one", () => {
    const intent = getMigrationIntent({
      deprecated: { until: "2026-Q1" },
      experimental: { until: "2027-Q1" },
    });
    expect(intent?.untilAnnotation).toBe("deprecated");
    expect(intent?.until?.raw).toBe("2026-Q1");
  });

  it("reads `from` from @migration_target", () => {
    expect(getMigrationIntent({ migration_target: { from: "LegacyMonolith" } })).toEqual({
      from: "LegacyMonolith",
    });
  });

  it("combines until and from when both are present", () => {
    const intent = getMigrationIntent({
      deprecated: { until: "2026-03-15" },
      migration_target: { from: "Legacy" },
    });
    expect(intent).toEqual({
      until: { kind: "machine", precision: "date", sortKey: "2026-03-15", raw: "2026-03-15" },
      untilAnnotation: "deprecated",
      from: "Legacy",
    });
  });

  it("keeps an opaque until value (graceful degradation)", () => {
    const intent = getMigrationIntent({ deprecated: { until: "next year" } });
    expect(intent?.until).toEqual({ kind: "opaque", raw: "next year" });
  });
});
