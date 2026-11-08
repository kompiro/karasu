// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import {
  REVEAL_MARGIN,
  dismissReveal,
  requestReveal,
  revealDelta,
  useRevealNode,
  useRevealRequest,
} from "./preview-reveal.js";

afterEach(() => {
  cleanup();
  requestReveal(null);
});

const pane = { left: 0, top: 100, right: 600, bottom: 500 };

describe("revealDelta", () => {
  it("does not move a node that is already inside the pane", () => {
    expect(revealDelta({ left: 100, top: 200, right: 300, bottom: 300 }, pane)).toEqual({
      x: 0,
      y: 0,
    });
  });

  it("brings a node cut off at the top down to the margin", () => {
    const node = { left: 100, top: 60, right: 300, bottom: 160 };
    expect(revealDelta(node, pane)).toEqual({ x: 0, y: pane.top + REVEAL_MARGIN - node.top });
  });

  it("brings a node below the pane up to the margin", () => {
    const node = { left: 100, top: 450, right: 300, bottom: 550 };
    expect(revealDelta(node, pane).y).toBe(pane.bottom - REVEAL_MARGIN - node.bottom);
  });

  it("shows the start of a node larger than the pane, where its name is", () => {
    const node = { left: -100, top: 0, right: 900, bottom: 900 };
    expect(revealDelta(node, pane)).toEqual({
      x: pane.left + REVEAL_MARGIN - node.left,
      y: pane.top + REVEAL_MARGIN - node.top,
    });
  });
});

describe("useRevealRequest", () => {
  it("hands each request to the pane as a new value, even for the same node", () => {
    const { result } = renderHook(() => useRevealRequest());
    expect(result.current).toBeNull();

    act(() => requestReveal("CommerceApp"));
    const first = result.current;
    expect(first?.nodeId).toBe("CommerceApp");

    act(() => requestReveal("CommerceApp"));
    expect(result.current?.nodeId).toBe("CommerceApp");
    expect(result.current?.seq).not.toBe(first?.seq);
  });

  it("withdraws the request when the user pans or zooms", () => {
    const { result } = renderHook(() => useRevealRequest());
    act(() => requestReveal("BillingDB"));
    act(() => dismissReveal());
    expect(result.current).toBeNull();
  });
});

type Pan = { scale: number; x: number; y: number };

const rect = (left: number, top: number, right: number, bottom: number) =>
  ({
    left,
    top,
    right,
    bottom,
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  }) as DOMRect;

/** A pane and a diagram holding one node, with fixed screen boxes. */
function mountPane(nodeBox: DOMRect) {
  const container = document.createElement("div");
  const svgHost = document.createElement("div");
  const node = document.createElementNS("http://www.w3.org/2000/svg", "g");
  node.setAttribute("data-node-id", "CommerceApp");
  svgHost.append(node);
  container.append(svgHost);
  document.body.append(container);
  container.getBoundingClientRect = () => rect(0, 100, 600, 500);
  node.getBoundingClientRect = () => nodeBox;
  let pan: Pan = { scale: 1, x: 0, y: 0 };
  const setTransform = vi.fn<(update: (prev: Pan) => Pan) => void>((update) => {
    pan = update(pan);
  });
  const hook = renderHook(() =>
    useRevealNode({ current: container }, { current: svgHost }, setTransform, "<svg/>", "key"),
  );
  return { container, setTransform, hook, pan: () => pan };
}

describe("useRevealNode", () => {
  afterEach(() => document.body.replaceChildren());

  it("leaves the pan alone while nothing is requested", () => {
    const { setTransform } = mountPane(rect(100, 60, 300, 160));
    expect(setTransform).not.toHaveBeenCalled();
  });

  it("pans a requested node cut off at the top down into the pane", () => {
    const { pan } = mountPane(rect(100, 60, 300, 160));
    act(() => requestReveal("CommerceApp"));
    expect(pan()).toEqual({ scale: 1, x: 0, y: 100 + REVEAL_MARGIN - 60 });
  });

  it("does not move a requested node that is already inside", () => {
    const { pan } = mountPane(rect(100, 200, 300, 300));
    act(() => requestReveal("CommerceApp"));
    expect(pan()).toEqual({ scale: 1, x: 0, y: 0 });
  });

  it("withdraws the request on a press or a wheel in the pane", () => {
    const { container } = mountPane(rect(100, 200, 300, 300));
    const revealed = renderHook(() => useRevealRequest());
    act(() => requestReveal("CommerceApp"));
    act(() => {
      container.dispatchEvent(new Event("pointerdown"));
    });
    expect(revealed.result.current).toBeNull();

    act(() => requestReveal("CommerceApp"));
    act(() => {
      container.dispatchEvent(new Event("wheel"));
    });
    expect(revealed.result.current).toBeNull();
  });
});
