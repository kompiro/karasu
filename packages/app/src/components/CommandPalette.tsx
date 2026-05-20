import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useCommandRegistry } from "../keyboard/command-context.js";
import { useCommand } from "../keyboard/use-command.js";
import type { Command } from "../keyboard/command-types.js";

/** Id of the command that opens the palette — excluded from the palette's own list. */
const PALETTE_COMMAND_ID = "command.openCommandPalette";

/**
 * The command palette — a searchable list of every registered `Command`,
 * opened with `Ctrl/Cmd+Shift+P` and the second consumer of the keyboard
 * command registry (ADR-20260519-02, Issue #1421).
 *
 * The open command is `whenTextInputFocused: "allow"`, so the palette opens
 * even while the editor is focused — the case a user most wants it
 * (TPL-20260519-01). Esc / outside-click close it via Radix.
 *
 * Commands are snapshotted with `getCommands()` when the palette opens; the
 * registry holds them in a ref and does not notify on change, and a palette
 * session is short enough that mid-session registration churn is not a
 * concern (ADR-20260519-02 後続作業).
 */
export function CommandPalette() {
  const registry = useCommandRegistry();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [commands, setCommands] = useState<Command[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const openPalette = useCallback(() => {
    setCommands(registry.getCommands());
    setQuery("");
    setSelectedIndex(0);
    setOpen(true);
  }, [registry]);

  useCommand({
    id: PALETTE_COMMAND_ID,
    title: "Show All Commands",
    keybinding: "mod+shift+p",
    whenTextInputFocused: "allow",
    run: openPalette,
  });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return commands.filter(
      (c) => c.id !== PALETTE_COMMAND_ID && (q === "" || c.title.toLowerCase().includes(q)),
    );
  }, [commands, query]);

  // Focus the search input on open — Radix focuses Content first, so defer.
  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [open]);

  const runCommand = useCallback((command: Command) => {
    setOpen(false);
    command.run();
  }, []);

  const onInputKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (event.key === "Enter") {
        event.preventDefault();
        const command = filtered[selectedIndex];
        if (command) runCommand(command);
      }
    },
    [filtered, selectedIndex, runCommand],
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        hideCloseButton
        className="top-[20%] w-[90vw] max-w-[520px] translate-y-0 gap-0 p-0"
        aria-label="Command palette"
      >
        <DialogTitle className="sr-only">Command Palette</DialogTitle>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelectedIndex(0);
          }}
          onKeyDown={onInputKeyDown}
          placeholder="Type a command…"
          aria-label="Search commands"
          role="combobox"
          aria-expanded
          aria-controls="command-palette-list"
          aria-activedescendant={
            filtered[selectedIndex] ? `command-palette-option-${selectedIndex}` : undefined
          }
          spellCheck={false}
          className="w-full border-0 border-b border-[color:var(--border-strong)] bg-transparent px-4 py-3 text-sm text-[color:var(--text-primary)] outline-none placeholder:text-[color:var(--text-secondary)]"
        />
        <ul
          id="command-palette-list"
          role="listbox"
          aria-label="Commands"
          className="max-h-[320px] overflow-y-auto py-1"
        >
          {filtered.length === 0 ? (
            <li className="px-4 py-3 text-sm text-[color:var(--text-secondary)]">
              No matching commands
            </li>
          ) : (
            filtered.map((command, index) => (
              <li key={command.id}>
                <button
                  type="button"
                  id={`command-palette-option-${index}`}
                  role="option"
                  aria-selected={index === selectedIndex}
                  onMouseMove={() => setSelectedIndex(index)}
                  onClick={() => runCommand(command)}
                  className="group flex w-full items-center justify-between gap-4 px-4 py-2 text-left text-sm text-[color:var(--text-primary)] aria-selected:bg-[color:var(--accent)] aria-selected:text-white"
                >
                  <span>{command.title}</span>
                  {command.keybinding && (
                    <kbd className="text-xs text-[color:var(--text-secondary)] group-aria-selected:text-white">
                      {command.keybinding}
                    </kbd>
                  )}
                </button>
              </li>
            ))
          )}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
