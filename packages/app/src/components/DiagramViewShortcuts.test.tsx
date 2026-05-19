// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";
import type { ReactElement } from "react";
import { DiagramViewShortcuts } from "./DiagramViewShortcuts.js";
import type { ActiveView } from "../state/app-reducer.js";
import { CommandProvider } from "../keyboard/command-context.js";
import { KeyboardShortcutDispatcher } from "../keyboard/KeyboardShortcutDispatcher.js";

afterEach(cleanup);

/** Wrap with the keyboard-shortcut infrastructure so `mod+1..4` are live. */
function renderWithShortcuts(ui: ReactElement) {
  return render(
    <CommandProvider>
      <KeyboardShortcutDispatcher />
      {ui}
    </CommandProvider>,
  );
}

describe("DiagramViewShortcuts", () => {
  const cases: ReadonlyArray<{ key: string; view: ActiveView }> = [
    { key: "1", view: "system" },
    { key: "2", view: "deploy" },
    { key: "3", view: "org" },
    { key: "4", view: "matrix" },
  ];

  for (const { key, view } of cases) {
    it(`mod+${key} switches the active view to "${view}"`, () => {
      const onActiveViewChange = vi.fn<(view: ActiveView) => void>();
      renderWithShortcuts(<DiagramViewShortcuts onActiveViewChange={onActiveViewChange} />);
      fireEvent.keyDown(document, { key, ctrlKey: true });
      expect(onActiveViewChange).toHaveBeenCalledTimes(1);
      expect(onActiveViewChange).toHaveBeenCalledWith(view);
    });
  }

  it("ignores the shortcuts while a text input is focused (TPL-20260519-01)", () => {
    const onActiveViewChange = vi.fn<(view: ActiveView) => void>();
    renderWithShortcuts(<DiagramViewShortcuts onActiveViewChange={onActiveViewChange} />);
    const textarea = document.createElement("textarea");
    document.body.appendChild(textarea);
    textarea.focus();
    for (const { key } of cases) {
      fireEvent.keyDown(document, { key, ctrlKey: true });
    }
    expect(onActiveViewChange).not.toHaveBeenCalled();
    textarea.remove();
  });

  it("stops resolving the shortcuts after the component unmounts (TPL-20260519-01)", () => {
    const onActiveViewChange = vi.fn<(view: ActiveView) => void>();
    const { unmount } = renderWithShortcuts(
      <DiagramViewShortcuts onActiveViewChange={onActiveViewChange} />,
    );
    unmount();
    fireEvent.keyDown(document, { key: "1", ctrlKey: true });
    expect(onActiveViewChange).not.toHaveBeenCalled();
  });
});
