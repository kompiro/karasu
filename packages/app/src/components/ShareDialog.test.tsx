// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ShareDialog } from "./ShareDialog.js";
import { LocaleProvider } from "../i18n/index.js";

afterEach(cleanup);

const URL = "https://karasu-nest.example/#s=abc123";

function renderDialog(props: Partial<Parameters<typeof ShareDialog>[0]> = {}) {
  return render(
    <LocaleProvider initialLocale="en">
      <ShareDialog open url={URL} onClose={() => {}} {...props} />
    </LocaleProvider>,
  );
}

describe("ShareDialog", () => {
  it("shows the share URL in a read-only field", () => {
    renderDialog();
    const input = screen.getByDisplayValue(URL) as HTMLInputElement;
    expect(input.readOnly).toBe(true);
  });

  it("re-copies the URL and shows confirmation when Copy is clicked", async () => {
    // userEvent.setup() owns navigator.clipboard; read back via its stub.
    const user = userEvent.setup();
    renderDialog({ copiedOnOpen: false });

    await user.click(screen.getByRole("button", { name: /Copy/ }));

    expect(await navigator.clipboard.readText()).toBe(URL);
    expect(await screen.findByText(/Copied to clipboard/)).toBeTruthy();
  });

  it("renders nothing when closed", () => {
    renderDialog({ open: false });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
