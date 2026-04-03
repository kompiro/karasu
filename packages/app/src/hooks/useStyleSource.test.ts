// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";
import { InMemoryFileSystemProvider } from "@karasu/core";
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
});
