import { createContext, useCallback, useContext, useMemo, useRef, type ReactNode } from "react";
import type { Command } from "./command-types.js";

/**
 * Central registry of `Command`s. The keyboard dispatcher resolves chords
 * against it; the command palette enumerates it.
 */
interface CommandRegistry {
  /** Add a command; returns an unregister function for cleanup. */
  register: (command: Command) => () => void;
  /** Find the command bound to a chord string, if any. */
  resolveChord: (chord: string) => Command | undefined;
  /**
   * Snapshot of every registered command, in registration order. The command
   * palette enumerates this when it opens.
   */
  getCommands: () => Command[];
}

const CommandContext = createContext<CommandRegistry | null>(null);

/** Internal — `useCommand` reads this directly so it can no-op without a provider. */
export function useOptionalCommandRegistry(): CommandRegistry | null {
  return useContext(CommandContext);
}

/** Access the registry; throws when no `CommandProvider` is mounted. */
export function useCommandRegistry(): CommandRegistry {
  const ctx = useContext(CommandContext);
  if (!ctx) {
    throw new Error("useCommandRegistry must be used within a CommandProvider");
  }
  return ctx;
}

/**
 * Provides the command registry. Commands are held in a ref (the dispatcher
 * reads them at event time, so no re-render is needed on registration).
 */
export function CommandProvider({ children }: { children: ReactNode }) {
  const commandsRef = useRef<Map<string, Command>>(new Map());

  const register = useCallback((command: Command) => {
    commandsRef.current.set(command.id, command);
    return () => {
      // Only delete if still the same entry — guards against a re-registered
      // id being removed by a stale cleanup.
      if (commandsRef.current.get(command.id) === command) {
        commandsRef.current.delete(command.id);
      }
    };
  }, []);

  const resolveChord = useCallback((chord: string) => {
    for (const command of commandsRef.current.values()) {
      if (command.keybinding === chord) return command;
    }
    return undefined;
  }, []);

  const getCommands = useCallback(() => [...commandsRef.current.values()], []);

  const registry = useMemo<CommandRegistry>(
    () => ({ register, resolveChord, getCommands }),
    [register, resolveChord, getCommands],
  );

  return <CommandContext.Provider value={registry}>{children}</CommandContext.Provider>;
}
