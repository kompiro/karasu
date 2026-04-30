// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
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
      // Synchronously invoke onMount once on initial render.
      queueMicrotask(() => onMount?.(fakeEditor));
      return <div data-testid="mock-monaco" />;
    },
  };
});

import { EditorPane } from "./EditorPane.js";

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}

describe("EditorPane IME composition gating", () => {
  it("propagates changes when not composing", async () => {
    const onChange = vi.fn<(value: string) => void>();
    render(<EditorPane value="" onChange={onChange} />);
    await flushMicrotasks();

    lastChange?.("hello");
    expect(onChange).toHaveBeenCalledWith("hello");
  });

  it("buffers changes during composition and flushes once on compositionEnd", async () => {
    const onChange = vi.fn<(value: string) => void>();
    render(<EditorPane value="" onChange={onChange} />);
    await flushMicrotasks();

    compositionStartListener?.();
    lastChange?.("k");
    lastChange?.("ko");
    lastChange?.("kon");
    expect(onChange).not.toHaveBeenCalled();

    compositionEndListener?.();
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("kon");
  });

  it("does not flush a stale value if composition ends without intermediate changes", async () => {
    const onChange = vi.fn<(value: string) => void>();
    render(<EditorPane value="" onChange={onChange} />);
    await flushMicrotasks();

    compositionStartListener?.();
    compositionEndListener?.();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("resumes propagating after composition ends", async () => {
    const onChange = vi.fn<(value: string) => void>();
    render(<EditorPane value="" onChange={onChange} />);
    await flushMicrotasks();

    compositionStartListener?.();
    lastChange?.("a");
    compositionEndListener?.();
    onChange.mockClear();

    lastChange?.("ab");
    expect(onChange).toHaveBeenCalledWith("ab");
  });
});
