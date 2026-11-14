/**
 * Phrases the VS Code extension host shows itself, outside the webview (which
 * uses the app's catalog). Kept apart from `types.ts` / `en.ts` / `ja.ts` for
 * the same line-budget reason as `first-run.ts`, and joined with it in
 * `catalog-parts.ts`.
 */

export type VscodeTranslations = {
  /**
   * A file the extension loads from its own folder (the language server, the
   * preview bundle) is at none of the paths it tried (TPL-1024).
   */
  "vscode.asset.notFound": (params: { tried: readonly string[] }) => string;
};

const list = (tried: readonly string[]) => tried.map((path) => `  ${path}`).join("\n");

export const vscodeEn: VscodeTranslations = {
  "vscode.asset.notFound": ({ tried }) =>
    `karasu: a file the extension needs was not found. Tried:\n${list(tried)}\n` +
    "Rebuild the extension (pnpm --filter karasu-vscode run build) or reinstall it.",
};

export const vscodeJa: Partial<VscodeTranslations> = {
  "vscode.asset.notFound": ({ tried }) =>
    `karasu: 拡張機能が使うファイルが見つかりません。次の場所を探しました:\n${list(tried)}\n` +
    "拡張機能をビルドし直す（pnpm --filter karasu-vscode run build）か、入れ直してください。",
};
