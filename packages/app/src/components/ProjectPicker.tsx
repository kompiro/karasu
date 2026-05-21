import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Project } from "@karasu-tools/core";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

interface ProjectPickerProps {
  /** Whether the picker is shown. */
  open: boolean;
  /** Requests an open-state change (Esc, outside click, or a selection). */
  onOpenChange: (open: boolean) => void;
  /** All projects, in display order. */
  projects: Project[];
  /** The currently active project — marked in the list. */
  currentProject: Project | null;
  /** Called with the chosen project. The picker closes itself first. */
  onSelectProject: (project: Project) => void;
}

/**
 * ProjectPicker — the secondary picker opened by the `Switch Project…`
 * command palette entry (Issue #1482).
 *
 * It mirrors `CommandPalette`'s interaction model — a searchable list with
 * arrow-key navigation, Enter to confirm, Esc / outside-click to close — and
 * deliberately reuses the same shadcn `DialogContent` primitive so it sits on
 * the documented `--z-dialog` layer rather than a local magic number
 * (TPL-20260520-01).
 */
export function ProjectPicker({
  open,
  onOpenChange,
  projects,
  currentProject,
  onSelectProject,
}: ProjectPickerProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset the search box and selection each time the picker opens.
  useEffect(() => {
    if (!open) return;
    setQuery("");
    setSelectedIndex(0);
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q === "" ? projects : projects.filter((p) => p.name.toLowerCase().includes(q));
  }, [projects, query]);

  // Focus the search input on open — Radix focuses Content first, so defer.
  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [open]);

  const selectProject = useCallback(
    (project: Project) => {
      onOpenChange(false);
      onSelectProject(project);
    },
    [onOpenChange, onSelectProject],
  );

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
        const project = filtered[selectedIndex];
        if (project) selectProject(project);
      }
    },
    [filtered, selectedIndex, selectProject],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        hideCloseButton
        className="top-[20%] w-[90vw] max-w-[520px] translate-y-0 gap-0 p-0"
        aria-label="Project picker"
      >
        <DialogTitle className="sr-only">Switch Project</DialogTitle>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelectedIndex(0);
          }}
          onKeyDown={onInputKeyDown}
          placeholder="Search projects…"
          aria-label="Search projects"
          role="combobox"
          aria-expanded
          aria-controls="project-picker-list"
          aria-activedescendant={
            filtered[selectedIndex] ? `project-picker-option-${selectedIndex}` : undefined
          }
          spellCheck={false}
          className="w-full border-0 border-b border-[color:var(--border-strong)] bg-transparent px-4 py-3 text-sm text-[color:var(--text-primary)] outline-none placeholder:text-[color:var(--text-secondary)]"
        />
        <ul
          id="project-picker-list"
          role="listbox"
          aria-label="Projects"
          className="max-h-[320px] overflow-y-auto py-1"
        >
          {filtered.length === 0 ? (
            <li className="px-4 py-3 text-sm text-[color:var(--text-secondary)]">
              No matching projects
            </li>
          ) : (
            filtered.map((project, index) => (
              <li key={project.id}>
                <button
                  type="button"
                  id={`project-picker-option-${index}`}
                  role="option"
                  aria-selected={index === selectedIndex}
                  onMouseMove={() => setSelectedIndex(index)}
                  onClick={() => selectProject(project)}
                  className="group flex w-full items-center justify-between gap-4 px-4 py-2 text-left text-sm text-[color:var(--text-primary)] aria-selected:bg-[color:var(--accent)] aria-selected:text-white"
                >
                  <span>{project.name}</span>
                  {project.id === currentProject?.id && (
                    <span className="text-xs text-[color:var(--text-secondary)] group-aria-selected:text-white">
                      current
                    </span>
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
