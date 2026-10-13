// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { AppMode } from "./fs/detect-storage-mode.js";
import { encodeShare, SHARE_FRAGMENT_KEY } from "./utils/inline-share.js";

const detectAppMode = vi.fn<() => Promise<AppMode>>();

vi.mock("./fs/detect-storage-mode.js", () => ({ detectAppMode }));
vi.mock("./ServeModeApp.js", () => ({ ServeModeApp: () => <div>serve-mode</div> }));
vi.mock("./MemoryModeApp.js", () => ({ MemoryModeApp: () => <div>memory-mode</div> }));
vi.mock("./ProjectModeApp.js", () => ({ ProjectModeApp: () => <div>project-mode</div> }));

const SHARED_HASH = `#${SHARE_FRAGMENT_KEY}=${encodeShare({ krs: "system A {}\n" })}`;

/**
 * `App` snapshots the hash at module load, so each case sets it first and
 * imports a fresh copy — with the provider from the same module graph.
 */
async function renderApp(hash: string, props: { mode?: "serve" } = {}) {
  history.replaceState(null, "", `/${hash}`);
  vi.resetModules();
  const { App } = await import("./App.js");
  const { LocaleProvider } = await import("./i18n/index.js");
  render(
    <LocaleProvider>
      <App {...props} />
    </LocaleProvider>,
  );
}

beforeEach(() => {
  detectAppMode.mockReset();
  detectAppMode.mockResolvedValue("serve");
});

afterEach(() => {
  cleanup();
  history.replaceState(null, "", "/");
});

describe("App with the mode fixed by the entry (#3138)", () => {
  it("shows the serve screen without detecting the mode", async () => {
    await renderApp("", { mode: "serve" });
    expect(await screen.findByText("serve-mode")).toBeTruthy();
    expect(detectAppMode).not.toHaveBeenCalled();
  });

  it("does not open a shared inline URL, which needs the editor", async () => {
    await renderApp(SHARED_HASH, { mode: "serve" });
    expect(await screen.findByText("serve-mode")).toBeTruthy();
    expect(screen.queryByText("memory-mode")).toBeNull();
  });
});

describe("App without a fixed mode", () => {
  it("detects the mode at runtime", async () => {
    await renderApp("");
    expect(await screen.findByText("serve-mode")).toBeTruthy();
    expect(detectAppMode).toHaveBeenCalledOnce();
  });

  it("opens a shared inline URL in memory mode", async () => {
    await renderApp(SHARED_HASH);
    expect(await screen.findByText("memory-mode")).toBeTruthy();
    expect(detectAppMode).not.toHaveBeenCalled();
  });
});
