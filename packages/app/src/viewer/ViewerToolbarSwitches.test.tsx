// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { LocaleProvider } from "../i18n/index.js";
import { ThemeProvider } from "../theme/index.js";
import { ViewerToolbarSwitches } from "./ViewerToolbarSwitches.js";

afterEach(cleanup);

function renderSwitches(initialLocale: "en" | "ja") {
  return render(
    <LocaleProvider initialLocale={initialLocale}>
      <ThemeProvider initialTheme="dark">
        <ViewerToolbarSwitches />
      </ThemeProvider>
    </LocaleProvider>,
  );
}

describe("ViewerToolbarSwitches (#2997)", () => {
  it("translates the language switch's aria-label and keeps the endonym as its text", () => {
    renderSwitches("en");
    const toJa = screen.getByRole("button", { name: "Switch to Japanese" });
    expect(toJa.textContent).toContain("日本語");
    expect(toJa.querySelector('[lang="ja"]')?.textContent).toBe("日本語");

    fireEvent.click(toJa);
    // Now in Japanese: the label is in the current locale, the text names the target.
    const toEn = screen.getByRole("button", { name: "英語に切り替える" });
    expect(toEn.querySelector('[lang="en"]')?.textContent).toBe("English");
  });

  it("switches the theme and names where it goes", () => {
    renderSwitches("en");
    fireEvent.click(screen.getByRole("button", { name: "Switch to the light theme" }));
    expect(screen.getByRole("button", { name: "Switch to the dark theme" })).toBeTruthy();
  });
});
