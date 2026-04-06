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
});
