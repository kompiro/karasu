import { describe, expect, it } from "vitest";
import {
  allowedRoots,
  checkRequestedPath,
  isKarasuSourcePath,
  isRealPathWithinRoots,
  isWithinRoots,
  readThroughBuffers,
} from "./host-files.js";

const ROOT = "/work/project";

describe("checkRequestedPath (#3312, TPL-168)", () => {
  it("accepts an absolute path and normalizes it", () => {
    expect(checkRequestedPath("/work/project/a/../index.krs")).toBe("/work/project/index.krs");
  });

  it.each([
    ["a non-string", 42],
    ["an empty string", ""],
    ["a relative path", "index.krs"],
    ["a NUL byte", "/work/project/index.krs\0.png"],
    ["an encoded slash", "/work/project/..%2f..%2fetc/passwd"],
    ["an encoded backslash", "/work/project/..%5Csecret"],
    ["an encoded dot", "/work/project/%2e%2e/secret"],
  ])("refuses %s", (_name, value) => {
    expect(checkRequestedPath(value)).toBeNull();
  });
});

describe("isWithinRoots (#3312)", () => {
  it("accepts the root itself and anything below it", () => {
    expect(isWithinRoots(ROOT, [ROOT])).toBe(true);
    expect(isWithinRoots(`${ROOT}/styles/app.krs.style`, [ROOT])).toBe(true);
  });

  it("refuses a sibling that only shares the root's prefix", () => {
    expect(isWithinRoots("/work/project-secrets/key.krs", [ROOT])).toBe(false);
  });

  it("refuses a path that climbs out with ..", () => {
    expect(isWithinRoots(`${ROOT}/../other/x.krs`, [ROOT])).toBe(false);
  });

  it("accepts an absolute path inside any of several roots", () => {
    expect(isWithinRoots("/elsewhere/b.krs", [ROOT, "/elsewhere"])).toBe(true);
  });
});

describe("allowedRoots (#3312)", () => {
  it("is the workspace folders when the entry lies in one", () => {
    expect(allowedRoots([ROOT], `${ROOT}/index.krs`)).toEqual([ROOT]);
  });

  it("adds the entry's directory when the entry lies outside every folder", () => {
    expect(allowedRoots([ROOT], "/tmp/scratch/index.krs")).toEqual([ROOT, "/tmp/scratch"]);
  });

  it("is the entry's directory when no folder is open", () => {
    expect(allowedRoots([], "/tmp/scratch/index.krs")).toEqual(["/tmp/scratch"]);
  });
});

describe("isRealPathWithinRoots (#3312, TPL-168)", () => {
  const links: Record<string, string> = {
    [`${ROOT}/link.krs`]: "/etc/secret.krs",
    [`${ROOT}/ok.krs`]: `${ROOT}/ok.krs`,
  };
  const realpath = async (p: string) => {
    if (p === ROOT) return ROOT;
    const target = links[p];
    if (!target) throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    return target;
  };

  it("refuses a symlink inside the root that points outside it", async () => {
    expect(await isRealPathWithinRoots(`${ROOT}/link.krs`, [ROOT], realpath)).toBe(false);
  });

  it("accepts a file whose real path stays inside", async () => {
    expect(await isRealPathWithinRoots(`${ROOT}/ok.krs`, [ROOT], realpath)).toBe(true);
  });

  it("lets a missing file through, so the read reports it missing", async () => {
    expect(await isRealPathWithinRoots(`${ROOT}/missing.krs`, [ROOT], realpath)).toBe(true);
  });

  it("compares against the roots' real paths, for a workspace under a symlink", async () => {
    const viaLink = async (p: string) => p.replace("/link-to-work", "/work");
    expect(
      await isRealPathWithinRoots(
        "/link-to-work/project/a.krs",
        ["/link-to-work/project"],
        viaLink,
      ),
    ).toBe(true);
  });
});

// TPL-2996: the preview reads what the user sees, the buffer, before the disk.
describe("readThroughBuffers (#3312, TPL-2996)", () => {
  it("reads an open file from its buffer, unsaved edits included", async () => {
    const disk = async () => "saved";
    expect(await readThroughBuffers("/p/a.krs", () => "unsaved", disk)).toBe("unsaved");
  });

  it("reads a file that is not open from the disk", async () => {
    expect(
      await readThroughBuffers(
        "/p/a.krs",
        () => undefined,
        async () => "saved",
      ),
    ).toBe("saved");
  });

  it("serves an empty buffer as empty, not as missing", async () => {
    expect(
      await readThroughBuffers(
        "/p/a.krs",
        () => "",
        async () => "saved",
      ),
    ).toBe("");
  });
});

describe("isKarasuSourcePath (#3312)", () => {
  it.each(["/p/index.krs", "/p/app.krs.style"])("accepts %s", (p) => {
    expect(isKarasuSourcePath(p)).toBe(true);
  });

  it.each(["/p/notes.md", "/p/index.krs.bak", "/p/.krs/x.json"])("refuses %s", (p) => {
    expect(isKarasuSourcePath(p)).toBe(false);
  });
});
