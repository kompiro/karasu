// @vitest-environment jsdom
//
// The listener-leak check (listener-leak-setup.ts) runs after every app test.
// This file shows it fires on a missing cleanup, stays quiet on a present one,
// and that the corpus has the shape it looks for: a component in the app
// registers a native listener on its own DOM (PreviewPane's non-passive wheel
// zoom, #1537). If React renamed the key the check uses to recognise its
// elements, the last test would fail instead of the check going silent.
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { useEffect, useRef } from "react";
import { leakedListeners, resetListenerTracking, trackedListenerCount } from "./listener-leak.js";
import { PreviewPane } from "../components/PreviewPane.js";
import { LocaleProvider } from "../i18n/index.js";

afterEach(cleanup);

function WheelBox({ withCleanup }: { withCleanup: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => e.preventDefault();
    el.addEventListener("wheel", onWheel, { passive: false });
    if (withCleanup) return () => el.removeEventListener("wheel", onWheel);
  }, [withCleanup]);
  return <div ref={ref} className="wheel-box" />;
}

describe("listener-leak check (TPL-1537 item 2)", () => {
  it("reports a native listener left on an unmounted element", () => {
    const { unmount } = render(<WheelBox withCleanup={false} />);
    expect(trackedListenerCount()).toBe(1);
    unmount();
    expect(leakedListeners()).toEqual([{ type: "wheel", element: '<div class="wheel-box">' }]);
    // Clear the record so the global afterEach does not fail this test.
    resetListenerTracking();
  });

  it("reports nothing when the effect removes its listener", () => {
    const { unmount } = render(<WheelBox withCleanup />);
    expect(trackedListenerCount()).toBe(1);
    unmount();
    expect(leakedListeners()).toEqual([]);
  });

  it("ignores elements React did not create", () => {
    const el = document.createElement("button");
    document.body.appendChild(el);
    el.addEventListener("click", () => {});
    el.remove();
    expect(leakedListeners()).toEqual([]);
  });

  it("sees the native wheel listener of a real app component", () => {
    const { unmount } = render(
      <LocaleProvider initialLocale="en">
        <PreviewPane
          svg="<div></div>"
          diagnostics={[]}
          nodeMetadata={new Map()}
          currentFilePath={null}
          displayRoot={null}
        />
      </LocaleProvider>,
    );
    expect(trackedListenerCount()).toBeGreaterThan(0);
    unmount();
    expect(leakedListeners()).toEqual([]);
  });
});
