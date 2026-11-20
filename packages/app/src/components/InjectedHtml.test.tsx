// @vitest-environment jsdom
import { createRef } from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { InjectedHtml } from "./InjectedHtml.js";

afterEach(cleanup);

describe("InjectedHtml (#2789)", () => {
  it("keeps the injected nodes, and state applied to them, across a same-value re-render", () => {
    const ref = createRef<HTMLDivElement>();
    const { rerender } = render(<InjectedHtml ref={ref} html='<g id="a"></g>' />);
    const before = ref.current!.querySelector("#a")!;
    before.classList.add("karasu-highlighted");

    // A parent re-render with a new props object but the same string.
    rerender(<InjectedHtml ref={ref} html='<g id="a"></g>' className="changed" />);

    const after = ref.current!.querySelector("#a")!;
    expect(after).toBe(before);
    expect(after.classList.contains("karasu-highlighted")).toBe(true);
  });

  it("replaces the injected nodes when the string changes", () => {
    const ref = createRef<HTMLDivElement>();
    const { rerender } = render(<InjectedHtml ref={ref} html='<g id="a"></g>' />);
    const before = ref.current!.querySelector("#a")!;

    rerender(<InjectedHtml ref={ref} html='<g id="a" data-v="2"></g>' />);

    const after = ref.current!.querySelector("#a")!;
    expect(after).not.toBe(before);
    expect(after.getAttribute("data-v")).toBe("2");
  });

  it("renders a span when asked, with the passed attributes", () => {
    const { container } = render(
      <InjectedHtml as="span" className="icon" aria-hidden="true" html="<svg></svg>" />,
    );
    const span = container.querySelector("span.icon")!;
    expect(span.getAttribute("aria-hidden")).toBe("true");
    expect(span.querySelector("svg")).not.toBeNull();
  });
});
