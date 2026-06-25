// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ShareDialog } from "./ShareDialog.js";
import { LocaleProvider } from "../i18n/index.js";

afterEach(cleanup);

const URL = "https://karasu-nest.example/#s=abc123";

function renderDialog(props: Partial<Parameters<typeof ShareDialog>[0]> = {}) {
  return render(
    <LocaleProvider initialLocale="en">
      <ShareDialog open url={URL} copied={false} onCopy={() => {}} onClose={() => {}} {...props} />
    </LocaleProvider>,
  );
}

describe("ShareDialog", () => {
  it("shows the share URL in a read-only field", () => {
    renderDialog();
    const input = screen.getByDisplayValue(URL) as HTMLInputElement;
    expect(input.readOnly).toBe(true);
  });

  it("shows a generating state while the URL is being flattened", () => {
    renderDialog({ url: null });
    expect(screen.queryByDisplayValue(URL)).toBeNull();
    expect(screen.getByText(/Generating link/)).toBeTruthy();
  });

  it("invokes onCopy when the Copy button is clicked", async () => {
    const user = userEvent.setup();
    const onCopy = vi.fn<() => void>();
    renderDialog({ onCopy });
    await user.click(screen.getByRole("button", { name: /Copy/ }));
    expect(onCopy).toHaveBeenCalledTimes(1);
  });

  it("reflects the real copied state from the parent", () => {
    renderDialog({ copied: true });
    expect(screen.getByRole("button", { name: /Copied to clipboard/ })).toBeTruthy();
  });

  it("renders nothing when closed", () => {
    renderDialog({ open: false });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
