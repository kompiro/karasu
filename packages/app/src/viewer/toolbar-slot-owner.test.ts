import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const SRC = path.resolve(__dirname, "..");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : [];
  });
}

// The app's toolbar must look exactly as it does without the viewer (#2997):
// only the viewer may fill the slot.
describe("preview toolbar slot stays empty in the app (#2997)", () => {
  it("is provided only under src/viewer/", () => {
    const providers = sourceFiles(SRC)
      .filter((file) => readFileSync(file, "utf8").includes("PreviewToolbarSlotContext.Provider"))
      .map((file) => path.relative(SRC, file));
    expect(providers).toEqual(["viewer/mount-viewer.tsx"]);
  });
});
