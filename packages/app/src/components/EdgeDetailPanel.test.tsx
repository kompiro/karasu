// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render as rtlRender, cleanup } from "@testing-library/react";
import type { ReactElement } from "react";
import type { DomainEdgeDetail } from "@karasu-tools/core";
import { EdgeDetailPanel } from "./EdgeDetailPanel.js";
import { LocaleProvider } from "../i18n/index.js";

// The panel reads its section titles from the catalog (docs/spec/i18n.md), so
// it needs the provider the app always mounts above it.
function render(ui: ReactElement, initialLocale: "en" | "ja" = "en") {
  return rtlRender(<LocaleProvider initialLocale={initialLocale}>{ui}</LocaleProvider>);
}

afterEach(cleanup);

describe("EdgeDetailPanel", () => {
  it("renders constituent rows without markers when diffState is absent", () => {
    const details: DomainEdgeDetail[] = [
      {
        fromDomainId: "A",
        fromDomainLabel: "A",
        toDomainId: "X",
        toDomainLabel: "X",
      },
    ];
    const { container } = render(
      <EdgeDetailPanel domainEdges={details} anchorX={0} anchorY={0} onClose={() => {}} />,
    );
    expect(container.querySelector(".edge-detail-marker")).toBeNull();
    expect(container.querySelector(".edge-detail-item--added")).toBeNull();
  });

  it("renders + / - / space markers and state classes when diffState is set", () => {
    const details: DomainEdgeDetail[] = [
      {
        fromDomainId: "A",
        fromDomainLabel: "A",
        toDomainId: "X",
        toDomainLabel: "X",
        diffState: "unchanged",
      },
      {
        fromDomainId: "B",
        fromDomainLabel: "B",
        toDomainId: "X",
        toDomainLabel: "X",
        diffState: "added",
      },
      {
        fromDomainId: "C",
        fromDomainLabel: "C",
        toDomainId: "X",
        toDomainLabel: "X",
        diffState: "removed",
      },
    ];
    const { container } = render(
      <EdgeDetailPanel domainEdges={details} anchorX={0} anchorY={0} onClose={() => {}} />,
    );
    const items = container.querySelectorAll(".edge-detail-item");
    expect(items).toHaveLength(3);
    expect(items[0].classList.contains("edge-detail-item--unchanged")).toBe(true);
    expect(items[1].classList.contains("edge-detail-item--added")).toBe(true);
    expect(items[2].classList.contains("edge-detail-item--removed")).toBe(true);

    const markers = container.querySelectorAll(".edge-detail-marker");
    expect(markers).toHaveLength(3);
    expect(markers[0].textContent).toBe(" ");
    expect(markers[1].textContent).toBe("+");
    expect(markers[2].textContent).toBe("-");
  });

  // The single-edge form, from the edge property block (#2543).
  describe("single edge (#2543)", () => {
    it("renders the route, the label and the prose", () => {
      const { container, getByText } = render(
        <EdgeDetailPanel
          edge={{
            from: "OrderSvc",
            to: "PaymentSvc",
            kind: "async",
            label: "places an order",
            description: "At-least-once.",
            links: [],
          }}
          anchorX={0}
          anchorY={0}
          onClose={() => {}}
        />,
      );
      expect(getByText("OrderSvc ⇢ PaymentSvc")).toBeTruthy();
      expect(getByText("places an order")).toBeTruthy();
      expect(container.querySelector(".node-detail-description")?.textContent).toContain(
        "At-least-once.",
      );
      // No aggregated list in this form.
      expect(container.querySelector(".edge-detail-list")).toBeNull();
    });

    it("omits the sections the edge does not carry", () => {
      const { container } = render(
        <EdgeDetailPanel
          edge={{ from: "A", to: "B", kind: "sync", links: [] }}
          anchorX={0}
          anchorY={0}
          onClose={() => {}}
        />,
      );
      expect(container.querySelector(".node-detail-description")).toBeNull();
      expect(container.querySelector(".node-detail-links")).toBeNull();
    });

    it("renders only links whose scheme is allowed", () => {
      const { container } = render(
        <EdgeDetailPanel
          edge={{
            from: "A",
            to: "B",
            kind: "sync",
            links: [
              { url: "https://runbook.example.com/x", label: "Runbook" },
              { url: "javascript:alert(1)", label: "Nope" },
            ],
          }}
          anchorX={0}
          anchorY={0}
          onClose={() => {}}
        />,
      );
      const anchors = container.querySelectorAll(".node-detail-links a");
      expect(anchors).toHaveLength(1);
      expect(anchors[0].getAttribute("href")).toBe("https://runbook.example.com/x");
    });

    it("localizes its section titles", () => {
      const { getByText } = render(
        <EdgeDetailPanel
          edge={{ from: "A", to: "B", kind: "sync", label: "calls", links: [] }}
          anchorX={0}
          anchorY={0}
          onClose={() => {}}
        />,
        "ja",
      );
      expect(getByText("🏷 ラベル")).toBeTruthy();
    });
  });
});
