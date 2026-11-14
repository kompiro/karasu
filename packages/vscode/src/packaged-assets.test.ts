import * as path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { translate } from "@karasu-tools/i18n";
import {
  PACKAGED_ASSET_NAMES,
  PACKAGED_ASSETS,
  assetCandidates,
  resolvePackagedAsset,
} from "./packaged-assets.js";

// TPL-1024 item 4: a lookup the extension makes into its own folder that finds
// nothing is reported, naming every place tried. Every lookup goes through
// this table (extension-root-access.test.ts), so the loop covers all of them.
const absolute = (relative: string) => path.join("/ext", relative);

describe("resolvePackagedAsset (TPL-1024)", () => {
  it("knows at least the language server and the preview bundle", () => {
    expect(PACKAGED_ASSET_NAMES).toEqual(
      expect.arrayContaining(["languageServer", "webviewScript", "webviewStylesheet"]),
    );
  });

  it.each(PACKAGED_ASSET_NAMES)("reports every candidate of %s when none exists", (asset) => {
    const onMissing = vi.fn<(tried: readonly string[]) => void>();
    const resolved = resolvePackagedAsset(asset, absolute, () => false, onMissing);
    expect(resolved).toBe(path.join(...PACKAGED_ASSETS[asset].path));
    expect(onMissing).toHaveBeenCalledExactlyOnceWith(assetCandidates(asset).map(absolute));
  });

  it.each(PACKAGED_ASSET_NAMES)("takes the packaged %s without reporting", (asset) => {
    const onMissing = vi.fn<(tried: readonly string[]) => void>();
    expect(resolvePackagedAsset(asset, absolute, () => true, onMissing)).toBe(
      assetCandidates(asset)[0],
    );
    expect(onMissing).not.toHaveBeenCalled();
  });

  it("falls back to the dev tree's language server when the packaged copy is missing", () => {
    const onMissing = vi.fn<(tried: readonly string[]) => void>();
    const resolved = resolvePackagedAsset(
      "languageServer",
      absolute,
      (p) => p.includes("lsp"),
      onMissing,
    );
    expect(resolved).toBe(path.join("..", "lsp", "out", "server.js"));
    expect(onMissing).not.toHaveBeenCalled();
  });

  it.each(PACKAGED_ASSET_NAMES)("keeps the packaged %s inside the extension folder", (asset) => {
    // The first candidate is what the .vsix carries; a `..` would point into the dev tree.
    expect(PACKAGED_ASSETS[asset].path).not.toContain("..");
  });

  it.each(["en", "ja"] as const)("names every tried path in the %s message", (locale) => {
    const tried = assetCandidates("languageServer").map(absolute);
    const message = translate(locale, "vscode.asset.notFound", { tried });
    for (const candidate of tried) expect(message).toContain(candidate);
  });
});
