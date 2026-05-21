// @vitest-environment jsdom
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, fireEvent, cleanup, screen, within } from "@testing-library/react";
import type { Project } from "@karasu-tools/core";
import { ProjectPicker } from "./ProjectPicker.js";

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

interface HarnessProps {
  projects?: Project[];
  currentProject?: Project | null;
  onSelectProject?: (project: Project) => void;
}

/** Renders the picker open, with its open-state owned by a parent (as in app). */
function Harness({
  projects = PROJECTS,
  currentProject = PROJECTS[0],
  onSelectProject = () => {},
}: HarnessProps) {
  const [open, setOpen] = useState(true);
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

function dialog() {
  return document.querySelector('[role="dialog"]');
}

function optionNames() {
  return within(screen.getByRole("listbox"))
    .getAllByRole("option")
    .map((o) => o.querySelector("span")?.textContent);
}

describe("ProjectPicker", () => {
  it("lists every project and filters them as the user types", () => {
    render(<Harness />);
    expect(optionNames()).toEqual(["EC Platform", "Getting Started", "MCP Sample"]);

    fireEvent.change(screen.getByLabelText("Search projects"), { target: { value: "platform" } });
    expect(optionNames()).toEqual(["EC Platform"]);
  });

  it("selects the highlighted project on Enter and closes", () => {
    const onSelectProject = vi.fn<(project: Project) => void>();
    render(<Harness onSelectProject={onSelectProject} />);
    fireEvent.keyDown(screen.getByLabelText("Search projects"), { key: "Enter" });
    expect(onSelectProject).toHaveBeenCalledExactlyOnceWith(PROJECTS[0]);
    expect(dialog()).toBeNull();
  });

  it("selects a project on click and closes", () => {
    const onSelectProject = vi.fn<(project: Project) => void>();
    render(<Harness onSelectProject={onSelectProject} />);
    fireEvent.click(screen.getByRole("option", { name: /MCP Sample/ }));
    expect(onSelectProject).toHaveBeenCalledExactlyOnceWith(PROJECTS[2]);
    expect(dialog()).toBeNull();
  });

  it("moves the selection with the arrow keys", () => {
    const onSelectProject = vi.fn<(project: Project) => void>();
    render(<Harness onSelectProject={onSelectProject} />);
    const search = screen.getByLabelText("Search projects");
    fireEvent.keyDown(search, { key: "ArrowDown" });
    fireEvent.keyDown(search, { key: "Enter" });
    expect(onSelectProject).toHaveBeenCalledExactlyOnceWith(PROJECTS[1]);
  });

  // Esc-to-close (and outside-click-to-close) is owned by Radix `Dialog`'s
  // DismissableLayer, not by ProjectPicker, and jsdom does not fully model it
  // — `.claude/rules/testing.md` says skip the assertion here and verify it
  // manually (see docs/acceptance/1482-command-palette-switch-project.md).

  it("shows an empty state when the filter matches nothing", () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText("Search projects"), { target: { value: "zzz" } });
    expect(screen.getByText("No matching projects")).not.toBeNull();
  });

  it("marks the current project and only that one", () => {
    render(<Harness currentProject={PROJECTS[1]} />);
    const current = screen.getByRole("option", { name: /Getting Started/ });
    expect(within(current).queryByText("current")).not.toBeNull();
    const other = screen.getByRole("option", { name: /EC Platform/ });
    expect(within(other).queryByText("current")).toBeNull();
  });

  it("still opens with a single project", () => {
    render(<Harness projects={[PROJECTS[0]]} currentProject={PROJECTS[0]} />);
    expect(dialog()).not.toBeNull();
    expect(optionNames()).toEqual(["EC Platform"]);
  });
});
