// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, fireEvent, cleanup, screen } from "@testing-library/react";
import type { Project } from "@karasu-tools/core";
import { CommandProvider } from "../keyboard/command-context.js";
import { KeyboardShortcutDispatcher } from "../keyboard/KeyboardShortcutDispatcher.js";
import { CommandPalette } from "./CommandPalette.js";
import { SwitchProjectCommand } from "./SwitchProjectCommand.js";

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});

function project(id: string, name: string): Project {
  return {
    id,
    name,
    rootPath: `/projects/${id}`,
    createdAt: "2026-05-21T00:00:00.000Z",
    updatedAt: "2026-05-21T00:00:00.000Z",
  };
}

const PROJECTS = [
  project("a", "EC Platform"),
  project("b", "Getting Started"),
  project("c", "MCP Sample"),
];

function setup(onSelectProject = vi.fn<(project: Project) => void>()) {
  render(
    <CommandProvider>
      <KeyboardShortcutDispatcher />
      <CommandPalette />
      <SwitchProjectCommand
        projects={PROJECTS}
        currentProject={PROJECTS[0]}
        onSelectProject={onSelectProject}
      />
    </CommandProvider>,
  );
  return { onSelectProject };
}

/** Presses Ctrl+Shift+P — the palette-open chord. */
function openPalette() {
  fireEvent.keyDown(document, { key: "p", ctrlKey: true, shiftKey: true });
}

describe("SwitchProjectCommand", () => {
  it("registers a `Switch Project…` entry in the command palette", () => {
    setup();
    openPalette();
    expect(screen.getByRole("option", { name: /Switch Project/ })).not.toBeNull();
  });

  it("opens the project picker when the command runs", () => {
    setup();
    openPalette();
    fireEvent.click(screen.getByRole("option", { name: /Switch Project/ }));
    expect(screen.getByLabelText("Search projects")).not.toBeNull();
    expect(screen.getByRole("option", { name: /Getting Started/ })).not.toBeNull();
  });

  it("switches to the picked project", () => {
    const { onSelectProject } = setup();
    openPalette();
    fireEvent.click(screen.getByRole("option", { name: /Switch Project/ }));
    fireEvent.click(screen.getByRole("option", { name: /MCP Sample/ }));
    expect(onSelectProject).toHaveBeenCalledExactlyOnceWith(PROJECTS[2]);
  });
});
