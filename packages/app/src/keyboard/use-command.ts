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
  // Mirrored after commit, not during render: a discarded render must not
  // leave the registry forwarding to a command no tree ever showed. The
  // effect below is declared after this one, so it reads the fresh value.
  useEffect(() => {
    ref.current = command;
  });

  const { id, keybinding } = command;
  useEffect(() => {
    if (!registry) return;
    // A stable entry that forwards to the latest command via the ref, so the
    // command need not be re-registered when `run` changes between renders.
    const entry: Command = {
      // `id` and `keybinding` are read from the render, not the ref: the effect
      // keys on them, so a new chord re-registers the entry and
      // `CommandProvider.register` checks it for a collision (TPL-1419).
      // Through the ref, a changed chord would skip that check, and
      // `resolveChord` would silently keep whichever holder came first.
      id,
      keybinding,
      get title() {
        return ref.current.title;
      },
      get whenTextInputFocused() {
        return ref.current.whenTextInputFocused;
      },
      run: () => ref.current.run(),
    };
    return registry.register(entry);
  }, [registry, id, keybinding]);
}
