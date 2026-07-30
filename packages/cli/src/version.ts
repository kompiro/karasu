import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { KRS_LANGUAGE_VERSION } from "@karasu-tools/core";

/**
 * Two-line `--version` output (ADR-2124): the package version and the
 * language version are independent axes, so both are shown with their axis
 * named. The package version is read from package.json at runtime — the npm
 * tarball always contains package.json next to dist/, and in the repo the
 * source sits one level below it too, so `../package.json` resolves in both
 * layouts (same technique as packaging.test.ts).
 */
export function cliPackageVersion(): string {
  const pkg = JSON.parse(
    readFileSync(fileURLToPath(new URL("../package.json", import.meta.url)), "utf8"),
  ) as { version: string };
  return pkg.version;
}

export function versionText(): string {
  return `karasu ${cliPackageVersion()}\n.krs language v${KRS_LANGUAGE_VERSION}`;
}
