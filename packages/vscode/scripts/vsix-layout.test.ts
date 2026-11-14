import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { PackageManager, listFiles } from "@vscode/vsce";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PACKAGED_ASSET_NAMES, PACKAGED_ASSETS } from "../src/packaged-assets.ts";
import { missingPackagedAssets } from "./assert-packaged-assets.ts";

/**
 * TPL-1024 item 2: every asset the running extension loads ships in the
 * `.vsix`. The extension can only load names from `PACKAGED_ASSETS`
 * (`src/extension-root-access.test.ts`), the postbuild step checks that the
 * build produced each of them (`assert-packaged-assets.ts`), and this test asks
 * vsce itself which files it would package, with the extension's real
 * `package.json` and `.vscodeignore`, so an ignore rule that drops one fails.
 *
 * vsce lists what is on disk, and the test step runs before the build, so the
 * test lays the assets out in a temp folder outside the repo instead of
 * building. A source file and a script are laid out too and must be left out,
 * which shows the ignore rules were read.
 */
const EXTENSION_ROOT = resolve(import.meta.dirname, "..");
const DECOYS = ["src/extension.ts", "scripts/stage-webview.ts"];
let folder: string;
let packaged: string[];

beforeAll(async () => {
  folder = mkdtempSync(join(tmpdir(), "karasu-vsix-layout-"));
  for (const file of ["package.json", ".vscodeignore", "README.md"]) {
    copyFileSync(join(EXTENSION_ROOT, file), join(folder, file));
  }
  const touch = (relative: string) => {
    mkdirSync(dirname(join(folder, relative)), { recursive: true });
    writeFileSync(join(folder, relative), "x");
  };
  for (const asset of PACKAGED_ASSET_NAMES) {
    const spec = PACKAGED_ASSETS[asset];
    const relative = spec.path.join("/");
    touch(spec.kind === "dir" ? `${relative}/placeholder.js` : relative);
  }
  for (const decoy of DECOYS) touch(decoy);
  packaged = (await listFiles({ cwd: folder, packageManager: PackageManager.None })).map((file) =>
    file.replaceAll("\\", "/"),
  );
});

afterAll(() => {
  rmSync(folder, { recursive: true, force: true });
});

describe("the .vsix ships every packaged asset (TPL-1024)", () => {
  it("applies the extension's ignore rules", () => {
    for (const decoy of DECOYS) expect(packaged).not.toContain(decoy);
    expect(packaged).toContain("package.json");
  });

  it.each(PACKAGED_ASSET_NAMES)("ships %s", (asset) => {
    const spec = PACKAGED_ASSETS[asset];
    const relative = spec.path.join("/");
    // A directory ships when some file under it does.
    const shipped = packaged.some((file) =>
      spec.kind === "dir" ? file.startsWith(`${relative}/`) : file === relative,
    );
    expect(shipped, `${relative} is left out of the .vsix`).toBe(true);
  });
});

describe("the postbuild check walks every packaged asset (TPL-1024)", () => {
  it("passes on the laid-out folder", () => {
    expect(missingPackagedAssets(folder)).toEqual([]);
  });

  it("names every asset when the folder is empty", () => {
    const empty = mkdtempSync(join(tmpdir(), "karasu-vsix-empty-"));
    try {
      const problems = missingPackagedAssets(empty);
      expect(problems).toHaveLength(PACKAGED_ASSET_NAMES.length);
      for (const asset of PACKAGED_ASSET_NAMES) {
        expect(problems.some((line) => line.startsWith(`${asset}: `))).toBe(true);
      }
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });
});
