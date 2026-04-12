import { describe, it, expect } from "vitest";
import { zipSync, strToU8 } from "fflate";
import { parseZipForImport, disambiguateName } from "./import-project-zip.js";

// ── helpers ────────────────────────────────────────────────────────────────

function makeZip(files: Record<string, string>): Uint8Array {
  const entries: Record<string, Uint8Array> = {};
  for (const [path, content] of Object.entries(files)) {
    entries[path] = strToU8(content);
  }
  return zipSync(entries);
}

// ── parseZipForImport ──────────────────────────────────────────────────────

describe("parseZipForImport — top-level directory stripping", () => {
  it("strips a single common top-level directory from file paths", () => {
    const zip = makeZip({
      "my-project/index.krs": "system S {}",
      "my-project/services/app.krs": "system A {}",
    });
    const { files } = parseZipForImport(zip);
    expect(files.map((f) => f.path)).toEqual(
      expect.arrayContaining(["index.krs", "services/app.krs"]),
    );
  });

  it("preserves paths when there is no common top-level directory", () => {
    const zip = makeZip({
      "index.krs": "system S {}",
      "services/app.krs": "system A {}",
    });
    const { files } = parseZipForImport(zip);
    expect(files.map((f) => f.path)).toEqual(
      expect.arrayContaining(["index.krs", "services/app.krs"]),
    );
  });
});

describe("parseZipForImport — file content", () => {
  it("returns the correct file content", () => {
    const zip = makeZip({ "my-project/index.krs": "system S {}" });
    const { files } = parseZipForImport(zip);
    expect(files[0].content).toBe("system S {}");
  });
});

describe("parseZipForImport — extension filtering", () => {
  it("includes .krs files", () => {
    const zip = makeZip({ "my-project/index.krs": "" });
    const { files } = parseZipForImport(zip);
    expect(files).toHaveLength(1);
  });

  it("includes .krs.style files", () => {
    const zip = makeZip({ "my-project/default.krs.style": "" });
    const { files } = parseZipForImport(zip);
    expect(files).toHaveLength(1);
  });

  it("silently ignores non-.krs / non-.krs.style files", () => {
    const zip = makeZip({
      "my-project/index.krs": "",
      "my-project/README.md": "# readme",
      "my-project/image.png": "binary",
    });
    const { files } = parseZipForImport(zip);
    expect(files).toHaveLength(1);
    expect(files[0].path).toBe("index.krs");
  });
});

describe("parseZipForImport — detectedName", () => {
  it("returns the top-level directory name when all files share one", () => {
    const zip = makeZip({
      "my-project/index.krs": "",
      "my-project/services/app.krs": "",
    });
    const { detectedName } = parseZipForImport(zip);
    expect(detectedName).toBe("my-project");
  });

  it("returns undefined when files span multiple top-level directories", () => {
    const zip = makeZip({
      "proj-a/index.krs": "",
      "proj-b/index.krs": "",
    });
    const { detectedName } = parseZipForImport(zip);
    expect(detectedName).toBeUndefined();
  });

  it("returns undefined when files are at the ZIP root (flat structure)", () => {
    const zip = makeZip({ "index.krs": "" });
    const { detectedName } = parseZipForImport(zip);
    expect(detectedName).toBeUndefined();
  });
});

// ── disambiguateName ───────────────────────────────────────────────────────

describe("disambiguateName", () => {
  it("returns the name unchanged when it does not exist", () => {
    expect(disambiguateName("new-project", ["alpha", "beta"])).toBe("new-project");
  });

  it("appends (2) when the name already exists", () => {
    expect(disambiguateName("my-project", ["my-project"])).toBe("my-project (2)");
  });

  it("increments the counter until a unique name is found", () => {
    expect(
      disambiguateName("my-project", ["my-project", "my-project (2)", "my-project (3)"]),
    ).toBe("my-project (4)");
  });

  it("returns the name unchanged when the list is empty", () => {
    expect(disambiguateName("my-project", [])).toBe("my-project");
  });
});
