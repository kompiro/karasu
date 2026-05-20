// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";
import type { ReactElement } from "react";
import { PreviewFocusShortcut } from "./PreviewFocusShortcut.js";
import { CommandProvider } from "../keyboard/command-context.js";
import { KeyboardShortcutDispatcher } from "../keyboard/KeyboardShortcutDispatcher.js";

afterEach(cleanup);

/** Wrap with the keyboard-shortcut infrastructure so `mod+shift+f` is live. */
function renderWithShortcuts(ui: ReactElement) {
  return render(
    <CommandProvider>
      <KeyboardShortcutDispatcher />
      {ui}
    </CommandProvider>,
  );
}

describe("PreviewFocusShortcut", () => {
  it("mod+shift+f toggles the preview focus mode", () => {
    const onToggle = vi.fn<() => void>();
    renderWithShortcuts(<PreviewFocusShortcut onToggle={onToggle} />);
    fireEvent.keyDown(document, { key: "f", ctrlKey: true, shiftKey: true });
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("ignores the shortcut while a text input is focused (TPL-20260519-01)", () => {
    const onToggle = vi.fn<() => void>();
    renderWithShortcuts(<PreviewFocusShortcut onToggle={onToggle} />);
    const textarea = document.createElement("textarea");
    document.body.appendChild(textarea);
    textarea.focus();
    fireEvent.keyDown(document, { key: "f", ctrlKey: true, shiftKey: true });
    expect(onToggle).not.toHaveBeenCalled();
    textarea.remove();
  });

  it("stops resolving the shortcut after the component unmounts (TPL-20260519-01)", () => {
    const onToggle = vi.fn<() => void>();
    const { unmount } = renderWithShortcuts(<PreviewFocusShortcut onToggle={onToggle} />);
    unmount();
    fireEvent.keyDown(document, { key: "f", ctrlKey: true, shiftKey: true });
    expect(onToggle).not.toHaveBeenCalled();
  });
});
