// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";
import { PreviewPane } from "./PreviewPane.js";
import type { NodeMetadata } from "@karasu-tools/core";

afterEach(cleanup);

// jsdom does not implement CSS.escape
beforeAll(() => {
  if (!globalThis.CSS) (globalThis as unknown as Record<string, unknown>).CSS = {};
  if (!CSS.escape) {
    CSS.escape = (value: string) => value.replace(/[^\w-]/g, (ch) => `\\${ch}`);
  }
});

function baseProps() {
  return {
    svg: "",
    diagnostics: [],
    nodeMetadata: new Map(),
  };
}

/**
 * Simulate a click: mouseDown on the container sets isDraggingRef.current=true (via the
 * component's handleMouseDown). After mouseDown, React re-renders (isDragging state changes),
 * which re-sets dangerouslySetInnerHTML children — so the target element must be re-queried
 * from the DOM AFTER mouseDown. We accept a function `getTarget` for lazy re-querying.
 * Both events use the same coordinates (dx=dy=0 < CLICK_THRESHOLD=3).
 */
function click(container: HTMLElement, getTarget: () => Element) {
  fireEvent.mouseDown(container, { button: 0, clientX: 10, clientY: 10 });
  fireEvent.mouseUp(getTarget(), { button: 0, clientX: 10, clientY: 10 });
}

/**
 * In jsdom, mouse events dispatched on SVG elements do not bubble to HTML parent
 * elements. To keep click-handler tests simple and reliable, the `svg` prop in these
 * tests uses HTML <div> elements (with the same data-* attributes the component logic
 * reads) instead of actual SVG markup. The component injects the prop value via
 * dangerouslySetInnerHTML — any HTML is valid.
 */
