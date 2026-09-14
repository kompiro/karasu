import { describe, expect, it } from "vitest";
import { diagnosticLocationLabel, displayRootFor, findingKeys } from "./diagnostic-location.js";

const at = (line: number, file?: string) => ({
  start: { line, column: 3, offset: 0 },
  end: { line, column: 3, offset: 0 },
  ...(file !== undefined ? { file } : {}),
});

const context = { currentFilePath: "/projects/shop/index.krs", displayRoot: "/projects/shop" };

describe("diagnosticLocationLabel (#2715)", () => {
  it("has nothing to show for a diagnostic without a position", () => {
    expect(diagnosticLocationLabel(undefined, context)).toBeNull();
  });

  // A single-document compile has no file to name; its positions are the
  // open document's by definition.
  it("reads a position without a file as the open document's", () => {
    expect(diagnosticLocationLabel(at(4), context)).toBe("Line 4");
  });

  it("keeps the line form for the open document's own positions", () => {
    expect(diagnosticLocationLabel(at(4, "/projects/shop/index.krs"), context)).toBe("Line 4");
  });

  it("names an imported file relative to the display root", () => {
    expect(diagnosticLocationLabel(at(12, "/projects/shop/slices/legacy.krs"), context)).toBe(
      "slices/legacy.krs:12",
    );
  });

  // The open document is not always the entry: with `legacy.krs` open, the
  // entry's own diagnostics are the ones from "another file".
  it("names the entry when another file is the one open", () => {
    const legacyOpen = { ...context, currentFilePath: "/projects/shop/slices/legacy.krs" };

    expect(diagnosticLocationLabel(at(2, "/projects/shop/index.krs"), legacyOpen)).toBe(
      "index.krs:2",
    );
  });

  it("tolerates a trailing slash on the display root", () => {
    const slashed = { ...context, displayRoot: "/projects/shop/" };

    expect(diagnosticLocationLabel(at(7, "/projects/shop/theme.krs.style"), slashed)).toBe(
      "theme.krs.style:7",
    );
  });

  // A file outside the root (or no project at all) keeps its full path rather
  // than a misleading shortened one.
  it("shows the full path when the file is not under the display root", () => {
    expect(diagnosticLocationLabel(at(1, "/elsewhere/shared.krs"), context)).toBe(
      "/elsewhere/shared.krs:1",
    );
    expect(
      diagnosticLocationLabel(at(1, "/elsewhere/shared.krs"), {
        currentFilePath: null,
        displayRoot: null,
      }),
    ).toBe("/elsewhere/shared.krs:1");
  });

  // Compare mode mounts a snapshot at `/.snapshot-view/<id>/`; the reader knows
  // the file by the project-relative path below the id, not by the mount.
  it("names a compared snapshot's file by its project-relative path", () => {
    expect(diagnosticLocationLabel(at(4, "/.snapshot-view/snap-1/index.krs"), context)).toBe(
      "index.krs:4",
    );
    expect(
      diagnosticLocationLabel(at(9, "/.snapshot-view/snap-1/slices/legacy.krs"), context),
    ).toBe("slices/legacy.krs:9");
  });

  // `/projects/shopping` starts with `/projects/shop` as a string; the prefix
  // check has to stop at a path boundary.
  it("does not shorten a sibling directory that merely shares the root's prefix", () => {
    expect(diagnosticLocationLabel(at(1, "/projects/shopping/index.krs"), context)).toBe(
      "/projects/shopping/index.krs:1",
    );
  });
});

describe("displayRootFor (#2715)", () => {
  it("uses the project root when there is a project", () => {
    expect(displayRootFor("/projects/shop", "/projects/shop/slices/api.krs")).toBe(
      "/projects/shop",
    );
  });

  // Memory and serve modes have no project; their files live beside the entry
  // under a mount (`/memory`, `/serve`) the user never chose.
  it("falls back to the entry's directory without a project", () => {
    expect(displayRootFor(null, "/memory/index.krs")).toBe("/memory");
    expect(displayRootFor(null, "/serve/index.krs")).toBe("/serve");
  });

  it("has no root when there is neither a project nor an entry", () => {
    expect(displayRootFor(null, null)).toBeNull();
  });
});

describe("findingKeys (#2715)", () => {
  it("keeps same-offset findings from two files apart", () => {
    expect(
      findingKeys([{ loc: at(3, "/p/a.krs") }, { loc: at(3, "/p/b.krs") }], ["m", "m"]),
    ).toEqual(["/p/a.krs:0:m", "/p/b.krs:0:m"]);
  });

  // Diff mode concatenates both sides, so one imported file's error can appear
  // twice word for word; only the repeat gets a count.
  it("disambiguates an exact repeat without renaming the first", () => {
    expect(
      findingKeys([{ loc: at(3, "/p/a.krs") }, { loc: at(3, "/p/a.krs") }, {}], ["m", "m", "m"]),
    ).toEqual(["/p/a.krs:0:m", "/p/a.krs:0:m#1", "::m"]);
  });
});
