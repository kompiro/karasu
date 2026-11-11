// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LocaleProvider } from "../../i18n/index.js";
import { TourPanel } from "./TourPanel.js";
import { TOURS, type TourId } from "./tour-steps.js";
import { FEEDBACK_DISCUSSION_URL } from "../../utils/feedback-discussions.js";

const { steps } = TOURS["service-split"];

afterEach(cleanup);

function renderStep(index: number) {
  const handlers = {
    onBack: vi.fn<() => void>(),
    onNext: vi.fn<() => void>(),
    onClose: vi.fn<() => void>(),
  };
  render(
    <LocaleProvider initialLocale="en">
      <TourPanel
        heading="Design a service split"
        step={steps[index]}
        index={index}
        total={steps.length}
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
    expect(screen.getByText("Design a service split")).toBeTruthy();
    expect(screen.getByText("2 / 5")).toBeTruthy();
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("2");
    expect(
      screen.getByRole("heading", { name: "Discover organizational boundaries" }),
    ).toBeTruthy();
  });

  it("cannot go back from the first step, and can skip or go on", async () => {
    const user = userEvent.setup();
    const { onBack, onNext, onClose } = renderStep(0);
    const back = screen.getByRole("button", { name: "← Back" });
    expect(back.getAttribute("aria-disabled")).toBe("true");
    await user.click(back);
    expect(onBack).not.toHaveBeenCalled();
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

  it("asks for feedback on the last step only (#3689)", () => {
    renderStep(steps.length - 2);
    expect(screen.queryByRole("link", { name: /Tell us what you thought/ })).toBeNull();
  });

  it("ends every guide with a link to the Feedback discussions, in a new tab (#3689)", () => {
    for (const id of Object.keys(TOURS) as TourId[]) {
      const tour = TOURS[id];
      const last = tour.steps.length - 1;
      const { unmount } = render(
        <LocaleProvider initialLocale="en">
          <TourPanel
            heading={id}
            step={tour.steps[last]}
            index={last}
            total={tour.steps.length}
            onBack={() => {}}
            onNext={() => {}}
            onClose={() => {}}
          />
        </LocaleProvider>,
      );
      const link = screen.getByRole("link", { name: "Tell us what you thought ↗" });
      expect(link.getAttribute("href")).toBe(FEEDBACK_DISCUSSION_URL);
      expect(link.getAttribute("target")).toBe("_blank");
      expect(link.getAttribute("rel")).toBe("noopener noreferrer");
      unmount();
    }
  });
});
