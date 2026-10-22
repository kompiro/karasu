// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";
import { InMemoryFileSystemProvider } from "@karasu-tools/core";
import { useStyleSource } from "./useStyleSource.js";

afterEach(cleanup);

const ENTRY = "/project/index.krs";
const STYLE_PATH = "/project/custom.krs.style";

const KRS_WITH_IMPORT = `@import "custom.krs.style"

system ECommerce {
  service OrderService { label "Order" }
}
`;

const KRS_WITHOUT_IMPORT = `system ECommerce {
  service OrderService { label "Order" }
}
`;

const STYLE_CONTENT = `service { color: #FF0000; }`;

describe("useStyleSource", () => {
  it("returns undefined when fileContent is undefined", async () => {
    const fs = new InMemoryFileSystemProvider();
    const { result } = renderHook(() => useStyleSource(undefined, ENTRY, fs));
    expect(result.current).toBeUndefined();
  });

  it("returns undefined when currentFilePath is undefined", async () => {
    const fs = new InMemoryFileSystemProvider();
    const { result } = renderHook(() => useStyleSource(KRS_WITH_IMPORT, undefined, fs));
    expect(result.current).toBeUndefined();
  });

  it("returns undefined when fileContent has no @import declarations", async () => {
    const fs = new InMemoryFileSystemProvider();
    const { result } = renderHook(() => useStyleSource(KRS_WITHOUT_IMPORT, ENTRY, fs));
    expect(result.current).toBeUndefined();
  });

  it("returns concatenated style content when style files exist", async () => {
    const fs = new InMemoryFileSystemProvider();
    await fs.writeFile(STYLE_PATH, STYLE_CONTENT);

    const { result } = renderHook(() => useStyleSource(KRS_WITH_IMPORT, ENTRY, fs));

    // Wait for async resolution
    await act(() => new Promise((r) => setTimeout(r, 0)));

    expect(result.current).toBe(STYLE_CONTENT);
  });

  it("returns undefined when style file does not exist", async () => {
    const fs = new InMemoryFileSystemProvider();
    // Do not write the style file

    const { result } = renderHook(() => useStyleSource(KRS_WITH_IMPORT, ENTRY, fs));

    // Wait for async resolution
    await act(() => new Promise((r) => setTimeout(r, 0)));

    expect(result.current).toBeUndefined();
  });

  it("concatenates multiple style files", async () => {
    const fs = new InMemoryFileSystemProvider();
    await fs.writeFile("/project/a.krs.style", "service { color: #AAA; }");
    await fs.writeFile("/project/b.krs.style", "service { color: #BBB; }");

    const krs = `@import "a.krs.style"
@import "b.krs.style"

system S { service Svc { label "Svc" } }
`;

    const { result } = renderHook(() => useStyleSource(krs, ENTRY, fs));

    await act(() => new Promise((r) => setTimeout(r, 0)));

    expect(result.current).toBe("service { color: #AAA; }\nservice { color: #BBB; }");
  });

  it("does not serve the previous import's style while a new one is resolving", async () => {
    const fs = new InMemoryFileSystemProvider();
    await fs.writeFile("/project/a.krs.style", "service { color: #AAA; }");
    await fs.writeFile("/project/b.krs.style", "service { color: #BBB; }");

    const withA = `@import "a.krs.style"\n\nsystem S { service Svc { label "Svc" } }\n`;
    const withB = `@import "b.krs.style"\n\nsystem S { service Svc { label "Svc" } }\n`;

    const { result, rerender } = renderHook(({ krs }) => useStyleSource(krs, ENTRY, fs), {
      initialProps: { krs: withA },
    });
    await act(() => new Promise((r) => setTimeout(r, 0)));
    expect(result.current).toBe("service { color: #AAA; }");

    // Drop the import, then pick up a different one. The style loaded for `a`
    // must not be served for `b` in the renders before `b` resolves.
    rerender({ krs: KRS_WITHOUT_IMPORT });
    expect(result.current).toBeUndefined();

    rerender({ krs: withB });
    expect(result.current).toBeUndefined();

    await act(() => new Promise((r) => setTimeout(r, 0)));
    expect(result.current).toBe("service { color: #BBB; }");
  });
});

describe("useStyleSource revision (#3311)", () => {
  // A host that edits files behind the viewer (the VS Code webview) announces
  // the edit by bumping the revision. The import list is unchanged, so without
  // the revision the sheet would never be read again.
  it("re-reads the imported sheets when the revision changes", async () => {
    const fs = new InMemoryFileSystemProvider();
    await fs.writeFile(STYLE_PATH, STYLE_CONTENT);
    const { result, rerender } = renderHook(
      ({ revision }) => useStyleSource(KRS_WITH_IMPORT, ENTRY, fs, revision),
      { initialProps: { revision: 0 } },
    );
    await act(() => new Promise((r) => setTimeout(r, 0)));
    expect(result.current).toBe(STYLE_CONTENT);

    await fs.writeFile(STYLE_PATH, "service { color: #00FF00; }");
    rerender({ revision: 0 });
    await act(() => new Promise((r) => setTimeout(r, 0)));
    expect(result.current).toBe(STYLE_CONTENT);

    rerender({ revision: 1 });
    // The previous sheet stays until the new one has been read.
    expect(result.current).toBe(STYLE_CONTENT);
    await act(() => new Promise((r) => setTimeout(r, 0)));
    expect(result.current).toBe("service { color: #00FF00; }");
  });
});
