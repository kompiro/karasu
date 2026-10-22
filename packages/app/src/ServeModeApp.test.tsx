// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { useContext, useEffect, type RefObject } from "react";
import { compileProject, InMemoryFileSystemProvider } from "@karasu-tools/core";
import { PreviewToolbarSlotContext } from "./components/preview-toolbar-slot.js";
import { ServeModeApp } from "./ServeModeApp.js";
import { HOSTED_APP_ORIGIN } from "./utils/hosted-app.js";

const shell = vi.hoisted(() => ({ recompile: vi.fn<() => void>() }));
const ctx = vi.hoisted(() => ({
  fs: null as unknown as InMemoryFileSystemProvider,
  dispatch: vi.fn<(action: { type: string; path?: string; content?: string }) => void>(),
}));

vi.mock("./components/AppShell.js", () => ({
  AppShell: function AppShellProbe(props: {
    entryPath: string | null;
    displayRoot?: string;
    sourceRevision?: number;
    recompileRef?: RefObject<(() => void) | null>;
  }) {
    const { hide, shareOrigin } = useContext(PreviewToolbarSlotContext);
    const { recompileRef } = props;
    useEffect(() => {
      if (recompileRef) recompileRef.current = shell.recompile;
    }, [recompileRef]);
    return (
      <div>
        <span>
          {hide?.includes("share") ? "share-hidden" : `share-shown:${shareOrigin ?? "this-page"}`}
        </span>
        <span data-testid="entry">{props.entryPath ?? "none"}</span>
        <span data-testid="display-root">{props.displayRoot ?? "none"}</span>
        <span data-testid="revision">{props.sourceRevision ?? 0}</span>
      </div>
    );
  },
}));
vi.mock("./state/app-context.js", () => ({
  useAppContext: () => ({ dispatch: ctx.dispatch, fs: ctx.fs }),
}));

type ProjectFile = { path: string; content: string };

/** What `/api/project` returns; tests replace it to stand for a save on disk. */
let project: ProjectFile[];
let projectFetches: number;

/** The one EventSource the component opens, so tests can deliver events. */
let source: { emit: (event: string) => void } | null;

const MULTI_FILE: ProjectFile[] = [
  {
    path: "index.krs",
    content: `@import "theme.krs.style"
import "reader.krs"
import { Blog.Editor } from "editor.krs"
import "services/"

system Blog {
  label "Blog"
}
`,
  },
  {
    path: "reader.krs",
    content: `system Blog {
  service Reader { label "Reader" }
}
`,
  },
  {
    path: "editor.krs",
    content: `system Blog {
  service Editor { label "Editor" }
}
`,
  },
  {
    path: "services/moderation.krs",
    content: `import "../shared.krs"

system Blog {
  service Moderation { label "Moderation" }
}
`,
  },
  {
    path: "shared.krs",
    content: `system Blog {
  service Shared { label "Shared" }
}
`,
  },
  { path: "theme.krs.style", content: "service {\n  background-color: #123456;\n}\n" },
];

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function fileNotFound(diagnostics: { code?: string }[]): unknown[] {
  return diagnostics.filter((d) => d.code === "file-not-found");
}

