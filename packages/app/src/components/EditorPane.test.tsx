// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { useEffect } from "react";
import type { editor } from "monaco-editor";

afterEach(cleanup);

type ChangeHandler = (value: string | undefined) => void;
type MountHandler = (editorInstance: editor.IStandaloneCodeEditor) => void;

interface MonacoMockProps {
  value: string;
  onChange?: ChangeHandler;
  onMount?: MountHandler;
}

let lastChange: ChangeHandler | undefined;
let compositionStartListener: (() => void) | undefined;
let compositionEndListener: (() => void) | undefined;

const fakeEditor: editor.IStandaloneCodeEditor = {
  // biome-ignore lint/suspicious/noExplicitAny: minimal Monaco shim for tests
  addCommand: vi.fn<() => void>() as any,
  // biome-ignore lint/suspicious/noExplicitAny: minimal Monaco shim for tests
  onDidCompositionStart: ((cb: () => void) => {
    compositionStartListener = cb;
    return { dispose: () => {} };
  }) as any,
  // biome-ignore lint/suspicious/noExplicitAny: minimal Monaco shim for tests
  onDidCompositionEnd: ((cb: () => void) => {
    compositionEndListener = cb;
    return { dispose: () => {} };
  }) as any,
  // biome-ignore lint/suspicious/noExplicitAny: minimal Monaco shim for tests
} as any;

vi.mock("@monaco-editor/react", () => {
  return {
    default: ({ onChange, onMount }: MonacoMockProps) => {
      lastChange = onChange;
      // Fire onMount once after commit so refs/listeners are wired before the
      // test interacts. Using useEffect keeps render side-effect-free.
      useEffect(() => {
        onMount?.(fakeEditor);
      }, [onMount]);
      return <div data-testid="mock-monaco" />;
    },
  };
});

import { EditorPane } from "./EditorPane.js";

describe("EditorPane IME composition gating", () => {
  it("propagates changes when not composing", () => {
    const onChange = vi.fn<(value: string) => void>();
    render(<EditorPane value="" onChange={onChange} />);

    lastChange?.("hello");
    expect(onChange).toHaveBeenCalledWith("hello");
  });

  it("buffers changes during composition and flushes once on compositionEnd", () => {
    const onChange = vi.fn<(value: string) => void>();
    render(<EditorPane value="" onChange={onChange} />);

    compositionStartListener?.();
    lastChange?.("k");
    lastChange?.("ko");
    lastChange?.("kon");
    expect(onChange).not.toHaveBeenCalled();

    compositionEndListener?.();
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("kon");
  });

  it("does not flush a stale value if composition ends without intermediate changes", () => {
    const onChange = vi.fn<(value: string) => void>();
    render(<EditorPane value="" onChange={onChange} />);

    compositionStartListener?.();
    compositionEndListener?.();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("resumes propagating after composition ends", () => {
    const onChange = vi.fn<(value: string) => void>();
    render(<EditorPane value="" onChange={onChange} />);

    compositionStartListener?.();
    lastChange?.("a");
    compositionEndListener?.();
    onChange.mockClear();

    lastChange?.("ab");
    expect(onChange).toHaveBeenCalledWith("ab");
  });
});
