// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ShareDialog } from "./ShareDialog.js";
import { LocaleProvider } from "../i18n/index.js";

afterEach(cleanup);

const FRAGMENT = "https://karasu-nest.example/#s=abc123";
const UNFURL = "https://karasu-nest.example/s?s=abc123";

function renderDialog(props: Partial<Parameters<typeof ShareDialog>[0]> = {}) {
  return render(
    <LocaleProvider initialLocale="en">
      <ShareDialog
        open
        fragmentUrl={FRAGMENT}
        unfurlUrl={UNFURL}
        copiedUrl={null}
        canIncludeTarget={false}
        includeTarget={false}
        onIncludeTargetChange={() => {}}
        onCopy={() => {}}
        onClose={() => {}}
        {...props}
      />
    </LocaleProvider>,
  );
}

describe("ShareDialog", () => {
  it("shows both the private and the preview link in read-only fields", () => {
    renderDialog();
    const priv = screen.getByDisplayValue(FRAGMENT) as HTMLInputElement;
    const unfurl = screen.getByDisplayValue(UNFURL) as HTMLInputElement;
    expect(priv.readOnly).toBe(true);
    expect(unfurl.readOnly).toBe(true);
  });

  it("spells out the privacy trade-off for each link", () => {
    renderDialog();
    expect(screen.getByText(/Never sent to a server/)).toBeTruthy();
    expect(screen.getByText(/Unfurls with the diagram/)).toBeTruthy();
  });

  it("shows a generating state while the URL is being flattened", () => {
    renderDialog({ fragmentUrl: null });
    expect(screen.queryByDisplayValue(FRAGMENT)).toBeNull();
    expect(screen.getByText(/Generating link/)).toBeTruthy();
  });

  it("falls back to the private link only with an oversize warning", () => {
    renderDialog({ unfurlUrl: null });
    expect(screen.getByDisplayValue(FRAGMENT)).toBeTruthy();
    expect(screen.queryByDisplayValue(UNFURL)).toBeNull();
    expect(screen.getByText(/too large for a preview link/)).toBeTruthy();
  });

  it("invokes onCopy with the clicked link's URL", async () => {
    const user = userEvent.setup();
    const onCopy = vi.fn<(url: string) => void>();
    renderDialog({ onCopy });
    const buttons = screen.getAllByRole("button", { name: /Copy/ });
    await user.click(buttons[0]);
    expect(onCopy).toHaveBeenCalledWith(FRAGMENT);
  });

  it("shows the copied feedback only on the copied link", () => {
    renderDialog({ copiedUrl: UNFURL });
    // The preview link's button shows copied; the private one still says Copy.
    expect(screen.getByRole("button", { name: /Copied to clipboard/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /⧉ Copy/ })).toBeTruthy();
  });

  it("renders nothing when closed", () => {
    renderDialog({ open: false });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  // Deep permalink "link to current view" toggle (#1827).
  it("hides the deep-link checkbox when there is nothing to link to", () => {
    renderDialog({ canIncludeTarget: false });
    expect(screen.queryByRole("checkbox")).toBeNull();
  });

  it("shows the deep-link checkbox (reflecting includeTarget) when a target exists", () => {
    renderDialog({ canIncludeTarget: true, includeTarget: true });
    const checkbox = screen.getByRole("checkbox") as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
    expect(screen.getByText(/Link to the current view/)).toBeTruthy();
  });

  it("notifies on toggling the deep-link checkbox", async () => {
    const user = userEvent.setup();
    const onIncludeTargetChange = vi.fn<(next: boolean) => void>();
    renderDialog({ canIncludeTarget: true, includeTarget: true, onIncludeTargetChange });
    await user.click(screen.getByRole("checkbox"));
    expect(onIncludeTargetChange).toHaveBeenCalledWith(false);
  });
});
