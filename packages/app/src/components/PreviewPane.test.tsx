// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import { render as rtlRender, fireEvent, cleanup, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { PreviewPane } from "./PreviewPane.js";
import { LocaleProvider } from "../i18n/index.js";
import type { NodeMetadata } from "@karasu-tools/core";

afterEach(cleanup);

// PreviewPane's NodeDetailPanel sub-component calls useTranslation, so wrap.
// Also wrap rerender so re-renders keep the provider.
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
          diagnostics={[
            { severity: "error", code: "generic-text", params: { text: "Syntax error" } },
          ]}
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
          diagnostics={[
            { severity: "error", code: "generic-text", params: { text: "Syntax error" } },
          ]}
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
          diagnostics={[
            { severity: "warning", code: "generic-text", params: { text: "Some warning" } },
          ]}
        />,
      );

      expect(container.querySelector(".preview-pane--has-errors")).toBeNull();
      expect(container.querySelector(".error-state-overlay")).toBeNull();
    });
  });

  describe("diagnostic banner localization (Phase D.2)", () => {
    it("renders file-not-found in English when locale is 'en'", () => {
      const { container } = render(
        <PreviewPane
          {...baseProps()}
          diagnostics={[
            {
              severity: "error",
              code: "file-not-found",
              params: { filePath: "./missing.krs" },
            },
          ]}
        />,
        "en",
      );
      const banner = container.querySelector(".diagnostic-banner");
      expect(banner?.textContent).toContain("File not found: ./missing.krs");
    });

    it("renders file-not-found in Japanese when locale is 'ja'", () => {
      const { container } = render(
        <PreviewPane
          {...baseProps()}
          diagnostics={[
            {
              severity: "error",
              code: "file-not-found",
              params: { filePath: "./missing.krs" },
            },
          ]}
        />,
        "ja",
      );
      const banner = container.querySelector(".diagnostic-banner");
      expect(banner?.textContent).toContain("ファイルが見つかりません: ./missing.krs");
    });

    it("renders generic-text verbatim regardless of locale", () => {
      const { container } = render(
        <PreviewPane
          {...baseProps()}
          diagnostics={[{ severity: "error", code: "generic-text", params: { text: "boom" } }]}
        />,
        "ja",
      );
      const banner = container.querySelector(".diagnostic-banner");
      expect(banner?.textContent).toContain("boom");
    });
  });

  describe("edge context menu", () => {
    // shadcn migration (#1368, #1400): EdgeContextMenu is a Radix DropdownMenu
    // and its content renders through a portal attached to `document.body`, so
    // menu DOM is NOT inside `container`. Query the menu from document scope.
    // Direction items are `DropdownMenuItem`s — `div[role="menuitem"]`, not
    // `<button>`.
    const queryMenu = () => document.querySelector(".edge-context-menu");
    const queryItems = () =>
      document.querySelectorAll<HTMLElement>(
        '.edge-context-menu [role="menuitem"].context-menu-item',
      );
    const queryTarget = () => document.querySelector(".context-menu-header__target");

    it("opens the menu on right-click of an edge group with a canonical id", () => {
      const svg = `<div data-edge-from="A" data-edge-to="B" data-edge-kind="sync" data-edge-canonical-id="A->B"></div>`;
      const { container } = render(
        <PreviewPane {...baseProps()} svg={svg} styleTargetPath="/style.krs.style" />,
      );
      const edge = container.querySelector("[data-edge-canonical-id]")!;
      fireEvent.contextMenu(edge, { clientX: 50, clientY: 60 });
      const menu = queryMenu();
      expect(menu).not.toBeNull();
      expect(menu!.textContent).toContain("A->B");
    });

    it("shows the edge's authored label when data-edge-label is present", () => {
      const svg = `<div data-edge-from="A" data-edge-to="B" data-edge-kind="sync" data-edge-canonical-id="A->B" data-edge-label="Process payment"></div>`;
      const { container } = render(
        <PreviewPane {...baseProps()} svg={svg} styleTargetPath="/style.krs.style" />,
      );
      const edge = container.querySelector("[data-edge-canonical-id]")!;
      fireEvent.contextMenu(edge, { clientX: 50, clientY: 60 });
      const label = document.querySelector(".context-menu-header__label");
      expect(label).not.toBeNull();
      expect(label!.textContent).toContain("Process payment");
    });

    it("omits the label row for unlabelled edges (no data-edge-label)", () => {
      const svg = `<div data-edge-from="A" data-edge-to="B" data-edge-kind="sync" data-edge-canonical-id="A->B"></div>`;
      const { container } = render(
        <PreviewPane {...baseProps()} svg={svg} styleTargetPath="/style.krs.style" />,
      );
      const edge = container.querySelector("[data-edge-canonical-id]")!;
      fireEvent.contextMenu(edge, { clientX: 50, clientY: 60 });
      expect(queryMenu()).not.toBeNull();
      expect(document.querySelector(".context-menu-header__label")).toBeNull();
    });

    it("does not open the menu on right-click outside an edge", () => {
      const svg = `<div data-node-id="svc"></div>`;
      const { container } = render(<PreviewPane {...baseProps()} svg={svg} />);
      const node = container.querySelector("[data-node-id='svc']")!;
      fireEvent.contextMenu(node, { clientX: 50, clientY: 60 });
      expect(queryMenu()).toBeNull();
    });

    it("calls onPickEdgeDirection when a direction is chosen", async () => {
      const user = userEvent.setup();
      const onPick = vi.fn<(id: string, direction: string) => void>();
      const svg = `<div data-edge-from="A" data-edge-to="B" data-edge-kind="sync" data-edge-canonical-id="criticalWrite"></div>`;
      const { container } = render(
        <PreviewPane
          {...baseProps()}
          svg={svg}
          styleTargetPath="/style.krs.style"
          onPickEdgeDirection={onPick}
        />,
      );
      const edge = container.querySelector("[data-edge-canonical-id]")!;
      fireEvent.contextMenu(edge, { clientX: 50, clientY: 60 });
      const downItem = Array.from(queryItems()).find((b) =>
        b.textContent?.includes("Down"),
      ) as HTMLElement;
      // Radix DropdownMenuItem activates on the full pointer sequence — use
      // userEvent, not fireEvent.click (.claude/rules/testing.md).
      await user.click(downItem);
      expect(onPick).toHaveBeenCalledWith("criticalWrite", "down");
    });

    it("disables the direction items when no styleTargetPath is set", () => {
      const svg = `<div data-edge-from="A" data-edge-to="B" data-edge-kind="sync" data-edge-canonical-id="A->B"></div>`;
      const { container } = render(<PreviewPane {...baseProps()} svg={svg} />);
      const edge = container.querySelector("[data-edge-canonical-id]")!;
      fireEvent.contextMenu(edge, { clientX: 50, clientY: 60 });
      const items = queryItems();
      expect(items.length).toBeGreaterThan(0);
      for (const item of items) {
        // Radix marks a disabled DropdownMenuItem with aria-disabled +
        // data-disabled (a `div` has no `.disabled` property).
        expect(item.getAttribute("aria-disabled")).toBe("true");
        expect(item.hasAttribute("data-disabled")).toBe(true);
      }
    });

    it("shows the resolved target path basename in the menu header", () => {
      const svg = `<div data-edge-from="A" data-edge-to="B" data-edge-kind="sync" data-edge-canonical-id="A->B"></div>`;
      const { container } = render(
        <PreviewPane {...baseProps()} svg={svg} styleTargetPath="/project/site.krs.style" />,
      );
      const edge = container.querySelector("[data-edge-canonical-id]")!;
      fireEvent.contextMenu(edge, { clientX: 50, clientY: 60 });
      const target = queryTarget();
      expect(target).not.toBeNull();
      // basename is shown inline; full path lives on the title attribute
      expect(target!.textContent).toContain("site.krs.style");
      expect(target!.getAttribute("title")).toBe("/project/site.krs.style");
    });

    it("omits the target path line when there is no styleTargetPath", () => {
      const svg = `<div data-edge-from="A" data-edge-to="B" data-edge-kind="sync" data-edge-canonical-id="A->B"></div>`;
      const { container } = render(<PreviewPane {...baseProps()} svg={svg} />);
      const edge = container.querySelector("[data-edge-canonical-id]")!;
      fireEvent.contextMenu(edge, { clientX: 50, clientY: 60 });
      expect(queryTarget()).toBeNull();
    });
  });

  // #1537: the zoom handler must be a native, non-passive wheel listener so
  // preventDefault actually suppresses page/ancestor scroll. React's synthetic
  // onWheel is passive (React 17+) and would silently drop the preventDefault.
  describe("wheel zoom (#1537)", () => {
    function dispatchWheel(el: Element, deltaY: number) {
      const event = new WheelEvent("wheel", { deltaY, cancelable: true, bubbles: true });
      act(() => {
        el.dispatchEvent(event);
      });
      return event;
    }

    it("calls preventDefault on the wheel event (listener is non-passive)", () => {
      const { container } = render(<PreviewPane {...baseProps()} svg="<div></div>" />);
      const previewContainer = container.querySelector(".preview-container")!;
      const event = dispatchWheel(previewContainer, 100);
      expect(event.defaultPrevented).toBe(true);
    });

    it("zooms out on scroll down and in on scroll up", () => {
      const { container } = render(<PreviewPane {...baseProps()} svg="<div></div>" />);
      const previewContainer = container.querySelector(".preview-container")!;
      const zoomLayer = () => previewContainer.querySelector(":scope > div") as HTMLElement;

      dispatchWheel(previewContainer, 100); // scroll down → 0.9×
      expect(zoomLayer().style.transform).toContain("scale(0.9)");

      dispatchWheel(previewContainer, -100); // scroll up → back to ~1×
      expect(zoomLayer().style.transform).toContain("scale(0.99");
    });

    it("removes the wheel listener on unmount", () => {
      const { container, unmount } = render(<PreviewPane {...baseProps()} svg="<div></div>" />);
      const previewContainer = container.querySelector(".preview-container")!;
      unmount();
      // After unmount the detached node no longer mutates state; a dispatched
      // wheel event is simply not prevented (the listener was cleaned up).
      const event = new WheelEvent("wheel", { deltaY: 100, cancelable: true });
      previewContainer.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
    });

    // Regression guard: a native ancestor listener can't be stopped by a
    // descendant's React synthetic stopPropagation, so detail panels opt out
    // via data-wheel-zoom-ignore. Wheeling over a panel must scroll it, not
    // zoom the diagram (and must not preventDefault, which would cancel the
    // panel's own scroll).
    it("does not zoom when the wheel originates inside a detail panel (#1537)", () => {
      const svg = `<div data-node-id="leaf" data-has-children="false"></div>`;
      const metadata: NodeMetadata = {
        kind: "service",
        label: "Leaf",
        description: "",
        links: [],
        tags: [],
        annotations: [],
        hasChildren: false,
      };
      const { container } = render(
        <PreviewPane {...baseProps()} svg={svg} nodeMetadata={new Map([["leaf", metadata]])} />,
      );
      const previewContainer = container.querySelector(".preview-container")!;
      // Open the node detail panel by clicking the leaf node.
      click(
        previewContainer as HTMLElement,
        () => container.querySelector("[data-node-id='leaf']")!,
      );

      const panel = container.querySelector("[data-wheel-zoom-ignore]");
      expect(panel).not.toBeNull();
      const zoomLayer = () => previewContainer.querySelector(":scope > div") as HTMLElement;
      const before = zoomLayer().style.transform;

      const event = new WheelEvent("wheel", { deltaY: 100, cancelable: true, bubbles: true });
      act(() => {
        panel!.dispatchEvent(event);
      });

      // Listener bailed: scroll not cancelled, scale unchanged.
      expect(event.defaultPrevented).toBe(false);
      expect(zoomLayer().style.transform).toBe(before);
    });
  });
});
