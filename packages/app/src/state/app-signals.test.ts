// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, renderHook } from "@testing-library/react";
import {
  getAppSignals,
  happenedSince,
  recordEvent,
  resetAppSignals,
  setShowing,
  useShowingSignal,
} from "./app-signals.js";

afterEach(() => {
  cleanup();
  resetAppSignals();
});

describe("app signals (#3599)", () => {
  it("numbers each event, so two readers each count from their own point", () => {
    recordEvent("share-opened");
    const first = getAppSignals().seq;
    recordEvent("svg-exported");
    const signals = getAppSignals();
    expect(signals.seq).toBe(first + 1);
    expect(happenedSince(signals, ["share-opened"], first)).toBe(false);
    expect(happenedSince(signals, ["svg-exported"], first)).toBe(true);
    // A reader from before both sees both; reading takes nothing away.
    expect(happenedSince(signals, ["share-opened", "svg-exported"], 0)).toBe(true);
    expect(happenedSince(getAppSignals(), ["share-opened"], 0)).toBe(true);
  });

  it("keeps what is showing as a value", () => {
    setShowing("team-dependencies", true);
    expect(getAppSignals().showing.has("team-dependencies")).toBe(true);
    const unchanged = getAppSignals();
    setShowing("team-dependencies", true);
    expect(getAppSignals()).toBe(unchanged);
    setShowing("team-dependencies", false);
    expect(getAppSignals().showing.has("team-dependencies")).toBe(false);
  });

  it("takes a showing value back when its publisher unmounts", () => {
    const { rerender, unmount } = renderHook(
      ({ on }) => useShowingSignal("team-dependencies", on),
      { initialProps: { on: true } },
    );
    expect(getAppSignals().showing.has("team-dependencies")).toBe(true);
    rerender({ on: false });
    expect(getAppSignals().showing.has("team-dependencies")).toBe(false);
    rerender({ on: true });
    unmount();
    expect(getAppSignals().showing.has("team-dependencies")).toBe(false);
  });
});
