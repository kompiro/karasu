// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";
import { CommandProvider } from "./command-context.js";
import { KeyboardShortcutDispatcher } from "./KeyboardShortcutDispatcher.js";
import { useCommand } from "./use-command.js";
import type { Command } from "./command-types.js";

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});

/** Test component that registers a command for the lifetime of its mount. */
function CommandHost({ command }: { command: Command }) {
  useCommand(command);
  return null;
}

function setup(command: Command) {
  return render(
    <CommandProvider>
      <KeyboardShortcutDispatcher />
      <CommandHost command={command} />
    </CommandProvider>,
  );
}

describe("keyboard shortcut dispatcher", () => {
  it("runs a command when its chord is pressed", () => {
    const run = vi.fn<() => void>();
    setup({ id: "test.a", title: "A", keybinding: "mod+b", run });
    fireEvent.keyDown(document, { key: "b", ctrlKey: true });
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("ignores a chord with no matching command", () => {
    const run = vi.fn<() => void>();
    setup({ id: "test.a", title: "A", keybinding: "mod+b", run });
    fireEvent.keyDown(document, { key: "k", ctrlKey: true });
    expect(run).not.toHaveBeenCalled();
  });

  it("skips a 'skip' command while a text input is focused", () => {
    const run = vi.fn<() => void>();
    setup({ id: "test.a", title: "A", keybinding: "mod+b", whenTextInputFocused: "skip", run });
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();
    fireEvent.keyDown(document, { key: "b", ctrlKey: true });
    expect(run).not.toHaveBeenCalled();
  });

  it("runs an 'allow' command even while a text input is focused", () => {
    const run = vi.fn<() => void>();
    setup({ id: "test.a", title: "A", keybinding: "mod+b", whenTextInputFocused: "allow", run });
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();
    fireEvent.keyDown(document, { key: "b", ctrlKey: true });
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("stops resolving a command after its component unmounts", () => {
    const run = vi.fn<() => void>();
    const { unmount } = setup({ id: "test.a", title: "A", keybinding: "mod+b", run });
    unmount();
    fireEvent.keyDown(document, { key: "b", ctrlKey: true });
    expect(run).not.toHaveBeenCalled();
  });

  it("uses the latest run callback without re-registering", () => {
    const first = vi.fn<() => void>();
    const second = vi.fn<() => void>();
    function Rerenderer({ run }: { run: () => void }) {
      useCommand({ id: "test.a", title: "A", keybinding: "mod+b", run });
      return null;
    }
    const { rerender } = render(
      <CommandProvider>
        <KeyboardShortcutDispatcher />
        <Rerenderer run={first} />
      </CommandProvider>,
    );
    rerender(
      <CommandProvider>
        <KeyboardShortcutDispatcher />
        <Rerenderer run={second} />
      </CommandProvider>,
    );
    fireEvent.keyDown(document, { key: "b", ctrlKey: true });
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
