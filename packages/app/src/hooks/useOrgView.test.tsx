// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { renderHook, act, cleanup, waitFor } from "@testing-library/react";
import { useOrgView } from "./useOrgView.js";
import { InMemoryFileSystemProvider } from "@karasu-tools/core";

afterEach(cleanup);

const ENTRY_PATH = "/test/index.krs";

// Source with org structure that renders visible team nodes
const ORG_SOURCE_A = `organization OrgA {
  team TeamA {
    label "Alpha"
  }
  team TeamB {
    label "Beta"
  }
}`;
// Structurally different: three teams instead of two produces different SVG
const ORG_SOURCE_B = `organization OrgB {
  team TeamC {
    label "Gamma"
  }
  team TeamD {
    label "Delta"
  }
  team TeamE {
    label "Epsilon"
  }
}`;
const INVALID_SOURCE = "!!! invalid krs !!!";

async function makeFs(initialContent: string): Promise<InMemoryFileSystemProvider> {
  const fs = new InMemoryFileSystemProvider();
  await fs.writeFile(ENTRY_PATH, initialContent);
  return fs;
}

describe("useOrgView", () => {
  it("renders org SVG from filesystem", async () => {
    const fs = await makeFs(ORG_SOURCE_A);
    const { result } = renderHook(() => useOrgView(ENTRY_PATH, fs, []));

    await waitFor(() => expect(result.current.orgSvg).toBeTruthy(), { timeout: 1000 });
    expect(result.current.orgSvg).toContain("TeamA");
  });

  it("updates SVG when recompile is triggered after file change", async () => {
    const fs = await makeFs(ORG_SOURCE_A);
    const { result } = renderHook(() => useOrgView(ENTRY_PATH, fs, []));

    await waitFor(() => expect(result.current.orgSvg).toBeTruthy(), { timeout: 1000 });
    const initialSvg = result.current.orgSvg;

    await act(async () => {
      await fs.writeFile(ENTRY_PATH, ORG_SOURCE_B);
      result.current.recompile();
    });

    await waitFor(() => expect(result.current.orgSvg).not.toBe(initialSvg), { timeout: 1000 });
  });

  it("accepts displayMode: icon and produces SVG without errors", async () => {
    const fs = await makeFs(ORG_SOURCE_A);
    const { result } = renderHook(() => useOrgView(ENTRY_PATH, fs, [], "icon"));

    await waitFor(() => expect(result.current.orgSvg).toBeTruthy(), { timeout: 1000 });
    expect(result.current.orgDiagnostics.filter((d) => d.severity === "error")).toHaveLength(0);
  });

  it("retains previous valid orgSvg when updated source has errors", async () => {
    const fs = await makeFs(ORG_SOURCE_A);
    const { result } = renderHook(() => useOrgView(ENTRY_PATH, fs, []));

    await waitFor(() => expect(result.current.orgSvg).toBeTruthy(), { timeout: 1000 });
    const validSvg = result.current.orgSvg;

    await act(async () => {
      await fs.writeFile(ENTRY_PATH, INVALID_SOURCE);
      result.current.recompile();
    });

    await waitFor(
      () => expect(result.current.orgDiagnostics.some((d) => d.severity === "error")).toBe(true),
      { timeout: 1000 },
    );
    expect(result.current.orgSvg).toBe(validSvg);
  });
});
