// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";
import { InMemoryFileSystemProvider } from "@karasu-tools/core";
import { useDeployView } from "./useDeployView.js";

afterEach(cleanup);

const ENTRY = "/project/index.krs";

const DEPLOY_SOURCE = `system S {
  service App {
    label "App"
  }
}

deploy Prod {
  oci appc {
    label "AppContainer"
    runtime "Docker"
    realizes App
  }
}`;

const INVALID_SOURCE = "!!! invalid krs !!!";

function makeFs(source: string) {
  const fs = new InMemoryFileSystemProvider();
  fs.writeFile(ENTRY, source);
  return fs;
}

describe("useDeployView", () => {
  it("compiles a deploy diagram after the debounce", async () => {
    vi.useFakeTimers();
    const fs = makeFs(DEPLOY_SOURCE);
    const { result } = renderHook(() => useDeployView(ENTRY, fs));

    expect(result.current.svg).toBe("");
    await act(() => vi.advanceTimersByTimeAsync(300));

    expect(result.current.svg).not.toBe("");
    expect(result.current.svg).toContain("AppContainer");
    expect(result.current.diagnostics.some((d) => d.severity === "error")).toBe(false);
    expect(result.current.deployBlocks.length).toBeGreaterThan(0);
    vi.useRealTimers();
  });

  it("threads the theme into compileProject (parity with the other views)", async () => {
    vi.useFakeTimers();
    const fs = makeFs(DEPLOY_SOURCE);
    const dark = renderHook(() => useDeployView(ENTRY, fs, null, "shape", null, null, "dark"));
    const light = renderHook(() => useDeployView(ENTRY, fs, null, "shape", null, null, "light"));
    await act(() => vi.advanceTimersByTimeAsync(300));
    expect(dark.result.current.svg).not.toBe("");
    expect(light.result.current.svg).not.toBe("");
    // Different themes produce different SVG chrome.
    expect(dark.result.current.svg).not.toBe(light.result.current.svg);
    vi.useRealTimers();
  });

  it("retains the previous valid svg when the updated source has errors", async () => {
    vi.useFakeTimers();
    const fs = makeFs(DEPLOY_SOURCE);
    const { result } = renderHook(() => useDeployView(ENTRY, fs));
    await act(() => vi.advanceTimersByTimeAsync(300));
    const validSvg = result.current.svg;
    expect(validSvg).toContain("AppContainer");

    // Two acts: the first flushes the recompile re-render (so the effect
    // re-subscribes its debounce timer), the second advances it.
    await act(async () => {
      await fs.writeFile(ENTRY, INVALID_SOURCE);
      result.current.recompile();
    });
    await act(() => vi.advanceTimersByTimeAsync(300));

    expect(result.current.diagnostics.some((d) => d.severity === "error")).toBe(true);
    // Last valid SVG is kept rather than blanked out.
    expect(result.current.svg).toBe(validSvg);
    vi.useRealTimers();
  });

  // #1540: useDeployView previously lacked the `hadErrors` guard that
  // useSystemView/useOrgView had, so fixing an error by reverting to
  // byte-identical pre-error content left the error diagnostics stuck (the
  // recovered fingerprint matched the pre-error one and the publish was
  // skipped). The shared useDebouncedCompile applies the guard uniformly.
  it("clears diagnostics when an error is fixed by reverting to identical content", async () => {
    vi.useFakeTimers();
    const fs = makeFs(DEPLOY_SOURCE);
    const { result } = renderHook(() => useDeployView(ENTRY, fs));
    await act(() => vi.advanceTimersByTimeAsync(300));
    expect(result.current.diagnostics.some((d) => d.severity === "error")).toBe(false);

    // Introduce an error.
    await act(async () => {
      await fs.writeFile(ENTRY, INVALID_SOURCE);
      result.current.recompile();
    });
    await act(() => vi.advanceTimersByTimeAsync(300));
    expect(result.current.diagnostics.some((d) => d.severity === "error")).toBe(true);

    // Fix by reverting to the exact same source — the recovered SVG is identical
    // to the last valid one, so without the hadErrors guard the publish is skipped.
    await act(async () => {
      await fs.writeFile(ENTRY, DEPLOY_SOURCE);
      result.current.recompile();
    });
    await act(() => vi.advanceTimersByTimeAsync(300));
    expect(result.current.diagnostics.some((d) => d.severity === "error")).toBe(false);
    expect(result.current.svg).toContain("AppContainer");
    vi.useRealTimers();
  });
});
