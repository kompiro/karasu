import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { KRS_LANGUAGE_VERSION } from "@karasu-tools/core";
import { cliPackageVersion, versionText } from "./version.js";
import { program } from "./index.js";

const pkg = JSON.parse(
  readFileSync(fileURLToPath(new URL("../package.json", import.meta.url)), "utf8"),
) as { version: string };

// AT for #2181: `karasu --version` prints the real package version and the
// language version, each with its axis named (ADR-2124 canonical notation).
// The hardcoded "0.0.0" this replaces never matched package.json.
describe("karasu --version (#2181)", () => {
  it("reads the real package version, not a hardcoded one", () => {
    expect(cliPackageVersion()).toBe(pkg.version);
    expect(cliPackageVersion()).not.toBe("0.0.0");
  });

  it("prints two lines: package version and canonical language version", () => {
    expect(versionText()).toBe(`karasu ${pkg.version}\n.krs language v${KRS_LANGUAGE_VERSION}`);
  });

  it("is registered as the commander version string", () => {
    // Commander stores the string passed to .version(); --version prints it verbatim.
    expect((program as unknown as { _version: string })._version).toBe(versionText());
  });
});
