import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  compareVersions,
  diffExtensionDirs,
  highestVersion,
  main,
  nextPreReleaseVersion,
  preReleaseVersion,
} from "./pre-release.mts";

// Fences the weekly VS Code pre-release decided in #2940
// (docs/design/vscode-pre-release-channel.md).

const PRE = { key: "Microsoft.VisualStudio.Code.PreRelease", value: "true" };
const show = (...versions: string[]) => ({ versions: versions.map((version) => ({ version })) });

describe("compareVersions", () => {
  it("compares each part as a number", () => {
    expect(compareVersions("0.5.2026110401", "0.5.1")).toBeGreaterThan(0);
    expect(compareVersions("0.6.0", "0.5.2026110401")).toBeGreaterThan(0);
    expect(compareVersions("0.10.0", "0.9.0")).toBeGreaterThan(0);
    expect(compareVersions("0.5.0", "0.5.0")).toBe(0);
  });

  it("rejects a version it cannot order", () => {
    expect(() => compareVersions("0.5.0-next.1", "0.5.0")).toThrow(/major.minor.patch/);
  });
});

describe("highestVersion", () => {
  it("takes the highest version of either channel", () => {
    const listed = {
      versions: [
        { version: "0.5.1" },
        { version: "0.5.2026110401", properties: [PRE] },
        { version: "0.5.0" },
      ],
    };
    expect(highestVersion(listed)).toBe("0.5.2026110401");
  });

  it("fails when the Marketplace lists nothing to compare with", () => {
    expect(() => highestVersion({})).toThrow(/no version/);
    expect(() => highestVersion({ versions: [] })).toThrow(/no version/);
  });

  it("fails on a listed version it cannot order, even when it is the only one", () => {
    expect(() => highestVersion(show("0.5.0-next.1"))).toThrow(/major.minor.patch/);
  });
});

describe("preReleaseVersion", () => {
  const wednesday = new Date("2026-11-04T00:00:00Z");

  it("puts the UTC date and 01 in the patch of the stable major.minor", () => {
    expect(preReleaseVersion("0.5.0", wednesday, ["0.5.0", "0.4.0"])).toBe("0.5.2026110401");
    expect(preReleaseVersion("0.5.3", wednesday, [])).toBe("0.5.2026110401");
  });

  it("takes the next number on a day that already has one", () => {
    expect(preReleaseVersion("0.5.0", wednesday, ["0.5.2026110401", "0.5.2026110402"])).toBe(
      "0.5.2026110403",
    );
  });

  it("counts only the same major.minor and the same day", () => {
    const existing = ["0.4.2026110401", "0.5.2026102801", "0.5.20261104"];
    expect(preReleaseVersion("0.5.0", wednesday, existing)).toBe("0.5.2026110401");
  });

  it("starts the next minor when the train moved the stable minor", () => {
    expect(preReleaseVersion("0.6.0", wednesday, ["0.5.2026102801", "0.6.0"])).toBe(
      "0.6.2026110401",
    );
  });

  it("fails past 99 on one day", () => {
    const full = Array.from(
      { length: 99 },
      (_, i) => `0.5.20261104${String(i + 1).padStart(2, "0")}`,
    );
    expect(() => preReleaseVersion("0.5.0", wednesday, full)).toThrow(/more than 99/);
  });

  it("rejects a stable version that is not major.minor.patch", () => {
    expect(() => preReleaseVersion("0.5", wednesday, [])).toThrow(/major.minor.patch/);
  });
});

describe("nextPreReleaseVersion", () => {
  it("is above every version on the Marketplace", () => {
    const now = new Date("2026-11-04T00:00:00Z");
    expect(nextPreReleaseVersion("0.5.0", now, show("0.5.0", "0.5.2026102801"))).toBe(
      "0.5.2026110401",
    );
  });

  it("fails when the clock is behind the last pre-release", () => {
    const now = new Date("2026-10-21T00:00:00Z");
    expect(() => nextPreReleaseVersion("0.5.0", now, show("0.5.0", "0.5.2026102801"))).toThrow(
      /not above 0.5.2026102801/,
    );
  });
});

