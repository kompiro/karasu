// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LocaleProvider } from "../../i18n/index.js";
import { TourPanel } from "./TourPanel.js";
import { SERVICE_SPLIT_TOUR } from "./tour-steps.js";

afterEach(cleanup);

function renderStep(index: number) {
  const handlers = { onBack: vi.fn(), onNext: vi.fn(), onClose: vi.fn() };
  render(
    <LocaleProvider initialLocale="en">
      <TourPanel
        step={SERVICE_SPLIT_TOUR[index]}
        index={index}
        total={SERVICE_SPLIT_TOUR.length}
        {...handlers}
      />
    </LocaleProvider>,
  );
  return handlers;
}

describe("TourPanel", () => {
  it("is a labelled region, not a dialog, so it never takes the page's focus", () => {
    renderStep(0);
    expect(screen.getByRole("region", { name: "Guided tour" })).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("shows where the visitor is: step count and progress", () => {
    renderStep(1);
    expect(screen.getByText("2 / 5")).toBeTruthy();
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("2");
    expect(
      screen.getByRole("heading", { name: "Discover organizational boundaries" }),
    ).toBeTruthy();
  });

  it("cannot go back from the first step, and can skip or go on", async () => {
    const user = userEvent.setup();
    const { onNext, onClose } = renderStep(0);
    expect((screen.getByRole("button", { name: "← Back" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    await user.click(screen.getByRole("button", { name: "Next →" }));
    expect(onNext).toHaveBeenCalledOnce();
    await user.click(screen.getByRole("button", { name: "✕ Skip tour" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("lists the questions for the team on the decision step", () => {
    renderStep(3);
    expect(screen.getAllByRole("listitem")).toHaveLength(4);
  });

  it("ends with Continue to editor instead of Next and Skip", async () => {
    const user = userEvent.setup();
    const { onBack, onNext, onClose } = renderStep(4);
    expect(screen.queryByRole("button", { name: "Next →" })).toBeNull();
    expect(screen.queryByRole("button", { name: "✕ Skip tour" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "← Back" }));
    expect(onBack).toHaveBeenCalledOnce();
    await user.click(screen.getByRole("button", { name: "✓ Continue to editor" }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(onNext).not.toHaveBeenCalled();
  });
});
