// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { LocaleProvider } from "../i18n/index.js";
import { ErrorBanner } from "./ErrorBanner.js";

afterEach(cleanup);

function renderWithLocale(ui: ReactElement) {
  return render(<LocaleProvider initialLocale="en">{ui}</LocaleProvider>);
}

describe("ErrorBanner", () => {
  it("renders the message in an alert region", () => {
    const { getByRole } = renderWithLocale(
      <ErrorBanner message="⚠ Import failed: not a zip" onDismiss={() => {}} />,
    );
    expect(getByRole("alert").textContent).toContain("Import failed: not a zip");
  });

  it("calls onDismiss when the dismiss button is clicked", async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn<() => void>();
    const { getByRole } = renderWithLocale(<ErrorBanner message="boom" onDismiss={onDismiss} />);
    await user.click(getByRole("button"));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
