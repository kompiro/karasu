// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";
import { PasteCompareDialog } from "./PasteCompareDialog.js";

afterEach(cleanup);

describe("PasteCompareDialog", () => {
  it("disables Compare until the textarea has non-empty content", () => {
    const onConfirm = vi.fn<(content: string) => void>();
    const { getByLabelText } = render(
      <PasteCompareDialog onConfirm={onConfirm} onCancel={() => {}} />,
    );
    const button = getByLabelText("Compare with pasted .krs") as HTMLButtonElement;
    expect(button.disabled).toBe(true);

    const textarea = getByLabelText("Pasted .krs content") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "system X {}" } });
    expect(button.disabled).toBe(false);
  });

  it("calls onConfirm with the textarea content on Compare click", () => {
    const onConfirm = vi.fn<(content: string) => void>();
    const { getByLabelText } = render(
      <PasteCompareDialog onConfirm={onConfirm} onCancel={() => {}} />,
    );
    const textarea = getByLabelText("Pasted .krs content") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "system X {}" } });
    fireEvent.click(getByLabelText("Compare with pasted .krs"));
    expect(onConfirm).toHaveBeenCalledWith("system X {}");
  });

  it("calls onCancel on Cancel click and on overlay click", () => {
    const onCancel = vi.fn<() => void>();
    const { getByLabelText, getByRole } = render(
      <PasteCompareDialog onConfirm={() => {}} onCancel={onCancel} />,
    );
    fireEvent.click(getByLabelText("Cancel"));
    expect(onCancel).toHaveBeenCalledTimes(1);

    const overlay = getByRole("dialog");
    fireEvent.click(overlay);
    expect(onCancel).toHaveBeenCalledTimes(2);
  });

  it("calls onCancel on Escape keydown", () => {
    const onCancel = vi.fn<() => void>();
    render(<PasteCompareDialog onConfirm={() => {}} onCancel={onCancel} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("renders read-only mode with Close label and no Compare button", () => {
    const { getByLabelText, queryByLabelText } = render(
      <PasteCompareDialog readOnly initialValue="system Y {}" onCancel={() => {}} />,
    );
    expect(getByLabelText("Close")).toBeDefined();
    expect(queryByLabelText("Compare with pasted .krs")).toBeNull();
    const textarea = getByLabelText("Pasted .krs content") as HTMLTextAreaElement;
    expect(textarea.readOnly).toBe(true);
    expect(textarea.value).toBe("system Y {}");
  });

  // TPL-20260510-04 anti-regression: the textarea is a plain controlled
  // component whose `value` only changes via the user's own `onChange`.
  // No parent-side derived rewrite fires mid-composition today, so the
  // EditorPane-class IME bug (#1053) cannot reach it. If a future change
  // introduces a live transform (validation, normalization, AI suggestion
  // prefix, ...) that fires during composition, this assertion catches it.
  it("controlled value during a simulated IME composition cycle is not rewritten", () => {
    const { getByLabelText } = render(
      <PasteCompareDialog onConfirm={() => {}} onCancel={() => {}} />,
    );
    const textarea = getByLabelText("Pasted .krs content") as HTMLTextAreaElement;

    fireEvent.compositionStart(textarea);
    fireEvent.change(textarea, { target: { value: "システム" } });
    expect(textarea.value).toBe("システム");

    fireEvent.compositionEnd(textarea);
    expect(textarea.value).toBe("システム");
  });
});
