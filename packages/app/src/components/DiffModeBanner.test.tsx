// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";
import { DiffModeBanner } from "./DiffModeBanner.js";

afterEach(cleanup);

describe("DiffModeBanner", () => {
  it("renders the compare file basename when source is 'file'", () => {
    const { getByText, queryByText, queryByLabelText } = render(
      <DiffModeBanner
        comparePath="/projects/abc/before.krs"
        compareSource="file"
        currentPath="/projects/abc/index.krs"
        onExit={() => {}}
      />,
    );
    expect(getByText("before.krs")).toBeDefined();
    expect(getByText("index.krs")).toBeDefined();
    expect(queryByText("pasted")).toBeNull();
    expect(queryByLabelText("View pasted .krs")).toBeNull();
  });

  it("renders 'pasted' label and View pasted button when source is 'pasted'", () => {
    const onViewPasted = vi.fn<() => void>();
    const { getByText, getByLabelText, queryByText } = render(
      <DiffModeBanner
        comparePath="/projects/abc/.karasu-paste-compare.krs"
        compareSource="pasted"
        currentPath="/projects/abc/index.krs"
        onExit={() => {}}
        onViewPasted={onViewPasted}
      />,
    );
    // The pasted label replaces the file basename on the before-side.
    expect(getByText("pasted")).toBeDefined();
    expect(queryByText(".karasu-paste-compare.krs")).toBeNull();

    fireEvent.click(getByLabelText("View pasted .krs"));
    expect(onViewPasted).toHaveBeenCalledTimes(1);
  });

  it("omits the View pasted button when source is 'pasted' but onViewPasted is not supplied", () => {
    const { queryByLabelText } = render(
      <DiffModeBanner
        comparePath="/projects/abc/.karasu-paste-compare.krs"
        compareSource="pasted"
        currentPath="/projects/abc/index.krs"
        onExit={() => {}}
      />,
    );
    expect(queryByLabelText("View pasted .krs")).toBeNull();
  });

  it("calls onExit when the Exit diff button is clicked", () => {
    const onExit = vi.fn<() => void>();
    const { getByLabelText } = render(
      <DiffModeBanner
        comparePath="/a/before.krs"
        compareSource="file"
        currentPath="/a/index.krs"
        onExit={onExit}
      />,
    );
    fireEvent.click(getByLabelText("Exit diff mode"));
    expect(onExit).toHaveBeenCalledTimes(1);
  });
});
