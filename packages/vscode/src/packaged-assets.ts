import * as path from "node:path";
import { WEBVIEW_DIR, WEBVIEW_SCRIPT, WEBVIEW_STYLESHEET } from "./webview-assets.js";

/**
 * Every file or directory the running extension reads from its own install
 * folder (TPL-1024). The extension reaches its folder only through
 * `extension-assets.ts`, which resolves names from this table, so a new
 * runtime asset has to be added here before the code can load it
 * (`extension-root-access.test.ts` fails on any other place that reads the
 * folder). Then `scripts/vsix-layout.test.ts` checks that `.vscodeignore`
 * ships it, and `scripts/assert-packaged-assets.ts` (postbuild) that the build
 * produced it.
 *
 * Kept free of the `vscode` module so the build scripts and tests can load it.
 */
interface PackagedAssetSpec {
  readonly kind: "file" | "dir";
  /** Where the asset is inside the extension folder, and so inside the `.vsix`. */
  readonly path: readonly string[];
  /**
   * Places to try when the packaged copy is missing, in the dev tree only
   * (F5 from packages/vscode before a full build). An installed extension has
   * no sibling packages, so these never resolve there.
   */
  readonly devFallbacks?: readonly (readonly string[])[];
  /** The build step that puts the asset at `path`, named in the postbuild error. */
  readonly builtBy: string;
}

export const PACKAGED_ASSETS = {
  languageServer: {
    kind: "file",
    path: ["out", "server.js"],
    devFallbacks: [["..", "lsp", "out", "server.js"]],
    builtBy: "the `cpSync('../lsp/out/server.js', 'out/server.js')` step of the build script",
  },
  webviewDir: {
    kind: "dir",
    path: WEBVIEW_DIR,
    builtBy: "`tsx scripts/stage-webview.ts` in the build script",
  },
  webviewScript: {
    kind: "file",
    path: [...WEBVIEW_DIR, WEBVIEW_SCRIPT],
    builtBy: "`tsx scripts/stage-webview.ts` in the build script",
  },
  webviewStylesheet: {
    kind: "file",
    path: [...WEBVIEW_DIR, WEBVIEW_STYLESHEET],
    builtBy: "`tsx scripts/stage-webview.ts` in the build script",
  },
} as const satisfies Record<string, PackagedAssetSpec>;

export type PackagedAsset = keyof typeof PACKAGED_ASSETS;

export const PACKAGED_ASSET_NAMES = Object.keys(PACKAGED_ASSETS) as PackagedAsset[];

/** The packaged location first, then the dev-tree fallbacks, as paths relative to the extension folder. */
export function assetCandidates(asset: PackagedAsset): [string, ...string[]] {
  const spec: PackagedAssetSpec = PACKAGED_ASSETS[asset];
  return [
    path.join(...spec.path),
    ...(spec.devFallbacks ?? []).map((fallback) => path.join(...fallback)),
  ];
}

/**
 * Picks where `asset` is: the first candidate that exists, as a path relative
 * to the extension folder.
 *
 * When none exists the packaged location is returned, so the caller fails the
 * way it always did, but `onMissing` first receives every absolute path that
 * was tried, for the caller to report. Without that, a missing language server
 * looked like a server that never answered, and a missing preview bundle like
 * a blank page.
 */
export function resolvePackagedAsset(
  asset: PackagedAsset,
  absolute: (relative: string) => string,
  exists: (absolutePath: string) => boolean,
  onMissing: (tried: readonly string[]) => void,
): string {
  const candidates = assetCandidates(asset);
  const found = candidates.find((candidate) => exists(absolute(candidate)));
  if (found !== undefined) return found;
  onMissing(candidates.map(absolute));
  return candidates[0];
}
