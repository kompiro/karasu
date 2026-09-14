import { describe, expect, it } from "vitest";
import { diagnosticLocationLabel } from "./diagnostic-location.js";

const at = (line: number, file?: string) => ({
  start: { line, column: 3, offset: 0 },
  end: { line, column: 3, offset: 0 },
  ...(file !== undefined ? { file } : {}),
});

const context = { currentFilePath: "/projects/shop/index.krs", projectRoot: "/projects/shop" };

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

  it("names an imported file relative to the project root", () => {
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

  it("tolerates a trailing slash on the project root", () => {
    const slashed = { ...context, projectRoot: "/projects/shop/" };

    expect(diagnosticLocationLabel(at(7, "/projects/shop/theme.krs.style"), slashed)).toBe(
      "theme.krs.style:7",
    );
  });

  // A file outside the root (or no project at all) keeps its full path rather
  // than a misleading shortened one.
  it("shows the full path when the file is not under the project root", () => {
    expect(diagnosticLocationLabel(at(1, "/elsewhere/shared.krs"), context)).toBe(
      "/elsewhere/shared.krs:1",
    );
    expect(
      diagnosticLocationLabel(at(1, "/elsewhere/shared.krs"), {
        currentFilePath: null,
        projectRoot: null,
      }),
    ).toBe("/elsewhere/shared.krs:1");
  });

  // `/projects/shopping` starts with `/projects/shop` as a string; the prefix
  // check has to stop at a path boundary.
  it("does not shorten a sibling directory that merely shares the root's prefix", () => {
    expect(diagnosticLocationLabel(at(1, "/projects/shopping/index.krs"), context)).toBe(
      "/projects/shopping/index.krs:1",
    );
  });
});
