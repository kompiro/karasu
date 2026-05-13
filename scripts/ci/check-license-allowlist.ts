#!/usr/bin/env tsx
// CI guard: fail the build if any production dependency's license is outside the
// allowlist (`scripts/ci/license-allowlist.ts`). Wired into `.github/workflows/ci.yml`.
// Run locally with `pnpm run check:licenses`.

import { execFileSync } from "node:child_process";
import { findDisallowed, LICENSE_ALLOWLIST, type PnpmLicensesList } from "./license-allowlist.ts";

function readProdLicenses(): PnpmLicensesList {
  let stdout: string;
  try {
    stdout = execFileSync("pnpm", ["--recursive", "licenses", "list", "--prod", "--json"], {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (error) {
    // `pnpm licenses list` exits non-zero when it finds packages with no license
    // metadata; the JSON is still on stdout. Re-parse it rather than bailing.
    const stdoutOnError = (error as { stdout?: string | Buffer }).stdout;
    if (stdoutOnError === undefined) throw error;
    stdout = stdoutOnError.toString("utf8");
  }
  const trimmed = stdout.trim();
  if (trimmed === "") return {};
  return JSON.parse(trimmed) as PnpmLicensesList;
}

function main(): void {
  const disallowed = findDisallowed(readProdLicenses());
  if (disallowed.length === 0) {
    process.stdout.write(
      `✓ All production dependency licenses are within the allowlist (${LICENSE_ALLOWLIST.join(", ")}).\n`,
    );
    return;
  }
  const lines = [
    "✗ Production dependencies with a license outside the allowlist:",
    "",
    ...disallowed.map(
      (entry) => `  - ${entry.name}@${entry.versions.join(", ")} — ${entry.license}`,
    ),
    "",
    `Allowed licenses: ${LICENSE_ALLOWLIST.join(", ")}`,
    "See CONTRIBUTING.md ('License compliance') for what to do:",
    "  1. prefer an alternative dependency with an allowed license, or",
    "  2. if it is genuinely needed, open an ADR proposing the allowlist change.",
  ];
  process.stderr.write(`${lines.join("\n")}\n`);
  process.exitCode = 1;
}

main();
