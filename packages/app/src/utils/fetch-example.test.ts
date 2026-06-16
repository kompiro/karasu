import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchExampleProject } from "./fetch-example.js";

type FetchLike = (url: string) => Promise<{
  ok: boolean;
  status: number;
  text: () => Promise<string>;
}>;

function mockFetch(files: Record<string, string>) {
  return vi.fn<FetchLike>((url: string) => {
    const rel = url.replace(/^.*\/examples\/[a-z]+\/[a-z0-9-]+\//, "");
    if (rel in files) {
      return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(files[rel]) });
    }
    return Promise.resolve({ ok: false, status: 404, text: () => Promise.resolve("") });
  });
}

afterEach(() => vi.unstubAllGlobals());

describe("fetchExampleProject", () => {
  it("rejects an unknown / malformed slug or lang WITHOUT fetching", async () => {
    const f = vi.fn<() => void>();
    vi.stubGlobal("fetch", f);
    await expect(fetchExampleProject("../etc", "en")).rejects.toThrow(/Unknown or unavailable/);
    await expect(fetchExampleProject("nope", "en")).rejects.toThrow(/Unknown or unavailable/);
    await expect(fetchExampleProject("payment-platform", "fr")).rejects.toThrow(/Unknown/);
    await expect(fetchExampleProject("client-mcp", "ja")).rejects.toThrow(/Unknown/); // en-only
    expect(f).not.toHaveBeenCalled();
  });

  it("fetches a single-file example from the fixed origin, never following redirects", async () => {
    const f = mockFetch({ "system.krs": "system Demo {}" });
    vi.stubGlobal("fetch", f);
    const result = await fetchExampleProject("payment-platform", "ja");
    expect(result.name).toBe("payment-platform");
    expect(result.files).toEqual([{ path: "system.krs", content: "system Demo {}" }]);
    expect(f).toHaveBeenCalledWith(
      "https://raw.githubusercontent.com/kompiro/karasu/main/examples/ja/payment-platform/system.krs",
      { redirect: "error" },
    );
  });

  it("follows imports recursively from the same origin", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch({
        "editor.krs": 'import "infra.krs"\nimport { R } from "reader.krs"\nsystem S {}',
        "infra.krs": "service Infra {}",
        "reader.krs": "service Reader {}",
      }),
    );
    const result = await fetchExampleProject("multi-file-system", "en");
    expect(result.files.map((file) => file.path).sort()).toEqual([
      "editor.krs",
      "infra.krs",
      "reader.krs",
    ]);
  });

  it("fetches @import style files too", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch({ "system.krs": '@import "theme.krs.style"\nsystem S {}', "theme.krs.style": "" }),
    );
    const result = await fetchExampleProject("payment-platform", "en");
    expect(result.files.map((file) => file.path).sort()).toEqual(["system.krs", "theme.krs.style"]);
  });

  it("throws on a fetch failure (404)", async () => {
    vi.stubGlobal("fetch", mockFetch({})); // entry missing → 404
    await expect(fetchExampleProject("payment-platform", "en")).rejects.toThrow(/HTTP 404/);
  });
});
