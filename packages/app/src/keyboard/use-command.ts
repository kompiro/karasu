import { useEffect, useRef } from "react";
import { useOptionalCommandRegistry } from "./command-context.js";
import type { Command } from "./command-types.js";

/**
 * Register a `Command` for the lifetime of the calling component.
 *
 * The latest command object is always used at invocation time, so callers do
 * not need to memoize `run`. No-ops when no `CommandProvider` is mounted,
 * which keeps components usable in isolation (e.g. unit tests).
 */
export function useCommand(command: Command): void {
  const registry = useOptionalCommandRegistry();
  const ref = useRef(command);
  ref.current = command;

  useEffect(() => {
    if (!registry) return;
    // A stable entry that forwards to the latest command via the ref, so the
    // command need not be re-registered when `run` changes between renders.
    const entry: Command = {
      id: ref.current.id,
      get title() {
        return ref.current.title;
      },
      get keybinding() {
        return ref.current.keybinding;
      },
      get whenTextInputFocused() {
        return ref.current.whenTextInputFocused;
      },
      run: () => ref.current.run(),
    };
    return registry.register(entry);
    // `id` is stable for a mounted command; re-register only if it changes.
  }, [registry, command.id]);
}
