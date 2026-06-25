import { describe, it, expect } from "vitest";
import { InMemoryFileSystemProvider } from "../fs/in-memory-provider.js";
import { Parser } from "../parser/parser.js";
import { synthesizeSharePayload, SHARE_STYLE_IMPORT_PATH } from "./synthesize.js";

async function project(files: Record<string, string>): Promise<InMemoryFileSystemProvider> {
  const fs = new InMemoryFileSystemProvider();
  for (const [path, content] of Object.entries(files)) {
    await fs.writeFile(path, content);
  }
  return fs;
}

const countOccurrences = (haystack: string, needle: string): number =>
  haystack.split(needle).length - 1;

describe("synthesizeSharePayload", () => {
  it("inlines a wildcard import into one self-contained .krs", async () => {
    const fs = await project({
      "/p/index.krs": `import "services.krs"\n\nsystem Shop {\n  service Web { label "Web" }\n  Web -> Api "calls"\n}`,
      "/p/services.krs": `system Shop {\n  service Api { label "API" }\n}`,
    });

    const { krs, style } = await synthesizeSharePayload("/p/index.krs", fs);

    expect(style).toBeUndefined();
    // No leftover node imports — fully self-contained.
    expect(krs).not.toMatch(/^\s*import\s+["']/m);
    // Both files' services are present in the single output.
    expect(krs).toContain("service Web");
    expect(krs).toContain("service Api");
    // The flattened source parses without errors.
    const parsed = Parser.parse(krs);
    expect(parsed.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  });

  it("merges a named import (only the named node is pulled in)", async () => {
    const fs = await project({
      "/p/index.krs": `import { Api } from "lib.krs"\n\nsystem Shop {\n  service Web { label "Web" }\n}`,
      "/p/lib.krs": `system Shop {\n  service Api { label "API" }\n  service Unused { label "Unused" }\n}`,
    });

    const { krs } = await synthesizeSharePayload("/p/index.krs", fs);

    expect(krs).toContain("service Api");
    expect(krs).toContain("service Web");
    expect(krs).not.toContain("Unused");
    expect(krs).not.toMatch(/^\s*import\b/m);
  });

  it("bundles the merged style and points the .krs at a single @import", async () => {
    const fs = await project({
      "/p/index.krs": `@import "theme.krs.style"\n\nsystem Shop {\n  service Api { label "API" }\n}`,
      "/p/theme.krs.style": `service { fill: #0a0; }`,
    });

    const { krs, style } = await synthesizeSharePayload("/p/index.krs", fs);

    expect(style).toBeDefined();
    expect(style).toContain("service");
    expect(style).toContain("#0a0");
    // Exactly one style import, normalized to the canonical bundled name.
    expect(countOccurrences(krs, "@import")).toBe(1);
    expect(krs).toContain(`@import "${SHARE_STYLE_IMPORT_PATH}"`);
    expect(krs).not.toContain("theme.krs.style");
  });

  it("leaves a single-file project without style un-bundled", async () => {
    const fs = await project({
      "/p/index.krs": `system Shop {\n  service Api { label "API" }\n}`,
    });

    const { krs, style } = await synthesizeSharePayload("/p/index.krs", fs);

    expect(style).toBeUndefined();
    expect(krs).not.toContain("@import");
    expect(krs).toContain("service Api");
  });
});
