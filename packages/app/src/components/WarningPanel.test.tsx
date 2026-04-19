// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";

afterEach(cleanup);
import { WarningPanel } from "./WarningPanel.js";
import type { Warning } from "@karasu-tools/core";

// Minimal well-formed Warning instances keyed by kind. The params shapes
// intentionally carry the minimum data formatWarning needs to produce a
// non-empty message string for the icon/layout tests below.
function makeWarning(kind: Warning["kind"]): Warning {
  switch (kind) {
    case "domain-dispersal":
      return {
        kind,
        params: { domainId: "test-domain", services: ["svc1", "svc2"] },
      };
    case "style-conflict":
      return { kind, params: { selector: "test-selector", sheetIndices: [0, 1] } };
    case "missing-runtime":
      return { kind, params: { nodeId: "test-node" } };
    case "missing-realizes":
      return { kind, params: { nodeId: "test-node" } };
    case "invalid-owns":
      return { kind, params: { teamId: "test-team", ownedId: "test-owned" } };
    case "deprecated-team-property":
      return { kind, params: { nodeId: "test-node", ownerTeamId: "test-team" } };
    case "unassigned-domain":
      return { kind, params: { domainId: "test-domain" } };
    case "unassigned-service":
      return { kind, params: { serviceId: "test-service" } };
    case "unassigned-usecase":
      return { kind, params: { usecaseId: "test-usecase" } };
    case "cross-system-ref-implicit-external":
      return {
        kind,
        params: {
          ref: "A.B",
          sourceSystemId: "src-sys",
          sourceNodeId: "src-node",
          targetSystemId: "tgt-sys",
        },
      };
    case "cross-system-ref-unresolved":
      return { kind, params: { ref: "A.B" } };
    case "cyclic-dependency":
      return { kind, params: { cyclePath: ["A", "B", "A"] } };
  }
}

describe("WarningPanel", () => {
  it("renders nothing when warnings list is empty", () => {
    const { container } = render(<WarningPanel warnings={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("clicking the header collapses the warning list", () => {
    const { container } = render(<WarningPanel warnings={[makeWarning("domain-dispersal")]} />);
    const header = container.querySelector(".warning-panel-header")!;
    expect(container.querySelector(".warning-list")).not.toBeNull();
    fireEvent.click(header);
    expect(container.querySelector(".warning-list")).toBeNull();
  });

  it("clicking the header again expands the warning list", () => {
    const { container } = render(<WarningPanel warnings={[makeWarning("domain-dispersal")]} />);
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
    const { container } = render(<WarningPanel warnings={[makeWarning("invalid-owns")]} />);
    expect(container.querySelector(".warning-icon")?.textContent).toBe("\u26A0");
  });

  it("renders the formatted message (via compat bridge) without prefix when loc is absent", () => {
    const { container } = render(<WarningPanel warnings={[makeWarning("domain-dispersal")]} />);
    const item = container.querySelector(".warning-item")!;
    // The formatWarning compat bridge renders "domain \"<id>\" が複数の service に分散しています"
    expect(item.textContent).toContain("test-domain");
    expect(item.textContent).not.toContain("Line");
  });

  it("prefixes the formatted message with 'Line N:' when loc is present", () => {
    const warning: Warning = {
      kind: "domain-dispersal",
      params: { domainId: "payments", services: ["svc1", "svc2"] },
      loc: {
        start: { line: 12, column: 1, offset: 0 },
        end: { line: 12, column: 20, offset: 19 },
      },
    };
    const { container } = render(<WarningPanel warnings={[warning]} />);
    const item = container.querySelector(".warning-item")!;
    expect(item.textContent).toContain('Line 12: domain "payments"');
  });

  it("renders details from the compat bridge when the warning kind has them", () => {
    // deprecated-team-property emits 2 detail lines via formatWarning
    const { container } = render(
      <WarningPanel warnings={[makeWarning("deprecated-team-property")]} />,
    );
    const details = container.querySelectorAll(".warning-details > div");
    expect(details.length).toBeGreaterThan(0);
  });
});