/** Deliver a watch event and wait for the refetch it causes to land. */
async function emit(event: string): Promise<void> {
  const before = projectFetches;
  await act(async () => {
    source?.emit(event);
  });
  await waitFor(() => expect(projectFetches).toBeGreaterThan(before));
  // Let the refetch's writes and dispatches settle.
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

function dispatched(type: string) {
  return ctx.dispatch.mock.calls.map(([a]) => a).filter((a) => a.type === type);
}

beforeEach(() => {
  ctx.fs = new InMemoryFileSystemProvider();
  ctx.dispatch.mockReset();
  shell.recompile.mockReset();
  project = MULTI_FILE;
  projectFetches = 0;
  source = null;
  window.history.replaceState({}, "", "/");
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url === "/api/default") return json({ file: "index" });
      if (url === "/api/project") {
        projectFetches++;
        return json({ files: project });
      }
      return new Response("not found", { status: 404 });
    }),
  );
  vi.stubGlobal(
    "EventSource",
    class {
      private listeners = new Map<string, (() => void)[]>();
      constructor() {
        source = {
          emit: (event) => {
            for (const listener of this.listeners.get(event) ?? []) listener();
          },
        };
      }
      addEventListener(event: string, listener: () => void) {
        this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener]);
      }
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

  // #3258: only the entry used to reach the in-memory fs, as /serve/index.krs.
  describe("import resolution (#3258)", () => {
    it("mirrors the directory so whole-file, named, directory and style imports resolve", async () => {
      render(<ServeModeApp />);
      expect(await screen.findByText("/serve/index.krs")).toBeTruthy();
      expect(screen.getByTestId("display-root").textContent).toBe("/serve");

      for (const f of MULTI_FILE) {
        expect(await ctx.fs.readFile(`/serve/${f.path}`)).toBe(f.content);
      }
      const result = await compileProject("/serve/index.krs", ctx.fs);
      expect(fileNotFound(result.diagnostics)).toEqual([]);
      for (const label of ["Reader", "Editor", "Moderation", "Shared"]) {
        expect(result.svg).toContain(label);
      }
      expect(result.svg).toContain("#123456");
    });

    it("opens a file in a subdirectory at its real path, so relative imports resolve", async () => {
      window.history.replaceState({}, "", "/services/moderation");
      render(<ServeModeApp />);
      expect(await screen.findByText("/serve/services/moderation.krs")).toBeTruthy();
      expect(dispatched("SELECT_FILE")).toEqual([
        {
          type: "SELECT_FILE",
          path: "/serve/services/moderation.krs",
          content: MULTI_FILE[3]?.content,
        },
      ]);

      const result = await compileProject("/serve/services/moderation.krs", ctx.fs);
      expect(fileNotFound(result.diagnostics)).toEqual([]);
      expect(result.svg).toContain("Shared");
    });

    it("decodes a percent-encoded file name from the URL", async () => {
      project = [{ path: "my model.krs", content: "system A {}\n" }];
      window.history.replaceState({}, "", "/my%20model");
      render(<ServeModeApp />);
      expect(await screen.findByText("/serve/my model.krs")).toBeTruthy();
    });

    it("shows File not found when the opened file is not in the directory", async () => {
      window.history.replaceState({}, "", "/missing");
      render(<ServeModeApp />);
      expect(await screen.findByText("File not found: missing.krs")).toBeTruthy();
    });

    it("refetches when an imported file changes, and recompiles without touching the entry", async () => {
      render(<ServeModeApp />);
      await screen.findByText("/serve/index.krs");
      const revision = Number(screen.getByTestId("revision").textContent);
      shell.recompile.mockClear();
      ctx.dispatch.mockClear();

      project = MULTI_FILE.map((f) =>
        f.path === "reader.krs"
          ? { ...f, content: f.content.replace('"Reader"', '"Reader v2"') }
          : f,
      );
      await emit("change");

      expect(await ctx.fs.readFile("/serve/reader.krs")).toContain("Reader v2");
      expect(shell.recompile).toHaveBeenCalled();
      expect(Number(screen.getByTestId("revision").textContent)).toBeGreaterThan(revision);
      // The entry's text did not change, so the view the user is on is kept.
      expect(dispatched("SELECT_FILE")).toEqual([]);
      expect(dispatched("UPDATE_FILE_CONTENT")).toEqual([]);
    });

    it("updates the entry's text in place when the entry itself changes", async () => {
      render(<ServeModeApp />);
      await screen.findByText("/serve/index.krs");
      ctx.dispatch.mockClear();

      const next = 'system Blog {\n  label "Blog v2"\n}\n';
      project = MULTI_FILE.map((f) => (f.path === "index.krs" ? { ...f, content: next } : f));
      await emit("change");

      expect(dispatched("UPDATE_FILE_CONTENT")).toEqual([
        { type: "UPDATE_FILE_CONTENT", content: next },
      ]);
      expect(dispatched("SELECT_FILE")).toEqual([]);
    });

    it("removes a file from the mirror when it is deleted, so its import reports File not found", async () => {
      render(<ServeModeApp />);
      await screen.findByText("/serve/index.krs");

      project = MULTI_FILE.filter((f) => f.path !== "reader.krs");
      await emit("unlink");

      expect(await ctx.fs.exists("/serve/reader.krs")).toBe(false);
      const result = await compileProject("/serve/index.krs", ctx.fs);
      expect(fileNotFound(result.diagnostics)).toHaveLength(1);
    });

    it("refetches on a reconnect, but not on the first open", async () => {
      render(<ServeModeApp />);
      await screen.findByText("/serve/index.krs");
      const afterLoad = projectFetches;

      await act(async () => {
        source?.emit("open");
      });
      expect(projectFetches).toBe(afterLoad);

      await emit("open");
      expect(projectFetches).toBe(afterLoad + 1);
    });
  });
});
