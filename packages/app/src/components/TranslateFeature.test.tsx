// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { render, fireEvent, cleanup, screen } from "@testing-library/react";
import { CommandProvider } from "../keyboard/command-context.js";
import { KeyboardShortcutDispatcher } from "../keyboard/KeyboardShortcutDispatcher.js";
import { CommandPalette } from "./CommandPalette.js";
import { TranslateFeature } from "./TranslateFeature.js";

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});

describe("TranslateFeature", () => {
  it("registers a command palette entry that opens the translate dialog", () => {
    render(
      <CommandProvider>
        <KeyboardShortcutDispatcher />
        <CommandPalette />
        <TranslateFeature />
      </CommandProvider>,
    );

    // The dialog is not mounted until the command runs.
    expect(screen.queryByText(/Translate infra config to \.krs/)).toBeNull();

    fireEvent.keyDown(document, { key: "p", ctrlKey: true, shiftKey: true });
    fireEvent.click(screen.getByRole("option", { name: /Translate Infra Config to \.krs/ }));

    expect(screen.getByText(/Translate infra config to \.krs/)).not.toBeNull();
  });
});