describe("PreviewPane", () => {
  describe("onClearHighlight", () => {
    it("calls onDrillDown and onClearHighlight when a node with children is clicked", () => {
      const onClearHighlight = vi.fn<() => void>();
      const onDrillDown = vi.fn<() => void>();
      const svg = `<div data-node-id="svc" data-has-children="true"></div>`;

      const { container } = render(
        <PreviewPane
          {...baseProps()}
          svg={svg}
          viewPath={[]}
          onDrillDown={onDrillDown}
          onClearHighlight={onClearHighlight}
        />,
      );

      const previewContainer = container.querySelector(".preview-container")!;
      click(
        previewContainer as HTMLElement,
        () => container.querySelector("[data-node-id='svc']")!,
      );

      expect(onClearHighlight).toHaveBeenCalledOnce();
      expect(onDrillDown).toHaveBeenCalledWith(["svc"]);
    });

    it("calls onClearHighlight when a leaf node is clicked", () => {
      const onClearHighlight = vi.fn<() => void>();
      const svg = `<div data-node-id="leaf" data-has-children="false"></div>`;

      const { container } = render(
        <PreviewPane {...baseProps()} svg={svg} onClearHighlight={onClearHighlight} />,
      );

      const previewContainer = container.querySelector(".preview-container")!;
      click(
        previewContainer as HTMLElement,
        () => container.querySelector("[data-node-id='leaf']")!,
      );

      expect(onClearHighlight).toHaveBeenCalledOnce();
    });

    it("does not call onClearHighlight when a deploy container is clicked", () => {
      const onClearHighlight = vi.fn<() => void>();
      const onContainerClick = vi.fn<() => void>();
      const svg = `<div data-container-id="zone-a"></div>`;

      const { container } = render(
        <PreviewPane
          {...baseProps()}
          svg={svg}
          onContainerClick={onContainerClick}
          onClearHighlight={onClearHighlight}
        />,
      );

      const previewContainer = container.querySelector(".preview-container")!;
      click(
        previewContainer as HTMLElement,
        () => container.querySelector("[data-container-id='zone-a']")!,
      );

      expect(onContainerClick).toHaveBeenCalledWith("zone-a");
      expect(onClearHighlight).not.toHaveBeenCalled();
    });
  });

  describe("highlightedNodeId", () => {
    it("applies .karasu-highlighted class to the matching element", () => {
      const svg = `<div data-node-id="svc"></div>`;

      const { container } = render(
        <PreviewPane {...baseProps()} svg={svg} highlightedNodeId="svc" />,
      );

      const node = container.querySelector("[data-node-id='svc']");
      expect(node?.classList.contains("karasu-highlighted")).toBe(true);
    });

    it("removes .karasu-highlighted when highlightedNodeId becomes null", () => {
      const svg = `<div data-node-id="svc"></div>`;

      const { container, rerender } = render(
        <PreviewPane {...baseProps()} svg={svg} highlightedNodeId="svc" />,
      );

      rerender(<PreviewPane {...baseProps()} svg={svg} highlightedNodeId={null} />);

      const node = container.querySelector("[data-node-id='svc']");
      expect(node?.classList.contains("karasu-highlighted")).toBe(false);
    });
  });

  describe("onJumpToEditor", () => {
    it("calls onJumpToEditor with the clicked node's id when 'Jump to editor' is clicked", () => {
      const onJumpToEditor = vi.fn<() => void>();
      const svg = `<div data-node-id="leaf-svc" data-has-children="false"></div>`;
      const metadata: NodeMetadata = {
        kind: "service",
        label: "Leaf Service",
        description: "",
        links: [],
        tags: [],
        annotations: [],
        hasChildren: false,
      };
      const nodeMetadata = new Map([["leaf-svc", metadata]]);

      const { container, getByText } = render(
        <PreviewPane
          {...baseProps()}
          svg={svg}
          nodeMetadata={nodeMetadata}
          onJumpToEditor={onJumpToEditor}
        />,
      );

      const previewContainer = container.querySelector(".preview-container")!;
      // Click the leaf node to open the detail panel
      click(
        previewContainer as HTMLElement,
        () => container.querySelector("[data-node-id='leaf-svc']")!,
      );

      // Click "Jump to editor" in the detail panel
      fireEvent.click(getByText(/Jump to editor/));

      expect(onJumpToEditor).toHaveBeenCalledWith("leaf-svc");
    });
  });

  describe("edge detail panel", () => {
    it("opens EdgeDetailPanel when a [data-domain-edges] element is clicked", () => {
      const edges = [
        {
          fromDomainId: "OrderDomain",
          fromDomainLabel: "Order Domain",
          toDomainId: "PaymentDomain",
          toDomainLabel: "Payment Domain",
          label: "decides payment",
        },
        {
          fromDomainId: "InvoiceDomain",
          fromDomainLabel: "Invoice Domain",
          toDomainId: "LedgerDomain",
          toDomainLabel: "Ledger Domain",
          label: "posts invoice",
        },
      ];
      const svg = `<div data-domain-edges='${JSON.stringify(edges)}'></div>`;

      const { container, getByText } = render(<PreviewPane {...baseProps()} svg={svg} />);

      const previewContainer = container.querySelector(".preview-container")!;
      click(previewContainer as HTMLElement, () => container.querySelector("[data-domain-edges]")!);

      // Panel header shows the count
      expect(getByText("2 domain edges")).toBeTruthy();
      // Panel lists the constituent edges
      expect(getByText("Order Domain → Payment Domain")).toBeTruthy();
      expect(getByText('"decides payment"')).toBeTruthy();
    });

    it("closes EdgeDetailPanel when the × button is clicked", () => {
      const edges = [
        {
          fromDomainId: "A",
          fromDomainLabel: "Domain A",
          toDomainId: "B",
          toDomainLabel: "Domain B",
          label: "calls",
        },
        {
          fromDomainId: "C",
          fromDomainLabel: "Domain C",
          toDomainId: "D",
          toDomainLabel: "Domain D",
        },
      ];
      const svg = `<div data-domain-edges='${JSON.stringify(edges)}'></div>`;

      const { container, getByText, queryByText } = render(
        <PreviewPane {...baseProps()} svg={svg} />,
      );

      const previewContainer = container.querySelector(".preview-container")!;
      click(previewContainer as HTMLElement, () => container.querySelector("[data-domain-edges]")!);
      expect(getByText("2 domain edges")).toBeTruthy();

      // Click the close button
      const closeBtn = container.querySelector(".node-detail-close")!;
      fireEvent.click(closeBtn);
      expect(queryByText("2 domain edges")).toBeNull();
    });

    it("closes EdgeDetailPanel when clicking outside any node", () => {
      const edges = [
        { fromDomainId: "A", fromDomainLabel: "A", toDomainId: "B", toDomainLabel: "B" },
        { fromDomainId: "C", fromDomainLabel: "C", toDomainId: "D", toDomainLabel: "D" },
      ];
      const svg = `<div data-domain-edges='${JSON.stringify(edges)}'></div>`;

      const { container, queryByText } = render(<PreviewPane {...baseProps()} svg={svg} />);

      const previewContainer = container.querySelector(".preview-container")!;
      // Open panel
      click(previewContainer as HTMLElement, () => container.querySelector("[data-domain-edges]")!);

      // Click on the container itself (no node or domain-edges target)
      click(previewContainer as HTMLElement, () => previewContainer);
      expect(queryByText("2 domain edges")).toBeNull();
    });
  });

  describe("error state overlay", () => {
    it("shows overlay and has-errors class when errors are present and svg is non-empty", () => {
      const { container } = render(
        <PreviewPane
          {...baseProps()}
          svg="<svg><text>stale diagram</text></svg>"
          diagnostics={[{ severity: "error", code: "generic-text", params: { text: "Syntax error" } }]}
        />,
      );

      expect(container.querySelector(".preview-pane--has-errors")).not.toBeNull();
      expect(container.querySelector(".error-state-overlay")).not.toBeNull();
      expect(container.querySelector(".error-state-badge")).not.toBeNull();
    });

    it("does not show overlay when errors are present but svg is empty", () => {
      const { container } = render(
        <PreviewPane
          {...baseProps()}
          svg=""
          diagnostics={[{ severity: "error", code: "generic-text", params: { text: "Syntax error" } }]}
        />,
      );

      expect(container.querySelector(".preview-pane--has-errors")).not.toBeNull();
      expect(container.querySelector(".error-state-overlay")).toBeNull();
    });

    it("does not show overlay when no errors are present", () => {
      const { container } = render(
        <PreviewPane
          {...baseProps()}
          svg="<svg><text>valid diagram</text></svg>"
          diagnostics={[{ severity: "warning", code: "generic-text", params: { text: "Some warning" } }]}
        />,
      );

      expect(container.querySelector(".preview-pane--has-errors")).toBeNull();
      expect(container.querySelector(".error-state-overlay")).toBeNull();
    });
  });
});