describe("diffExtensionDirs", () => {
  const roots: string[] = [];
  afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  });

  const unzipped = (files: Record<string, string>): string => {
    const root = mkdtempSync(join(tmpdir(), "vsix-"));
    roots.push(root);
    for (const [path, content] of Object.entries(files)) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), content);
    }
    return root;
  };

  const extension = (version: string, extra: Record<string, string> = {}) =>
    unzipped({
      "extension.vsixmanifest": `<Identity Version="${version}" />`,
      "extension/package.json": JSON.stringify({ name: "karasu-vscode", version, main: "out" }),
      "extension/out/extension.js": "console.log(1);",
      ...extra,
    });

  it("finds nothing when only the version differs", () => {
    expect(diffExtensionDirs(extension("0.5.0"), extension("0.5.2026110401"))).toEqual([]);
  });

  it("lists a file whose bytes differ", () => {
    const changed = extension("0.5.0", { "extension/out/extension.js": "console.log(2);" });
    expect(diffExtensionDirs(extension("0.5.0"), changed)).toEqual(["out/extension.js"]);
  });

  it("lists a file only one side has", () => {
    const added = extension("0.5.0", { "extension/out/webview/main.js": "x" });
    expect(diffExtensionDirs(extension("0.5.0"), added)).toEqual(["out/webview/main.js"]);
    expect(diffExtensionDirs(added, extension("0.5.0"))).toEqual(["out/webview/main.js"]);
  });

  it("ignores how package.json is formatted", () => {
    // jq re-serialises the pre-release's package.json; the next week compares with it.
    const reformatted = unzipped({
      "extension/package.json": JSON.stringify(
        { name: "karasu-vscode", version: "0.5.2026110401", main: "out" },
        null,
        2,
      ),
      "extension/out/extension.js": "console.log(1);",
    });
    expect(diffExtensionDirs(reformatted, extension("0.5.0"))).toEqual([]);
  });

  it("compares the rest of package.json", () => {
    const other = unzipped({
      "extension/package.json": JSON.stringify({ name: "karasu-vscode", version: "1", main: "x" }),
      "extension/out/extension.js": "console.log(1);",
    });
    expect(diffExtensionDirs(extension("0.5.0"), other)).toEqual(["package.json"]);
  });

  it("fails on a directory that is not an unzipped .vsix", () => {
    const empty = unzipped({ "extension/.keep": "" });
    rmSync(join(empty, "extension/.keep"));
    expect(() => diffExtensionDirs(extension("0.5.0"), unzipped({ "x.txt": "" }))).toThrow(
      /no extension\/ directory/,
    );
    expect(() => diffExtensionDirs(extension("0.5.0"), empty)).toThrow(/is empty/);
  });
});

describe("main diff", () => {
  // The workflow matches these two words; anything else fails the run there.
  const roots: string[] = [];
  afterEach(() => {
    vi.restoreAllMocks();
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  });

  const withExtensionJs = (content: string): string => {
    const root = mkdtempSync(join(tmpdir(), "vsix-"));
    roots.push(root);
    mkdirSync(join(root, "extension"));
    writeFileSync(join(root, "extension/extension.js"), content);
    return root;
  };

  const run = (a: string, b: string) => {
    const out = vi.spyOn(console, "log").mockImplementation(() => {});
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    main(["diff", "--a", a, "--b", b]);
    return { out: out.mock.calls.flat(), err: err.mock.calls.flat() };
  };

  it("prints `same` when nothing differs", () => {
    expect(run(withExtensionJs("1"), withExtensionJs("1"))).toEqual({ out: ["same"], err: [] });
  });

  it("prints `changed` and names each differing file on stderr", () => {
    expect(run(withExtensionJs("1"), withExtensionJs("2"))).toEqual({
      out: ["changed"],
      err: ["changed: extension/extension.js"],
    });
  });

  it("requires both directories", () => {
    expect(() => main(["diff", "--a", "x"])).toThrow(/--b is required/);
    expect(() => main(["nope"])).toThrow(/unknown command/);
  });
});
