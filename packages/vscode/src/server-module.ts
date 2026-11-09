/**
 * Picks the language server the extension starts: the first candidate that
 * exists (TPL-1024). The packaged `.vsix` carries `out/server.js`; the dev tree
 * (F5 from packages/vscode) may only have packages/lsp's build output.
 *
 * When none exists the client still gets the first candidate, so it fails the
 * way it always did, but `log` first names every path that was tried. Without
 * that, a missing server looked like a language server that simply never
 * answered.
 */
export function resolveServerModule(
  candidates: readonly [string, ...string[]],
  exists: (path: string) => boolean,
  log: (message: string) => void,
): string {
  const found = candidates.find((candidate) => exists(candidate));
  if (found !== undefined) return found;
  log(
    `karasu: the language server was not found. Tried:\n${candidates.map((c) => `  ${c}`).join("\n")}\n` +
      "Rebuild the extension (pnpm --filter karasu-vscode run build) or reinstall it.",
  );
  return candidates[0];
}
