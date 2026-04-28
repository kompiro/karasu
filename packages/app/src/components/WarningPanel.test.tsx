// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render as rtlRender, fireEvent, cleanup } from "@testing-library/react";
import type { ReactElement } from "react";

afterEach(cleanup);
import { WarningPanel } from "./WarningPanel.js";
import { LocaleProvider } from "../i18n/index.js";
import type { Warning } from "@karasu-tools/core";

// WarningPanel now calls useFormattedWarning (Phase D.1), so tests wrap
// the render in LocaleProvider. Default to English; override per-test.
// Also wrap rerender so re-renders keep the provider in place.
function render(ui: ReactElement, initialLocale: "en" | "ja" = "en") {
  const wrap = (node: ReactElement) => (
    <LocaleProvider initialLocale={initialLocale}>{node}</LocaleProvider>
  );
  const result = rtlRender(wrap(ui));
  return {
    ...result,
    rerender: (next: ReactElement) => result.rerender(wrap(next)),
  };
}

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
    case "unresolved-realizes":
      return {
        kind,
        params: {
          deployNodeId: "test-node",
          deployBlockId: "test-deploy",
          target: "test-target",
        },
      };
    case "invalid-owns":
      return { kind, params: { teamId: "test-team", ownedId: "test-owned" } };
    case "deprecated-team-property":
      return { kind, params: { nodeId: "test-node", ownerTeamId: "test-team" } };
    case "unassigned-domain":
      return { kind, params: { domainId: "test-domain" } };
    case "unassigned-service":
      return { kind, params: { serviceId: "test-service" } };
    case "unassigned-client":
      return { kind, params: { clientId: "test-client" } };
    case "unresolved-handles":
      return {
        kind,
        params: { nodeKind: "client", nodeId: "test-client", domainId: "test-domain" },
      };
    case "unassigned-database":
      return { kind, params: { databaseId: "test-database" } };
    case "unassigned-queue":
      return { kind, params: { queueId: "test-queue" } };
    case "unassigned-storage":
      return { kind, params: { storageId: "test-storage" } };
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
    case "delivers-target-not-client":
      return { kind, params: { serviceId: "test-service", targetId: "test-target" } };
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
    // English translation capitalizes "Domain"; verify the Line-prefix path.
    expect(item.textContent).toContain('Line 12: Domain "payments"');
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

describe("WarningPanel — localization (Phase D.1)", () => {
  it("renders domain-dispersal in English when locale is 'en'", () => {
    const { container } = render(
      <WarningPanel warnings={[makeWarning("domain-dispersal")]} />,
      "en",
    );
    const item = container.querySelector(".warning-item");
    expect(item?.textContent).toContain("Domain");
    expect(item?.textContent).toContain("is dispersed");
    expect(item?.textContent).toContain("Review the domain's cohesion");
  });

  it("renders domain-dispersal in Japanese when locale is 'ja'", () => {
    const { container } = render(
      <WarningPanel warnings={[makeWarning("domain-dispersal")]} />,
      "ja",
    );
    const item = container.querySelector(".warning-item");
    expect(item?.textContent).toContain("複数の service に分散しています");
    expect(item?.textContent).toContain("ドメインの凝集性を確認してください");
  });

  it("renders missing-runtime in the active locale", () => {
    const { container: enContainer } = render(
      <WarningPanel warnings={[makeWarning("missing-runtime")]} />,
      "en",
    );
    expect(enContainer.textContent).toContain("has no runtime specified");

    const { container: jaContainer } = render(
      <WarningPanel warnings={[makeWarning("missing-runtime")]} />,
      "ja",
    );
    expect(jaContainer.textContent).toContain("runtime が指定されていません");
  });
});
