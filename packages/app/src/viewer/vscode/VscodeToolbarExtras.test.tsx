// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { InMemoryFileSystemProvider } from "@karasu-tools/core";
import { AppProvider, useAppContext } from "../../state/app-context.js";
import { LocaleProvider } from "../../i18n/index.js";
import { VscodeToolbarExtras } from "./VscodeToolbarExtras.js";

afterEach(cleanup);

function DisplayModeProbe() {
  const { state } = useAppContext();
  return <output data-testid="mode">{state.displayMode}</output>;
}

function renderExtras(locale: "en" | "ja" = "en") {
  return render(
    <LocaleProvider initialLocale={locale}>
      <AppProvider fs={new InMemoryFileSystemProvider()}>
        <VscodeToolbarExtras />
        <DisplayModeProbe />
      </AppProvider>
    </LocaleProvider>,
  );
}

describe("VscodeToolbarExtras (#3312)", () => {
  // ADR-299: VS Code keeps the Icon Mode toggle on its toolbar.
  it("toggles icon cards in the webview, showing the state with aria-pressed", async () => {
    const user = userEvent.setup();
    renderExtras();
    const toggle = screen.getByRole("button", { name: "Toggle icon cards" });
    expect(toggle.textContent).toContain("Icon Mode");
    expect(toggle.getAttribute("aria-pressed")).toBe("false");

    await user.click(toggle);
    expect(screen.getByTestId("mode").textContent).toBe("icon");
    expect(toggle.getAttribute("aria-pressed")).toBe("true");

    await user.click(toggle);
    expect(screen.getByTestId("mode").textContent).toBe("shape");
  });

  // AT-0038: the jump gesture is announced on the toolbar.
  it("shows the Cmd/Ctrl+click hint, in the display language", () => {
    renderExtras();
    expect(screen.getByTestId("vscode-jump-hint").textContent).toContain("Cmd/Ctrl+Click to jump");
    cleanup();
    renderExtras("ja");
    expect(screen.getByTestId("vscode-jump-hint").textContent).toContain("ジャンプ");
  });
});
