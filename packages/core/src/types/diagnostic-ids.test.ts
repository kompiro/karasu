import { describe, expect, it } from "vitest";
import { DIAGNOSTIC_IDS, RETIRED_DIAGNOSTIC_IDS, diagnosticIdOf } from "./diagnostic-ids.js";

// The registry's own invariants (#3654, TPL-3654). That a published ID keeps
// naming the same code across releases is checked against the release tag by
// scripts/lint/diagnostic-ids-history.ts; this file checks one revision.

const active = Object.entries(DIAGNOSTIC_IDS);

describe("diagnostic ID registry", () => {
  it("spells every ID as KRS and three digits", () => {
    const ids = [...active.map(([, id]) => id), ...RETIRED_DIAGNOSTIC_IDS.map((r) => r.id)];
    expect(ids.filter((id) => !/^KRS[0-9]{3}$/.test(id))).toEqual([]);
  });

  it("gives each ID to one code", () => {
    const owners = new Map<string, string[]>();
    for (const [code, id] of active) owners.set(id, [...(owners.get(id) ?? []), code]);
    for (const { id, code } of RETIRED_DIAGNOSTIC_IDS) {
      owners.set(id, [...(owners.get(id) ?? []), `retired:${code}`]);
    }
    const shared = [...owners].filter(([, codes]) => codes.length > 1);
    expect(shared).toEqual([]);
  });

  it("numbers active and retired IDs from 001 without a gap", () => {
    // Deleting an ID without recording it as retired leaves a gap and fails here.
    const numbers = [...active.map(([, id]) => id), ...RETIRED_DIAGNOSTIC_IDS.map((r) => r.id)]
      .map((id) => Number(id.slice(3)))
      .sort((a, b) => a - b);
    expect(numbers).toEqual(numbers.map((_, i) => i + 1));
  });

  it("keeps a retired code out of the active codes", () => {
    const retiredCodes = RETIRED_DIAGNOSTIC_IDS.map((r) => r.code);
    expect(retiredCodes.filter((c) => c in DIAGNOSTIC_IDS)).toEqual([]);
  });

  it("looks up a diagnostic code and a warning kind in the same record", () => {
    // style-invalid-hex-color is a Diagnostic code in lint-style and a Warning
    // kind in render; one ID covers both surfaces.
    expect(diagnosticIdOf("style-invalid-hex-color")).toBe(
      DIAGNOSTIC_IDS["style-invalid-hex-color"],
    );
    expect(diagnosticIdOf("unresolved-edge-endpoint")).toMatch(/^KRS[0-9]{3}$/);
  });
});
