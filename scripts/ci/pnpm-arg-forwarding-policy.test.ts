import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// `pnpm <script> -- <flag>` does not reliably hand the flag to the tool under
// it, and the failure is silent: the tool runs on its defaults (TPL-2046, where
// Playwright's `--port` never reached Vite). Call the tool directly with
// `pnpm --filter X exec <tool> <flag>`. This scans what starts processes in CI
// and in the hooks. A prose mention in docs is not a process start.

const ROOT = resolve(import.meta.dirname, "../..");

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

function scannedFiles(): string[] {
  const packages = readdirSync(resolve(ROOT, "packages"));
  return [
    "package.json",
    "lefthook.yml",
    ...packages.map((dir) => `packages/${dir}/package.json`),
    ...packages.map((dir) => `packages/${dir}/playwright.config.ts`),
    ...[".github/workflows", ".github/actions"].flatMap((dir) =>
      walk(resolve(ROOT, dir)).map((path) => path.slice(ROOT.length + 1)),
    ),
  ].filter((file) => {
    try {
      readFileSync(resolve(ROOT, file));
      return true;
    } catch {
      return false;
    }
  });
}

/** Lines that forward a flag through pnpm, comments skipped. */
export function forwardedFlags(text: string): string[] {
  return text
    .split("\n")
    .filter((line) => !/^\s*(?:#|\/\/)/.test(line))
    .filter((line) => /\bpnpm\b[^|&;\n]*\s--\s+-/.test(line));
}

describe("pnpm argument forwarding (TPL-2046)", () => {
  it("reads the files that start processes", () => {
    // A moved file would otherwise leave this guard reading nothing.
    expect(scannedFiles()).toEqual(
      expect.arrayContaining([
        "package.json",
        "lefthook.yml",
        ".github/workflows/e2e.yml",
        "packages/e2e/playwright.config.ts",
      ]),
    );
  });

  it("never forwards a flag through `pnpm ... --`", () => {
    const found = scannedFiles().flatMap((file) =>
      forwardedFlags(readFileSync(resolve(ROOT, file), "utf-8")).map(
        (line) => `${file}: ${line.trim()}`,
      ),
    );
    expect(found).toEqual([]);
  });

  describe("what the rule reads", () => {
    it.each([
      ["a run script", "pnpm test -- --port 5173"],
      ["a filtered script", "pnpm --filter @x/e2e test -- --grep foo"],
      ["a package.json value", '"e2e": "pnpm run test -- -g smoke",'],
    ])("flags %s", (_name, line) => {
      expect(forwardedFlags(line)).toHaveLength(1);
    });

    it.each([
      ["a direct call", "pnpm --filter @x/app exec vite --port 5173"],
      ["a chained command", "pnpm build && foo -- --bar"],
      ["a comment", "# pnpm test -- --port 5173"],
      ["a positional after --", "pnpm exec tsx scripts/a.ts -- file"],
    ])("leaves %s alone", (_name, line) => {
      expect(forwardedFlags(line)).toEqual([]);
    });
  });
});
