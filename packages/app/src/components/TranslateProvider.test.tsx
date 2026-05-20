// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { render, fireEvent, cleanup, screen } from "@testing-library/react";
import { CommandProvider } from "../keyboard/command-context.js";
import { KeyboardShortcutDispatcher } from "../keyboard/KeyboardShortcutDispatcher.js";
import { LocaleProvider } from "../i18n/index.js";
import { CommandPalette } from "./CommandPalette.js";
import { TranslateProvider, useOpenTranslateDialog } from "./TranslateProvider.js";

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});

const DIALOG_TITLE = /Translate infra config to \.krs/;

describe("TranslateProvider", () => {
  it("registers a command palette entry that opens the translate dialog", () => {
    render(
      <LocaleProvider initialLocale="en">
        <CommandProvider>
          <KeyboardShortcutDispatcher />
          <CommandPalette />
          <TranslateProvider />
        </CommandProvider>
      </LocaleProvider>,
    );

    // The dialog stays closed (no DOM) until the command runs.
    expect(screen.queryByText(DIALOG_TITLE)).toBeNull();

    fireEvent.keyDown(document, { key: "p", ctrlKey: true, shiftKey: true });
    fireEvent.click(screen.getByRole("option", { name: /Translate Infra Config to \.krs/ }));

    expect(screen.getByText(DIALOG_TITLE)).not.toBeNull();
  });

  it("opens the dialog via the useOpenTranslateDialog opener", () => {
    function Opener() {
      const open = useOpenTranslateDialog();
      return (
        <button type="button" onClick={open}>
          open
        </button>
      );
    }

    render(
      <LocaleProvider initialLocale="en">
        <CommandProvider>
          <TranslateProvider>
            <Opener />
          </TranslateProvider>
        </CommandProvider>
      </LocaleProvider>,
    );

    expect(screen.queryByText(DIALOG_TITLE)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "open" }));
    expect(screen.getByText(DIALOG_TITLE)).not.toBeNull();
  });
});
