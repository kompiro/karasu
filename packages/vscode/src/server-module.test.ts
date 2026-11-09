import { describe, expect, it, vi } from "vitest";
import { resolveServerModule } from "./server-module.js";

describe("resolveServerModule (TPL-1024)", () => {
  const candidates = ["/ext/out/server.js", "/ext/../lsp/out/server.js"] as const;

  it("takes the first candidate that exists, without logging", () => {
    const log = vi.fn<(message: string) => void>();
    expect(resolveServerModule(candidates, (p) => p.includes("lsp"), log)).toBe(candidates[1]);
    expect(log).not.toHaveBeenCalled();
  });

  it("names every candidate in an error when none exists", () => {
    const log = vi.fn<(message: string) => void>();
    expect(resolveServerModule(candidates, () => false, log)).toBe(candidates[0]);
    expect(log).toHaveBeenCalledOnce();
    for (const candidate of candidates) expect(log.mock.calls[0]![0]).toContain(candidate);
  });
});
