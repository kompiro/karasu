// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";
import type { Diagnostic } from "@karasu-tools/core";
import { useDebouncedCompile, type CompileOutcome } from "./useDebouncedCompile.js";

afterEach(cleanup);

interface S {
  label: string;
  diagnostics: Diagnostic[];
}

const ERR: Diagnostic = { severity: "error", code: "x", params: {} };

describe("useDebouncedCompile", () => {
  it("publishes the compile result after the 300ms debounce, not before", async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() =>
      useDebouncedCompile<S>({
        active: true,
        currentKey: "k",
        initialState: { label: "init", diagnostics: [] },
        compile: async () => ({
          diagnostics: [],
          svg: "svg",
          fingerprint: "fp",
          errorState: (s) => ({ label: s, diagnostics: [] }),
          okState: () => ({ label: "compiled", diagnostics: [] }),
        }),
        onError: (p) => p,
        deps: ["k"],
      }),
    );

    expect(result.current.label).toBe("init");
    await act(() => vi.advanceTimersByTimeAsync(299));
    expect(result.current.label).toBe("init"); // still debouncing
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(result.current.label).toBe("compiled");
    vi.useRealTimers();
  });

  it("does not run when inactive", async () => {
    vi.useFakeTimers();
    const compile = vi.fn<() => Promise<CompileOutcome<S>>>();
    renderHook(() =>
      useDebouncedCompile<S>({
        active: false,
        currentKey: "k",
        initialState: { label: "init", diagnostics: [] },
        compile,
        onError: (p) => p,
        deps: ["k"],
      }),
    );
    await act(() => vi.advanceTimersByTimeAsync(300));
    expect(compile).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  // #1534: an in-flight compile whose inputs changed before it resolved must
  // not publish its (now stale) result over the newer compile's state.
  it("drops a stale in-flight compile when inputs change mid-flight", async () => {
    vi.useFakeTimers();
    const resolvers: Array<() => void> = [];

    function useProbe(tick: number) {
      return useDebouncedCompile<S>({
        active: true,
        currentKey: `key-${tick}`,
        initialState: { label: "init", diagnostics: [] },
        compile: () =>
          new Promise<CompileOutcome<S>>((resolve) => {
            resolvers.push(() =>
              resolve({
                diagnostics: [],
                svg: `svg-${tick}`,
                fingerprint: `fp-${tick}`,
                errorState: (s) => ({ label: s, diagnostics: [] }),
                okState: () => ({ label: `tick-${tick}`, diagnostics: [] }),
              }),
            );
          }),
        onError: (p) => p,
        deps: [tick],
      });
    }

    const { result, rerender } = renderHook(({ tick }) => useProbe(tick), {
      initialProps: { tick: 1 },
    });

    // Compile #1 (tick=1) starts and stays in-flight (resolver not called yet).
    await act(() => vi.advanceTimersByTimeAsync(300));
    expect(resolvers).toHaveLength(1);

    // Inputs change → the in-flight #1 is cancelled; compile #2 (tick=2) starts.
    rerender({ tick: 2 });
    await act(() => vi.advanceTimersByTimeAsync(300));
    expect(resolvers).toHaveLength(2);

    // Resolve the newer compile first → it publishes.
    await act(async () => resolvers[1]());
    expect(result.current.label).toBe("tick-2");

    // The older compile resolves late — it must be dropped, not overwrite tick-2.
    await act(async () => resolvers[0]());
    expect(result.current.label).toBe("tick-2");

    vi.useRealTimers();
  });

  // #1540: after an error→recovery to byte-identical content, the fingerprint
  // matches the pre-error one; the hadErrors guard must still force a publish.
  it("re-publishes after error→recovery even when the fingerprint is unchanged", async () => {
    vi.useFakeTimers();
    let mode: "ok" | "err" = "ok";
    function useProbe() {
      return useDebouncedCompile<S>({
        active: true,
        currentKey: "k",
        initialState: { label: "init", diagnostics: [] },
        compile: async () =>
          mode === "ok"
            ? {
                diagnostics: [],
                svg: "stable",
                fingerprint: "fp-stable", // identical before and after the error
                errorState: (s) => ({ label: s, diagnostics: [] }),
                okState: () => ({ label: "ok", diagnostics: [] }),
              }
            : {
                diagnostics: [ERR],
                svg: "stable",
                fingerprint: "fp-error",
                errorState: (s) => ({ label: s, diagnostics: [ERR] }),
                okState: () => ({ label: "ok", diagnostics: [] }),
              },
        onError: (p) => p,
        deps: [],
      });
    }
    const { result } = renderHook(() => useProbe());

    await act(() => vi.advanceTimersByTimeAsync(300));
    expect(result.current.diagnostics).toHaveLength(0);

    mode = "err";
    await act(async () => {
      result.current.recompile();
    });
    await act(() => vi.advanceTimersByTimeAsync(300));
    expect(result.current.diagnostics).toHaveLength(1);

    mode = "ok"; // recovers to the exact pre-error fingerprint
    await act(async () => {
      result.current.recompile();
    });
    await act(() => vi.advanceTimersByTimeAsync(300));
    expect(result.current.diagnostics).toHaveLength(0); // guard forced the publish
    vi.useRealTimers();
  });
});
