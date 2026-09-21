import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { BUILTIN_ICON_SOURCES } from "./builtin-icons.generated.js";

// Drift guard for the generated module (TPL-1415: the `.svg` files +
// `icons.json` and `builtin-icons.generated.ts` are two representations of one
// set). This compares *contents*, so it holds regardless of how the module's
// text is formatted; the byte-level check of the generator's output lives in
// `scripts/icons/gen-builtin-icons.test.ts`.

const iconsDir = resolve(dirname(fileURLToPath(import.meta.url)), "../../icons");

interface Manifest {
  icons: { name: string; file: string }[];
}

const manifest = JSON.parse(readFileSync(resolve(iconsDir, "icons.json"), "utf8")) as Manifest;

describe("builtin-icons.generated.ts matches packages/core/icons (run `pnpm gen:icons` if this fails)", () => {
  it("has exactly the manifest's names, in manifest order", () => {
    expect(BUILTIN_ICON_SOURCES.map((s) => s.name)).toEqual(manifest.icons.map((e) => e.name));
  });

  it("carries each .svg file verbatim", () => {
    const drifted = manifest.icons
      .filter((entry) => {
        const expected = readFileSync(resolve(iconsDir, entry.file), "utf8");
        return BUILTIN_ICON_SOURCES.find((s) => s.name === entry.name)?.svg !== expected;
      })
      .map((entry) => entry.name);
    expect(drifted).toEqual([]);
  });
});
