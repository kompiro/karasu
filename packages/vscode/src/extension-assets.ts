import * as path from "node:path";
import * as vscode from "vscode";
import { type PackagedAsset, resolvePackagedAsset } from "./packaged-assets.js";

/**
 * The only way the extension reads its own install folder (TPL-1024). Every
 * name comes from `PACKAGED_ASSETS`, whose members the `.vsix` is checked to
 * ship. This is the one file that may touch `asAbsolutePath` / `extensionUri`
 * / `__dirname` and the like: `extension-root-access.test.ts` fails on any
 * other source file that does.
 */
export interface ExtensionAssets {
  /** The asset's absolute path on disk. */
  path(asset: PackagedAsset): string;
  /** The asset's URI, under the extension's own URI (for `asWebviewUri` and `localResourceRoots`). */
  uri(asset: PackagedAsset): vscode.Uri;
}

/**
 * Resolves assets for the extension `context` belongs to. An asset found at
 * none of its candidates goes to `onMissing` with every absolute path tried,
 * once per asset, and resolves to its packaged location so the caller fails
 * as it would have.
 */
export function extensionAssets(
  context: Pick<vscode.ExtensionContext, "asAbsolutePath" | "extensionUri">,
  exists: (absolutePath: string) => boolean,
  onMissing: (tried: readonly string[]) => void,
): ExtensionAssets {
  const reported = new Set<PackagedAsset>();
  const relative = (asset: PackagedAsset) =>
    resolvePackagedAsset(
      asset,
      (candidate) => context.asAbsolutePath(candidate),
      exists,
      (tried) => {
        if (reported.has(asset)) return;
        reported.add(asset);
        onMissing(tried);
      },
    );
  return {
    path: (asset) => context.asAbsolutePath(relative(asset)),
    uri: (asset) => vscode.Uri.joinPath(context.extensionUri, ...relative(asset).split(path.sep)),
  };
}
