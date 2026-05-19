import { describe, it, expect } from "vitest";
import type { InitializeParams } from "vscode-languageserver/node";
import { resolveLspLocale } from "./locale.js";

const initParams = (locale: string | undefined): InitializeParams =>
  ({
    locale,
    capabilities: {},
    processId: null,
    rootUri: null,
    workspaceFolders: null,
  }) as InitializeParams;

describe("resolveLspLocale", () => {
  it("resolves a Japanese display language to 'ja'", () => {
    expect(resolveLspLocale(initParams("ja"))).toBe("ja");
    expect(resolveLspLocale(initParams("ja-JP"))).toBe("ja");
    expect(resolveLspLocale(initParams("ja-jp"))).toBe("ja");
  });

  it("resolves any non-Japanese display language to 'en'", () => {
    expect(resolveLspLocale(initParams("en"))).toBe("en");
    expect(resolveLspLocale(initParams("en-US"))).toBe("en");
    expect(resolveLspLocale(initParams("de-DE"))).toBe("en");
  });

  it("defaults to 'en' when the client sends no locale", () => {
    expect(resolveLspLocale(initParams(undefined))).toBe("en");
    expect(resolveLspLocale(initParams(""))).toBe("en");
  });
});
