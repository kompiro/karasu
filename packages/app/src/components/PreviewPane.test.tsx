// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { PreviewPane } from "./PreviewPane.js";

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
    viewPath: [],
    nodeMetadata: new Map(),
    onDrillDown: vi.fn(),
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
    it("calls onClearHighlight when a node with children is clicked", () => {
      const onClearHighlight = vi.fn();
      const onDrillDown = vi.fn();
      const svg = `<div data-node-id="svc" data-has-children="true"></div>`;

      const { container } = render(
        <PreviewPane
          {...baseProps()}
          svg={svg}
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
      const onClearHighlight = vi.fn();
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
      const onClearHighlight = vi.fn();
      const onContainerClick = vi.fn();
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
});
