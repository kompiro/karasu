// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, fireEvent, cleanup, act } from "@testing-library/react";
import { ReferencePanel } from "./ReferencePanel.js";

afterEach(cleanup);

const defaultProps = { isOpen: true, onClose: vi.fn() };

beforeEach(() => {
  // Reset onClose mock between tests
  defaultProps.onClose = vi.fn();
});

describe("ReferencePanel", () => {
  it("renders nothing when isOpen is false", () => {
    const { container } = render(<ReferencePanel isOpen={false} onClose={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it("clicking a tab shows that tab's content", () => {
    const { container } = render(<ReferencePanel {...defaultProps} />);
    // Default tab is "Syntax" — switch to "Styles"
    const stylesTab = Array.from(container.querySelectorAll(".reference-panel-tab")).find(
      (el) => el.textContent === "Styles",
    )!;
    fireEvent.click(stylesTab);
    // Styles tab renders a "Style Properties" heading
    expect(container.querySelector(".reference-tab-body")?.textContent).toContain(
      "Style Properties",
    );
    // Syntax-only content is gone
    expect(container.querySelector(".reference-tab-body")?.textContent).not.toContain("Node Kinds");
  });

  it("clicking the overlay calls onClose", () => {
    const { container } = render(<ReferencePanel {...defaultProps} />);
    fireEvent.click(container.querySelector(".reference-panel-overlay")!);
    expect(defaultProps.onClose).toHaveBeenCalledOnce();
  });

  it("clicking inside the panel does not call onClose", () => {
    const { container } = render(<ReferencePanel {...defaultProps} />);
    fireEvent.click(container.querySelector(".reference-panel")!);
    expect(defaultProps.onClose).not.toHaveBeenCalled();
  });

  it("Syntax tab shows system node kinds by default", () => {
    const { container } = render(<ReferencePanel {...defaultProps} />);
    const body = container.querySelector(".reference-tab-body")?.textContent ?? "";
    expect(body).toContain("system");
    expect(body).toContain("service");
  });

  it("Syntax tab shows deploy unit kinds when activeView=deploy", () => {
    const { container } = render(<ReferencePanel {...defaultProps} activeView="deploy" />);
    const body = container.querySelector(".reference-tab-body")?.textContent ?? "";
    expect(body).toContain("oci");
    expect(body).toContain("jar");
    expect(body).toContain("lambda");
  });

  it("Syntax tab shows org kinds when activeView=org", () => {
    const { container } = render(<ReferencePanel {...defaultProps} activeView="org" />);
    const body = container.querySelector(".reference-tab-body")?.textContent ?? "";
    expect(body).toContain("organization");
    expect(body).toContain("team");
    expect(body).toContain("member");
  });

  it("Tags tab shows tags list for system view", () => {
    const { container } = render(<ReferencePanel {...defaultProps} />);
    const tagsTab = Array.from(container.querySelectorAll(".reference-panel-tab")).find(
      (el) => el.textContent === "Tags & Annotations",
    )!;
    fireEvent.click(tagsTab);
    const body = container.querySelector(".reference-tab-body")?.textContent ?? "";
    expect(body).toContain("external");
    expect(body).toContain("deprecated");
  });

  it("Tags tab shows unsupported message for deploy view", () => {
    const { container } = render(<ReferencePanel {...defaultProps} activeView="deploy" />);
    const tagsTab = Array.from(container.querySelectorAll(".reference-panel-tab")).find(
      (el) => el.textContent === "Tags & Annotations",
    )!;
    fireEvent.click(tagsTab);
    expect(container.querySelector(".reference-unsupported")).toBeTruthy();
  });

  it("Tags tab shows unsupported message for org view", () => {
    const { container } = render(<ReferencePanel {...defaultProps} activeView="org" />);
    const tagsTab = Array.from(container.querySelectorAll(".reference-panel-tab")).find(
      (el) => el.textContent === "Tags & Annotations",
    )!;
    fireEvent.click(tagsTab);
    expect(container.querySelector(".reference-unsupported")).toBeTruthy();
  });

  it("Styles tab shows deploy selector examples when activeView=deploy", () => {
    const { container } = render(<ReferencePanel {...defaultProps} activeView="deploy" />);
    const stylesTab = Array.from(container.querySelectorAll(".reference-panel-tab")).find(
      (el) => el.textContent === "Styles",
    )!;
    fireEvent.click(stylesTab);
    const body = container.querySelector(".reference-tab-body")?.textContent ?? "";
    expect(body).toContain("deploy diagram selectors");
  });

  it("Styles tab shows org selector examples when activeView=org", () => {
    const { container } = render(<ReferencePanel {...defaultProps} activeView="org" />);
    const stylesTab = Array.from(container.querySelectorAll(".reference-panel-tab")).find(
      (el) => el.textContent === "Styles",
    )!;
    fireEvent.click(stylesTab);
    const body = container.querySelector(".reference-tab-body")?.textContent ?? "";
    expect(body).toContain("org diagram selectors");
  });

  it("Built-in Theme tab notes it applies to all diagram types", () => {
    const { container } = render(<ReferencePanel {...defaultProps} activeView="deploy" />);
    const builtinTab = Array.from(container.querySelectorAll(".reference-panel-tab")).find(
      (el) => el.textContent === "Built-in Theme",
    )!;
    fireEvent.click(builtinTab);
    const body = container.querySelector(".reference-tab-body")?.textContent ?? "";
    expect(body).toContain("すべての図種別");
  });

  it("Samples tab shows system+deploy+org content", () => {
    const { container } = render(<ReferencePanel {...defaultProps} />);
    const samplesTab = Array.from(container.querySelectorAll(".reference-panel-tab")).find(
      (el) => el.textContent === "Samples",
    )!;
    expect(samplesTab).toBeTruthy();
    fireEvent.click(samplesTab);
    const body = container.querySelector(".reference-tab-body")?.textContent ?? "";
    expect(body).toContain("system");
    expect(body).toContain("deploy");
    expect(body).toContain("organization");
  });

  it("Copy button shows 'Copied!' after click and reverts after 2 seconds", async () => {
    vi.useFakeTimers();
    // Mock clipboard API
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      writable: true,
      configurable: true,
    });

    const { container } = render(<ReferencePanel {...defaultProps} />);

    // Switch to "Built-in Theme" tab which has the Copy button
    const builtinTab = Array.from(container.querySelectorAll(".reference-panel-tab")).find(
      (el) => el.textContent === "Built-in Theme",
    )!;
    fireEvent.click(builtinTab);

    const copyBtn = container.querySelector(".reference-copy-btn")!;
    expect(copyBtn.textContent).toBe("Copy");

    fireEvent.click(copyBtn);
    // Flush the resolved clipboard promise
    await act(async () => {});
    expect(copyBtn.textContent).toBe("Copied!");

    act(() => vi.advanceTimersByTime(2000));
    expect(copyBtn.textContent).toBe("Copy");

    vi.useRealTimers();
  });
});
