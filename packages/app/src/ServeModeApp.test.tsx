// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { useContext } from "react";
import { PreviewToolbarSlotContext } from "./components/preview-toolbar-slot.js";
import { ServeModeApp } from "./ServeModeApp.js";

vi.mock("./components/AppShell.js", () => ({
  AppShell: function AppShellProbe() {
    const { hideShare } = useContext(PreviewToolbarSlotContext);
    return <div>{hideShare ? "share-hidden" : "share-shown"}</div>;
  },
}));
vi.mock("./state/app-context.js", () => ({
  useAppContext: () => ({
    dispatch: vi.fn<() => void>(),
    fs: { writeFile: vi.fn<() => Promise<void>>() },
  }),
}));
vi.mock("./hooks/useFileSelection.js", () => ({
  useFileSelection: () => ({ selectFileWithContent: vi.fn<() => void>() }),
}));

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async () => new Response("system A {}\n", { status: 200 })),
  );
  vi.stubGlobal(
    "EventSource",
    class {
      addEventListener() {}
      close() {}
    },
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ServeModeApp", () => {
  it("drops Share from the preview toolbar (#3138)", async () => {
    render(<ServeModeApp />);
    expect(await screen.findByText("share-hidden")).toBeTruthy();
  });
});
