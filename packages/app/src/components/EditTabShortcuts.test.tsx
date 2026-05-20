// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";
import type { ReactElement } from "react";
import { EditTabShortcuts } from "./EditTabShortcuts.js";
import type { EditTab } from "./EditTabBar.js";
import { CommandProvider } from "../keyboard/command-context.js";
import { KeyboardShortcutDispatcher } from "../keyboard/KeyboardShortcutDispatcher.js";

afterEach(cleanup);

/** Wrap with the keyboard-shortcut infrastructure so the chords are live. */
function renderWithShortcuts(ui: ReactElement) {
  return render(
    <CommandProvider>
      <KeyboardShortcutDispatcher />
      {ui}
    </CommandProvider>,
  );
}

describe("EditTabShortcuts", () => {
  // `key` is the layout-dependent shifted character a real keyboard reports
  // for Ctrl+Shift+<digit> (`!` / `@` on a US layout); `code` is what the
  // chord is normalized from. See `chord.ts` `chordKey`.
  const cases: ReadonlyArray<{ code: string; key: string; tab: EditTab }> = [
    { code: "Digit1", key: "!", tab: "editor" },
    { code: "Digit2", key: "@", tab: "chat" },
  ];

  for (const { code, key, tab } of cases) {
    it(`mod+shift+${code.slice(5)} selects the "${tab}" tab`, () => {
      const onSelectTab = vi.fn<(tab: EditTab) => void>();
      renderWithShortcuts(<EditTabShortcuts onSelectTab={onSelectTab} />);
      fireEvent.keyDown(document, { code, key, ctrlKey: true, shiftKey: true });
      expect(onSelectTab).toHaveBeenCalledTimes(1);
      expect(onSelectTab).toHaveBeenCalledWith(tab);
    });
  }

  it("fires the shortcuts even while a text input is focused (TPL-20260519-01)", () => {
    // The commands are `whenTextInputFocused: "allow"` — switching away from
    // the Editor implies the Monaco editor (a `<textarea>`) is focused, so a
    // `"skip"` policy would make them dead exactly when they are needed.
    const onSelectTab = vi.fn<(tab: EditTab) => void>();
    renderWithShortcuts(<EditTabShortcuts onSelectTab={onSelectTab} />);
    const textarea = document.createElement("textarea");
    document.body.appendChild(textarea);
    textarea.focus();
    fireEvent.keyDown(document, { code: "Digit2", key: "@", ctrlKey: true, shiftKey: true });
    fireEvent.keyDown(document, { code: "Digit1", key: "!", ctrlKey: true, shiftKey: true });
    expect(onSelectTab).toHaveBeenNthCalledWith(1, "chat");
    expect(onSelectTab).toHaveBeenNthCalledWith(2, "editor");
    textarea.remove();
  });

  it("stops resolving the shortcuts after the component unmounts (TPL-20260519-01)", () => {
    const onSelectTab = vi.fn<(tab: EditTab) => void>();
    const { unmount } = renderWithShortcuts(<EditTabShortcuts onSelectTab={onSelectTab} />);
    unmount();
    fireEvent.keyDown(document, { code: "Digit1", key: "!", ctrlKey: true, shiftKey: true });
    expect(onSelectTab).not.toHaveBeenCalled();
  });
});
