import { describe, expect, it } from "vitest";
import {
  allowedRoots,
  checkRequestedPath,
  decideExists,
  decideFileRead,
  decideFileWrite,
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

// The read policy (#3312): a model file is readable wherever it lies, judged by
// its real path; anything else only inside the listable roots.
describe("decideFileRead / decideExists (#3312, TPL-168)", () => {
  const files: Record<string, string> = {
    [`${ROOT}/index.krs`]: `${ROOT}/index.krs`,
    "/shared/common.krs": "/shared/common.krs",
    [`${ROOT}/notes.krs`]: `${ROOT}/.env`,
    [`${ROOT}/alias`]: `${ROOT}/index.krs`,
    [`${ROOT}/styles`]: `${ROOT}/styles`,
    "/etc": "/etc",
    "/shared/Theme.KRS": "/shared/Theme.KRS",
  };
  const deps = (open: string[] = [], platform: NodeJS.Platform = "linux") => ({
    realpath: async (p: string) => {
      const real = files[p];
      if (!real) throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
      return real;
    },
    hasBuffer: (p: string) => open.includes(p),
    platform,
  });

  it("reads a model file inside the workspace from its real path", async () => {
    expect(await decideFileRead(`${ROOT}/index.krs`, deps())).toEqual({
      kind: "read",
      path: `${ROOT}/index.krs`,
      diskPath: `${ROOT}/index.krs`,
    });
  });

  it("reads a model file outside the workspace, which a model may import", async () => {
    expect((await decideFileRead("/shared/common.krs", deps())).kind).toBe("read");
  });

  it("refuses a .krs name whose real file is something else", async () => {
    expect((await decideFileRead(`${ROOT}/notes.krs`, deps())).kind).toBe("refused");
  });

  it("follows a link whose real file is a model file", async () => {
    expect(await decideFileRead(`${ROOT}/alias`, deps())).toMatchObject({
      kind: "read",
      diskPath: `${ROOT}/index.krs`,
    });
  });

  it("judges the extension case-insensitively where the file system is", async () => {
    expect((await decideFileRead("/shared/Theme.KRS", deps([], "darwin"))).kind).toBe("read");
    expect((await decideFileRead("/shared/Theme.KRS", deps([], "linux"))).kind).toBe("refused");
  });

  it("reads an open buffer that is not on disk yet, and reports anything else missing", async () => {
    expect((await decideFileRead(`${ROOT}/new.krs`, deps([`${ROOT}/new.krs`]))).kind).toBe("read");
    expect((await decideFileRead(`${ROOT}/gone.krs`, deps())).kind).toBe("notFound");
  });

  it("answers existence for model files anywhere and for anything inside the roots", async () => {
    expect(await decideExists("/shared/common.krs", [ROOT], deps())).toBe(true);
    expect(await decideExists(`${ROOT}/styles`, [ROOT], deps())).toBe(true);
    expect(await decideExists(`${ROOT}/gone.krs`, [ROOT], deps())).toBe(false);
  });

  it("answers false, not a refusal, for what lies outside the roots", async () => {
    expect(await decideExists("/etc", [ROOT], deps())).toBe(false);
  });
});

// #3313: a write is narrower than a read: a model file inside the writable
// roots only, judged on the real path, or on the parent's for a new file.
describe("decideFileWrite (#3313, TPL-168)", () => {
  const files: Record<string, string> = {
    [ROOT]: ROOT,
    [`${ROOT}/index.krs`]: `${ROOT}/index.krs`,
    [`${ROOT}/styles`]: `${ROOT}/styles`,
    [`${ROOT}/notes.krs`]: `${ROOT}/.env`,
    [`${ROOT}/escape.krs`]: "/etc/hosts.krs",
    [`${ROOT}/linked`]: "/outside",
    "/outside": "/outside",
    "/shared/common.krs": "/shared/common.krs",
  };
  const deps = {
    realpath: async (p: string) => {
      const real = files[p];
      if (!real) throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
      return real;
    },
    hasBuffer: () => false,
    platform: "linux" as const,
  };

  it("writes a model file inside the workspace", async () => {
    expect(await decideFileWrite(`${ROOT}/index.krs`, [ROOT], deps)).toEqual({
      kind: "write",
      path: `${ROOT}/index.krs`,
      exists: true,
    });
  });

  it("creates a new style sheet in a directory inside the workspace", async () => {
    expect(await decideFileWrite(`${ROOT}/styles/app.krs.style`, [ROOT], deps)).toEqual({
      kind: "write",
      path: `${ROOT}/styles/app.krs.style`,
      exists: false,
    });
  });

  it("refuses a model file outside the workspace, though the preview may read it", async () => {
    expect((await decideFileWrite("/shared/common.krs", [ROOT], deps)).kind).toBe("refused");
  });

  it("refuses a .krs name whose real file is something else", async () => {
    expect((await decideFileWrite(`${ROOT}/notes.krs`, [ROOT], deps)).kind).toBe("refused");
  });

  it("refuses a symlink inside the workspace that points out of it", async () => {
    expect((await decideFileWrite(`${ROOT}/escape.krs`, [ROOT], deps)).kind).toBe("refused");
  });

  it("refuses a new file under a directory link that points out of the workspace", async () => {
    expect((await decideFileWrite(`${ROOT}/linked/new.krs.style`, [ROOT], deps)).kind).toBe(
      "refused",
    );
  });

  it.each([`${ROOT}/notes.md`, `${ROOT}/styles/app.css`])(
    "refuses another extension: %s",
    async (p) => {
      expect((await decideFileWrite(p, [ROOT], deps)).kind).toBe("refused");
    },
  );

  it("refuses a new file in a directory that does not exist", async () => {
    expect((await decideFileWrite(`${ROOT}/missing/app.krs.style`, [ROOT], deps)).kind).toBe(
      "refused",
    );
  });
});
