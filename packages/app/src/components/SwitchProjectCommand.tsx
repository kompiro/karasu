import { useState } from "react";
import type { Project } from "@karasu-tools/core";
import { useCommand } from "../keyboard/use-command.js";
import { ProjectPicker } from "./ProjectPicker.js";

interface SwitchProjectCommandProps {
  /** All projects, passed straight to the picker. */
  projects: Project[];
  /** The currently active project. */
  currentProject: Project | null;
  /** Switches the active project (wired to `navigateToProject`). */
  onSelectProject: (project: Project) => void;
}

/**
 * Registers the `Switch Project…` command palette entry and owns the
 * `ProjectPicker` it opens (Issue #1482).
 *
 * The command is palette-only — it carries no keybinding, so it never
 * competes for a key chord (TPL-20260519-01) and is reached solely through
 * the command palette (`Ctrl/Cmd+Shift+P`). Mounted from `ProjectModeApp`, so
 * it exists only in OPFS project mode where there are projects to switch
 * between. Renders the picker; nothing is visible until the command runs.
 */
export function SwitchProjectCommand({
  projects,
  currentProject,
  onSelectProject,
}: SwitchProjectCommandProps) {
  const [open, setOpen] = useState(false);

  useCommand({
    id: "project.switch",
    title: "Switch Project…",
    run: () => setOpen(true),
  });

  return (
    <ProjectPicker
      open={open}
      onOpenChange={setOpen}
      projects={projects}
      currentProject={currentProject}
      onSelectProject={onSelectProject}
    />
  );
}
