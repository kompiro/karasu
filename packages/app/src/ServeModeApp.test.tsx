// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { useContext } from "react";
import { PreviewToolbarSlotContext } from "./components/preview-toolbar-slot.js";
import { ServeModeApp } from "./ServeModeApp.js";
import { HOSTED_APP_ORIGIN } from "./utils/hosted-app.js";

vi.mock("./components/AppShell.js", () => ({
  AppShell: function AppShellProbe() {
    const { hideShare, shareOrigin } = useContext(PreviewToolbarSlotContext);
    return <div>{hideShare ? "share-hidden" : `share-shown:${shareOrigin ?? "this-page"}`}</div>;
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
  // #3138 dropped Share because links built on this local server open only
  // here. #3162 brings it back with the links built on the public app.
  it("keeps Share and points its links at the public app (#3162)", async () => {
    render(<ServeModeApp />);
    expect(await screen.findByText(`share-shown:${HOSTED_APP_ORIGIN}`)).toBeTruthy();
  });
});
