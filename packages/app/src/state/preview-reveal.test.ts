// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import {
  REVEAL_MARGIN,
  dismissReveal,
  requestReveal,
  revealDelta,
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
