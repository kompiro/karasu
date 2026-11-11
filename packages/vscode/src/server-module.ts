/**
 * Picks the language server the extension starts: the first candidate that
 * exists (TPL-1024). The packaged `.vsix` carries `out/server.js`; the dev tree
 * (F5 from packages/vscode) may only have packages/lsp's build output.
 *
 * When none exists the client still gets the first candidate, so it fails the
 * way it always did, but `onMissing` first receives every path that was tried,
 * for the caller to report. Without that, a missing server looked like a
 * language server that simply never answered.
 */
export function resolveServerModule(
  candidates: readonly [string, ...string[]],
  exists: (path: string) => boolean,
  onMissing: (tried: readonly string[]) => void,
): string {
  const found = candidates.find((candidate) => exists(candidate));
  if (found !== undefined) return found;
  onMissing(candidates);
  return candidates[0];
}
