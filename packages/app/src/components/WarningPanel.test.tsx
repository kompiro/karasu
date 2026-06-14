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
    case "legend-ref-unresolved":
      return { kind, params: { target: "@deprecated", legendTitle: "Owner team" } };
    case "style-column-invalid-value":
      return { kind, params: { nodeId: "test-node", value: "wrong" } };
    case "style-column-ignored-non-system-view":
      return { kind, params: { nodeId: "test-node", viewType: "deploy" } };
    case "style-invalid-enum-value":
      return {
        kind,
        params: { property: "direction", value: "dwon", allowed: ["up", "down"] },
      };
    case "style-invalid-hex-color":
      return { kind, params: { property: "color", value: "#zzzz" } };
    case "style-missing-length-unit":
      return {
        kind,
        params: { property: "stroke-width", value: "1.5", allowedUnits: ["px"] },
      };
    case "style-invalid-length-unit":
      return {
        kind,
        params: { property: "stroke-width", value: "1.5em", unit: "em", allowedUnits: ["px"] },
      };
    case "style-out-of-range":
      return { kind, params: { property: "opacity", value: 1.5, min: 0, max: 1 } };
    case "style-unknown-property":
      return { kind, params: { property: "color2" } };
    case "client-capability-duplicate":
      return { kind, params: { clientId: "test-client", name: "camera" } };
    case "annotation-possible-typo":
      return {
        kind,
        params: { nodeId: "test-node", annotation: "depracated", suggestion: "deprecated" },
      };
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

  it("warning-severity kinds (style-conflict, invalid-owns) show the ⚠ icon (U+26A0)", () => {
    const { container, rerender } = render(
      <WarningPanel warnings={[makeWarning("style-conflict")]} />,
    );
    expect(container.querySelector(".warning-icon")?.textContent).toBe("\u26A0");

    rerender(<WarningPanel warnings={[makeWarning("invalid-owns")]} />);
    expect(container.querySelector(".warning-icon")?.textContent).toBe("\u26A0");
  });

  it("info-severity kinds (domain-dispersal, missing-runtime, missing-realizes) show the ℹ icon (U+2139)", () => {
    const { container, rerender } = render(
      <WarningPanel warnings={[makeWarning("domain-dispersal")]} />,
    );
    expect(container.querySelector(".warning-icon")?.textContent).toBe("\u2139");
    expect(container.querySelector(".warning-item")?.className).toContain("warning-item--info");

    rerender(<WarningPanel warnings={[makeWarning("missing-runtime")]} />);
    expect(container.querySelector(".warning-icon")?.textContent).toBe("\u2139");

    rerender(<WarningPanel warnings={[makeWarning("missing-realizes")]} />);
    expect(container.querySelector(".warning-icon")?.textContent).toBe("\u2139");
  });

  it("renders the formatted message (via compat bridge) without prefix when loc is absent", () => {
    const { container } = render(<WarningPanel warnings={[makeWarning("domain-dispersal")]} />);
    const item = container.querySelector(".warning-item")!;
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
    // domain-dispersal emits detail lines (the dispersed services + a cohesion note)
    const { container } = render(<WarningPanel warnings={[makeWarning("domain-dispersal")]} />);
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
    expect(item?.textContent).toContain("appears under multiple services");
    expect(item?.textContent).toContain(
      "DDD sometimes calls cross-service domain reuse a cohesion smell",
    );
  });

  it("renders domain-dispersal in Japanese when locale is 'ja'", () => {
    const { container } = render(
      <WarningPanel warnings={[makeWarning("domain-dispersal")]} />,
      "ja",
    );
    const item = container.querySelector(".warning-item");
    expect(item?.textContent).toContain("複数の service の配下に登場します");
    expect(item?.textContent).toContain(
      "DDD では同じドメインが複数 service にまたがる状態を凝集性のシグナルとみなすことがあります",
    );
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
