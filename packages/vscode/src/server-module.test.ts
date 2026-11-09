import { describe, expect, it, vi } from "vitest";
import { translate } from "@karasu-tools/i18n";
import { resolveServerModule } from "./server-module.js";

describe("resolveServerModule (TPL-1024)", () => {
  const candidates = ["/ext/out/server.js", "/ext/../lsp/out/server.js"] as const;

  it("takes the first candidate that exists, without reporting", () => {
    const onMissing = vi.fn<(tried: readonly string[]) => void>();
    expect(resolveServerModule(candidates, (p) => p.includes("lsp"), onMissing)).toBe(
      candidates[1],
    );
    expect(onMissing).not.toHaveBeenCalled();
  });

  it("reports every candidate when none exists", () => {
    const onMissing = vi.fn<(tried: readonly string[]) => void>();
    expect(resolveServerModule(candidates, () => false, onMissing)).toBe(candidates[0]);
    expect(onMissing).toHaveBeenCalledExactlyOnceWith(candidates);
  });

  it.each(["en", "ja"] as const)("names every tried path in the %s message", (locale) => {
    const message = translate(locale, "vscode.server.notFound", { tried: candidates });
    for (const candidate of candidates) expect(message).toContain(candidate);
  });
});
