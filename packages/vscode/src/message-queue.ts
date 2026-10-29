import type { HostMessage } from "@karasu-tools/app/vscode-webview-protocol";

/**
 * Add `message` to the messages waiting for `ready`, keeping the queue to at
 * most one of each kind: a page that never loads must not collect one entry
 * per keystroke. Only the latest entry, theme and highlight matter, changed
 * paths are merged, and a refresh is implied by a later `setEntry`.
 */
export function coalesce(queue: HostMessage[], message: HostMessage): HostMessage[] {
  if (message.type === "fsResult") return [...queue, message];
  if (message.type === "filesChanged") {
    const pending = queue.find((m) => m.type === "filesChanged");
    const paths = new Set([
      ...(pending?.type === "filesChanged" ? pending.paths : []),
      ...message.paths,
    ]);
    return [
      ...queue.filter((m) => m.type !== "filesChanged"),
      { type: "filesChanged", paths: [...paths] },
    ];
  }
  // A new entry is read from scratch, so a pending refresh has nothing left to do.
  const superseded = message.type === "setEntry" ? ["setEntry", "refresh"] : [message.type];
  return [...queue.filter((m) => !superseded.includes(m.type)), message];
}
