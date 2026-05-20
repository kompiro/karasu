// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, fireEvent, cleanup, screen, within } from "@testing-library/react";
import { CommandProvider } from "../keyboard/command-context.js";
import { KeyboardShortcutDispatcher } from "../keyboard/KeyboardShortcutDispatcher.js";
import { useCommand } from "../keyboard/use-command.js";
import type { Command } from "../keyboard/command-types.js";
import { CommandPalette } from "./CommandPalette.js";

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});

/** Registers a command for the lifetime of its mount. */
function CommandHost({ command }: { command: Command }) {
  useCommand(command);
  return null;
}

function setup(commands: Command[]) {
  return render(
    <CommandProvider>
      <KeyboardShortcutDispatcher />
      <CommandPalette />
      {commands.map((c) => (
        <CommandHost key={c.id} command={c} />
      ))}
    </CommandProvider>,
  );
}

/** Presses Ctrl+Shift+P on the document — the palette-open chord. */
function pressOpenChord() {
  fireEvent.keyDown(document, { key: "p", ctrlKey: true, shiftKey: true });
}

function dialog() {
  return document.querySelector('[role="dialog"]');
}

function optionTitles() {
  return within(screen.getByRole("listbox"))
    .getAllByRole("option")
    .map((o) => o.querySelector("span")?.textContent);
}

describe("CommandPalette", () => {
  it("opens on Ctrl/Cmd+Shift+P even while a text input is focused (TPL-20260519-01)", () => {
    setup([{ id: "view.toggleSidebar", title: "Toggle Sidebar", run: () => {} }]);
    // The editor's focus target is a <textarea>; emulate editing focus.
    const editor = document.createElement("textarea");
    document.body.appendChild(editor);
    editor.focus();

    expect(dialog()).toBeNull();
    pressOpenChord();
    expect(dialog()).not.toBeNull();
  });

  it("lists registered commands and filters them as the user types", () => {
    setup([
      { id: "view.toggleSidebar", title: "Toggle Sidebar", run: () => {} },
      { id: "view.showSystem", title: "Show System View", run: () => {} },
    ]);
    pressOpenChord();
    expect(optionTitles()).toEqual(["Toggle Sidebar", "Show System View"]);

    fireEvent.change(screen.getByLabelText("Search commands"), { target: { value: "system" } });
    expect(optionTitles()).toEqual(["Show System View"]);
  });

  it("runs the selected command on Enter and closes the palette", () => {
    const run = vi.fn<() => void>();
    setup([{ id: "view.toggleSidebar", title: "Toggle Sidebar", run }]);
    pressOpenChord();
    fireEvent.keyDown(screen.getByLabelText("Search commands"), { key: "Enter" });
    expect(run).toHaveBeenCalledTimes(1);
    expect(dialog()).toBeNull();
  });

  it("runs a command on click and closes the palette", () => {
    const run = vi.fn<() => void>();
    setup([{ id: "view.toggleSidebar", title: "Toggle Sidebar", run }]);
    pressOpenChord();
    fireEvent.click(screen.getByRole("option", { name: /Toggle Sidebar/ }));
    expect(run).toHaveBeenCalledTimes(1);
    expect(dialog()).toBeNull();
  });

  it("moves the selection with the arrow keys", () => {
    const first = vi.fn<() => void>();
    const second = vi.fn<() => void>();
    setup([
      { id: "view.a", title: "First", run: first },
      { id: "view.b", title: "Second", run: second },
    ]);
    pressOpenChord();
    const search = screen.getByLabelText("Search commands");
    fireEvent.keyDown(search, { key: "ArrowDown" });
    fireEvent.keyDown(search, { key: "Enter" });
    expect(second).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
  });

  it("closes on Escape", () => {
    setup([{ id: "view.toggleSidebar", title: "Toggle Sidebar", run: () => {} }]);
    pressOpenChord();
    expect(dialog()).not.toBeNull();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(dialog()).toBeNull();
  });

  it("excludes its own open command from the list", () => {
    setup([{ id: "view.toggleSidebar", title: "Toggle Sidebar", run: () => {} }]);
    pressOpenChord();
    expect(optionTitles()).toEqual(["Toggle Sidebar"]);
    expect(optionTitles()).not.toContain("Show All Commands");
  });

  it("shows an empty state when the filter matches nothing", () => {
    setup([{ id: "view.toggleSidebar", title: "Toggle Sidebar", run: () => {} }]);
    pressOpenChord();
    fireEvent.change(screen.getByLabelText("Search commands"), { target: { value: "zzz" } });
    expect(screen.getByText("No matching commands")).not.toBeNull();
  });
});
