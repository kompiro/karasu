// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";

afterEach(cleanup);
import { WarningPanel } from "./WarningPanel.js";
import type { Warning } from "@karasu/core";

function makeWarning(kind: Warning["kind"], message = "test warning"): Warning {
  return { kind, message, details: [] };
}

describe("WarningPanel", () => {
  it("renders nothing when warnings list is empty", () => {
    const { container } = render(<WarningPanel warnings={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("clicking the header collapses the warning list", () => {
    const { container } = render(
      <WarningPanel warnings={[makeWarning("domain-dispersal", "msg")]} />,
    );
    const header = container.querySelector(".warning-panel-header")!;
    expect(container.querySelector(".warning-list")).not.toBeNull();
    fireEvent.click(header);
    expect(container.querySelector(".warning-list")).toBeNull();
  });

  it("clicking the header again expands the warning list", () => {
    const { container } = render(
      <WarningPanel warnings={[makeWarning("domain-dispersal", "msg")]} />,
    );
    const header = container.querySelector(".warning-panel-header")!;
    fireEvent.click(header);
    fireEvent.click(header);
    expect(container.querySelector(".warning-list")).not.toBeNull();
  });

  it("domain-dispersal and style-conflict show the ⚠ icon (U+26A0)", () => {
    const { container, rerender } = render(
      <WarningPanel warnings={[makeWarning("domain-dispersal")]} />,
    );
    expect(container.querySelector(".warning-icon")?.textContent).toBe("\u26A0");

    rerender(<WarningPanel warnings={[makeWarning("style-conflict")]} />);
    expect(container.querySelector(".warning-icon")?.textContent).toBe("\u26A0");
  });

  it("missing-runtime and missing-realizes show the ℹ icon (U+2139)", () => {
    const { container, rerender } = render(
      <WarningPanel warnings={[makeWarning("missing-runtime")]} />,
    );
    expect(container.querySelector(".warning-icon")?.textContent).toBe("\u2139");

    rerender(<WarningPanel warnings={[makeWarning("missing-realizes")]} />);
    expect(container.querySelector(".warning-icon")?.textContent).toBe("\u2139");
  });

  it("an unknown kind falls back to the ⚠ icon", () => {
    const warning: Warning = { kind: "invalid-owns", message: "test", details: [] };
    const { container } = render(<WarningPanel warnings={[warning]} />);
    expect(container.querySelector(".warning-icon")?.textContent).toBe("\u26A0");
  });
});
