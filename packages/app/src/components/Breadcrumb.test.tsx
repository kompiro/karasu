// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";

afterEach(cleanup);
import { Breadcrumb } from "./Breadcrumb.js";

const ITEMS = [
  { id: "sys", label: "System" },
  { id: "svc", label: "Service" },
  { id: "dom", label: "Domain" },
];

describe("Breadcrumb", () => {
  it("renders nothing when items is empty", () => {
    const { container } = render(<Breadcrumb items={[]} onNavigate={vi.fn<() => void>()} />);
    expect(container.firstChild).toBeNull();
  });

  it("clicking the first item calls onNavigate([])", () => {
    const onNavigate = vi.fn<() => void>();
    const { container } = render(<Breadcrumb items={ITEMS} onNavigate={onNavigate} />);
    const buttons = container.querySelectorAll<HTMLButtonElement>("button.breadcrumb-link");
    fireEvent.click(buttons[0]); // "System" — index 0
    expect(onNavigate).toHaveBeenCalledWith([]);
  });

  it("clicking a middle item calls onNavigate with the correct path", () => {
    const onNavigate = vi.fn<() => void>();
    const { container } = render(<Breadcrumb items={ITEMS} onNavigate={onNavigate} />);
    const buttons = container.querySelectorAll<HTMLButtonElement>("button.breadcrumb-link");
    fireEvent.click(buttons[1]); // "Service" — index 1
    expect(onNavigate).toHaveBeenCalledWith(["svc"]);
  });

  it("the last item is not a button and does not call onNavigate when clicked", () => {
    const onNavigate = vi.fn<() => void>();
    const { container } = render(<Breadcrumb items={ITEMS} onNavigate={onNavigate} />);
    // "Domain" is the last item — rendered as <span class="breadcrumb-current">
    const lastSpan = container.querySelector(".breadcrumb-current")!;
    expect(lastSpan.tagName).toBe("SPAN");
    fireEvent.click(lastSpan);
    expect(onNavigate).not.toHaveBeenCalled();
  });

  describe("navigatePath override (Phase 2 ViewPath)", () => {
    it("uses navigatePath when set, ignoring the slice-based computation", () => {
      const onNavigate = vi.fn<() => void>();
      const items = [
        { id: "ECPlatform", label: "ECPlatform", navigatePath: [] },
        { id: "ECommerce", label: "ECommerce", navigatePath: ["ECPlatform", "ECommerce"] },
        { id: "Order", label: "Order" }, // last item — not clickable
      ];
      const { container } = render(<Breadcrumb items={items} onNavigate={onNavigate} />);
      const buttons = container.querySelectorAll<HTMLButtonElement>("button.breadcrumb-link");

      // Clicking "ECPlatform" (index 0) uses its navigatePath: []
      fireEvent.click(buttons[0]);
      expect(onNavigate).toHaveBeenCalledWith([]);

      onNavigate.mockClear();

      // Clicking "ECommerce" (index 1) uses its navigatePath: ["ECPlatform", "ECommerce"]
      fireEvent.click(buttons[1]);
      expect(onNavigate).toHaveBeenCalledWith(["ECPlatform", "ECommerce"]);
    });

    it("falls back to slice-based computation when navigatePath is absent", () => {
      const onNavigate = vi.fn<() => void>();
      const items = [
        { id: "__org__", label: "Org" }, // no navigatePath — fallback: []
        { id: "TeamA", label: "TeamA" }, // no navigatePath — fallback: ["TeamA"]
        { id: "TeamB", label: "TeamB" }, // last item — not clickable
      ];
      const { container } = render(<Breadcrumb items={items} onNavigate={onNavigate} />);
      const buttons = container.querySelectorAll<HTMLButtonElement>("button.breadcrumb-link");

      fireEvent.click(buttons[0]);
      expect(onNavigate).toHaveBeenCalledWith([]);

      onNavigate.mockClear();

      fireEvent.click(buttons[1]);
      expect(onNavigate).toHaveBeenCalledWith(["TeamA"]);
    });
  });
});
