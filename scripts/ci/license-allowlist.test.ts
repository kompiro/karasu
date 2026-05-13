import { describe, expect, it } from "vitest";
import { findDisallowed, isLicenseAllowed, type PnpmLicensesList } from "./license-allowlist.ts";

describe("isLicenseAllowed", () => {
  it.each([
    "MIT",
    "ISC",
    "BSD-2-Clause",
    "BSD-3-Clause",
    "Apache-2.0",
    "MPL-2.0",
    "0BSD",
    "Unlicense",
    "CC0-1.0",
  ])("accepts the bare allowed identifier %s", (id) => {
    expect(isLicenseAllowed(id)).toBe(true);
  });

  it.each([
    "GPL-3.0",
    "GPL-2.0-only",
    "AGPL-3.0",
    "LGPL-3.0",
    "Unknown",
    "UNLICENSED",
    "SEE LICENSE IN LICENSE",
  ])("rejects the disallowed / unknown identifier %s", (id) => {
    expect(isLicenseAllowed(id)).toBe(false);
  });

  it("accepts an OR expression when any operand is allowed", () => {
    expect(isLicenseAllowed("(MPL-2.0 OR Apache-2.0)")).toBe(true);
    expect(isLicenseAllowed("(MIT OR GPL-3.0)")).toBe(true);
    expect(isLicenseAllowed("(GPL-2.0 OR LGPL-2.1)")).toBe(false);
  });

  it("accepts an AND expression only when every operand is allowed", () => {
    expect(isLicenseAllowed("(MIT AND ISC)")).toBe(true);
    expect(isLicenseAllowed("(MIT AND GPL-3.0)")).toBe(false);
  });

  it("respects parenthesised precedence in mixed expressions", () => {
    expect(isLicenseAllowed("(MIT OR GPL-3.0) AND BSD-3-Clause")).toBe(true);
    expect(isLicenseAllowed("(MIT OR GPL-3.0) AND GPL-2.0")).toBe(false);
    expect(isLicenseAllowed("MIT AND (GPL-2.0 OR GPL-3.0)")).toBe(false);
  });

  it("handles a trailing '+' and a 'WITH' exception clause", () => {
    expect(isLicenseAllowed("Apache-2.0+")).toBe(true);
    expect(isLicenseAllowed("Apache-2.0 WITH LLVM-exception")).toBe(true);
    expect(isLicenseAllowed("GPL-3.0 WITH GCC-exception-3.1")).toBe(false);
  });

  it.each(["", "   ", "(MIT", "MIT OR", "MIT)", "() ", "MIT AND"])(
    "fails closed on malformed input %j",
    (bad) => {
      expect(isLicenseAllowed(bad)).toBe(false);
    },
  );
});

describe("findDisallowed", () => {
  const fixture: PnpmLicensesList = {
    MIT: [
      { name: "commander", versions: ["14.0.0"], paths: ["/x/commander"], license: "MIT" },
      { name: "chokidar", versions: ["5.0.0"], paths: ["/x/chokidar"], license: "MIT" },
    ],
    "(MPL-2.0 OR Apache-2.0)": [
      {
        name: "dompurify",
        versions: ["3.0.0"],
        paths: ["/x/dompurify"],
        license: "(MPL-2.0 OR Apache-2.0)",
      },
    ],
    "GPL-3.0": [
      { name: "bad-lib", versions: ["1.0.0", "2.0.0"], paths: ["/x/bad-lib"], license: "GPL-3.0" },
    ],
    Unknown: [{ name: "mystery", versions: ["0.1.0"], paths: ["/x/mystery"], license: "Unknown" }],
  };

  it("returns only the dependencies outside the allowlist, sorted by name", () => {
    expect(findDisallowed(fixture)).toEqual([
      { name: "bad-lib", versions: ["1.0.0", "2.0.0"], license: "GPL-3.0" },
      { name: "mystery", versions: ["0.1.0"], license: "Unknown" },
    ]);
  });

  it("returns an empty array when everything is allowed", () => {
    expect(findDisallowed({ MIT: fixture.MIT })).toEqual([]);
  });
});
