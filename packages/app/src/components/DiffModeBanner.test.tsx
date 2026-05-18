// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";
import { DiffModeBanner } from "./DiffModeBanner.js";

afterEach(cleanup);

describe("DiffModeBanner", () => {
  it("renders the compare file basename when source kind is 'file'", () => {
    const { getByText, queryByText, queryByLabelText } = render(
      <DiffModeBanner
        source={{ kind: "file", path: "/projects/abc/before.krs" }}
        snapshotManager={null}
        currentPath="/projects/abc/index.krs"
        onExit={() => {}}
      />,
    );
    expect(getByText("before.krs")).toBeDefined();
    expect(getByText("index.krs")).toBeDefined();
    expect(queryByText("pasted")).toBeNull();
    expect(queryByLabelText("View pasted .krs")).toBeNull();
  });

  it("renders 'pasted' label and View pasted button when source kind is 'pasted'", () => {
    const onViewPasted = vi.fn<() => void>();
    const { getByText, getByLabelText, queryByText } = render(
      <DiffModeBanner
        source={{ kind: "pasted", path: "/projects/abc/.karasu-paste-compare.krs" }}
        snapshotManager={null}
        currentPath="/projects/abc/index.krs"
        onExit={() => {}}
        onViewPasted={onViewPasted}
      />,
    );
    expect(getByText("pasted")).toBeDefined();
    expect(queryByText(".karasu-paste-compare.krs")).toBeNull();

    fireEvent.click(getByLabelText("View pasted .krs"));
    expect(onViewPasted).toHaveBeenCalledTimes(1);
  });

  it("omits the View pasted button when source is 'pasted' but onViewPasted is not supplied", () => {
    const { queryByLabelText } = render(
      <DiffModeBanner
        source={{ kind: "pasted", path: "/projects/abc/.karasu-paste-compare.krs" }}
        snapshotManager={null}
        currentPath="/projects/abc/index.krs"
        onExit={() => {}}
      />,
    );
    expect(queryByLabelText("View pasted .krs")).toBeNull();
  });

  it("renders Swap button and calls onSwap when clicked", () => {
    const onSwap = vi.fn<() => void>();
    const { getByLabelText } = render(
      <DiffModeBanner
        source={{ kind: "file", path: "/a/before.krs" }}
        snapshotManager={null}
        currentPath="/a/index.krs"
        onExit={() => {}}
        onSwap={onSwap}
      />,
    );
    const swapBtn = getByLabelText("Swap diff direction");
    expect(swapBtn.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(swapBtn);
    expect(onSwap).toHaveBeenCalledTimes(1);
  });

  it("omits the Swap button when onSwap is not supplied", () => {
    const { queryByLabelText } = render(
      <DiffModeBanner
        source={{ kind: "file", path: "/a/before.krs" }}
        snapshotManager={null}
        currentPath="/a/index.krs"
        onExit={() => {}}
      />,
    );
    expect(queryByLabelText("Swap diff direction")).toBeNull();
  });

  it("Swap button visible label reads '⇄ Swap' when not swapped", () => {
    // a11y contract (#1399 / TPL-20260516-01): a toggle's visible label must
    // reflect its state — not just the aria-pressed attribute.
    const { getByLabelText } = render(
      <DiffModeBanner
        source={{ kind: "file", path: "/a/before.krs" }}
        snapshotManager={null}
        currentPath="/a/index.krs"
        onExit={() => {}}
        onSwap={() => {}}
      />,
    );
    const swapBtn = getByLabelText("Swap diff direction");
    expect(swapBtn.textContent).toBe("⇄ Swap");
    expect(swapBtn.getAttribute("aria-pressed")).toBe("false");
  });

  it("Swap button visible label reads '⇄ Swap back' when swapped=true", () => {
    const { getByLabelText } = render(
      <DiffModeBanner
        source={{ kind: "file", path: "/a/before.krs" }}
        snapshotManager={null}
        currentPath="/a/index.krs"
        swapped
        onExit={() => {}}
        onSwap={() => {}}
      />,
    );
    const swapBtn = getByLabelText("Swap diff direction");
    expect(swapBtn.textContent).toBe("⇄ Swap back");
    expect(swapBtn.getAttribute("aria-pressed")).toBe("true");
  });

  it("flips the before/after label order when swapped=true", () => {
    const { container, getByLabelText } = render(
      <DiffModeBanner
        source={{ kind: "file", path: "/a/before.krs" }}
        snapshotManager={null}
        currentPath="/a/index.krs"
        swapped
        onExit={() => {}}
        onSwap={() => {}}
      />,
    );
    const before = container.querySelector(".diff-mode-banner__before")?.textContent ?? "";
    const after = container.querySelector(".diff-mode-banner__after")?.textContent ?? "";
    expect(before).toContain("index.krs");
    expect(after).toContain("before.krs");
    expect(getByLabelText("Swap diff direction").getAttribute("aria-pressed")).toBe("true");
  });

  it("calls onExit when the Exit diff button is clicked", () => {
    const onExit = vi.fn<() => void>();
    const { getByLabelText } = render(
      <DiffModeBanner
        source={{ kind: "file", path: "/a/before.krs" }}
        snapshotManager={null}
        currentPath="/a/index.krs"
        onExit={onExit}
      />,
    );
    fireEvent.click(getByLabelText("Exit diff mode"));
    expect(onExit).toHaveBeenCalledTimes(1);
  });
});
