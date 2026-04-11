// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { strToU8 } from "fflate";
import { exportProjectAsZip } from "./export-project-zip.js";
import type { FileSystemProvider, DirEntry } from "@karasu-tools/core";

vi.mock("fflate", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fflate")>();
  return {
    ...actual,
    zipSync: vi.fn<() => Uint8Array>(
      () => new Uint8Array([0x50, 0x4b, 0x05, 0x06, ...new Array(18).fill(0)]),
    ),
  };
});

function makeFs(tree: Record<string, string>): FileSystemProvider {
  return {
    async readFile(path: string) {
      if (path in tree) return tree[path];
      throw new Error(`File not found: ${path}`);
    },
    async readDir(dir: string) {
      const prefix = dir.endsWith("/") ? dir : `${dir}/`;
      const seen = new Set<string>();
      const entries: DirEntry[] = [];
      for (const fullPath of Object.keys(tree)) {
        if (!fullPath.startsWith(prefix)) continue;
        const rest = fullPath.slice(prefix.length);
        const segment = rest.split("/")[0];
        if (seen.has(segment)) continue;
        seen.add(segment);
        const isFile = rest === segment;
        entries.push({ name: segment, kind: isFile ? "file" : "directory" });
      }
      return entries;
    },
    async writeFile() {},
    async exists() {
      return false;
    },
    async delete() {},
    async mkdir() {},
  };
}

describe("exportProjectAsZip", () => {
  let capturedFilename: string | null = null;
  let clickSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    capturedFilename = null;
    clickSpy = vi.fn<() => void>();

    vi.stubGlobal(
      "URL",
      Object.assign(URL, {
        createObjectURL: vi.fn<(blob: Blob) => string>(() => "blob:mock"),
        revokeObjectURL: vi.fn<(url: string) => void>(),
      }),
    );

    const origCreate = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      const el = origCreate(tag);
      if (tag === "a") {
        Object.defineProperty(el, "click", { value: clickSpy });
        Object.defineProperty(el, "download", {
          get() {
            return capturedFilename ?? "";
          },
          set(v: string) {
            capturedFilename = v;
          },
        });
      }
      return el;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("triggers download with correct filename", async () => {
    const fs = makeFs({ "/projects/abc/index.krs": "workspace {}" });
    await exportProjectAsZip(fs, "/projects/abc", "my-project");

    expect(capturedFilename).toBe("my-project.zip");
    expect(clickSpy).toHaveBeenCalledOnce();
  });

  it("passes all files with paths relative to rootPath to zipSync", async () => {
    const { zipSync } = await import("fflate");
    const fs = makeFs({
      "/projects/abc/index.krs": "workspace {}",
      "/projects/abc/default.krs.style": "style {}",
      "/projects/abc/services/ecommerce.krs": "system Ecommerce {}",
    });

    await exportProjectAsZip(fs, "/projects/abc", "my-project");

    expect(zipSync).toHaveBeenCalledOnce();
    const arg = vi.mocked(zipSync).mock.calls[0][0] as Record<string, Uint8Array>;
    expect(Object.keys(arg).sort()).toEqual([
      "my-project/default.krs.style",
      "my-project/index.krs",
      "my-project/services/ecommerce.krs",
    ]);
    expect(arg["my-project/index.krs"]).toEqual(strToU8("workspace {}"));
    expect(arg["my-project/services/ecommerce.krs"]).toEqual(strToU8("system Ecommerce {}"));
  });

  it("passes an empty object to zipSync when project has no files", async () => {
    const { zipSync } = await import("fflate");
    const fs = makeFs({});

    await exportProjectAsZip(fs, "/projects/empty", "empty-project");

    expect(capturedFilename).toBe("empty-project.zip");
    const arg = vi.mocked(zipSync).mock.calls[0][0] as Record<string, Uint8Array>;
    expect(Object.keys(arg)).toHaveLength(0);
  });
});
