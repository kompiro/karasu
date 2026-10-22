// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { InMemoryFileSystemProvider } from "@karasu-tools/core";
import { mountViewer, type ViewerHandle, type ViewerOptions } from "./mount-viewer.js";

// The seams a host drives the viewer through (#3311). Each test mounts the
// real viewer, so what is asserted is what a host would see on the page.

const ENTRY = "/p/index.krs";
const STYLE = "/p/app.krs.style";
const OTHER = "/p/other.krs";

const INDEX = `@import "app.krs.style"
import { Billing } from "./billing.krs"

system Shop {
  service Api {
    label "Api"
    domain Orders { label "Orders" }
  }
  service Web {
    label "Web"
    link "https://example.com/web" "Runbook"
  }
  Web -> Api
}
`;

const BILLING = `system Shop {
  service Billing { label "Billing" }
}
`;

const OTHER_KRS = `system Other {
  service Solo { label "Solo" }
}
`;

let handle: ViewerHandle | null = null;
let host: HTMLElement | null = null;

afterEach(() => {
  handle?.unmount();
  handle = null;
  host?.remove();
  host = null;
  // The viewer keeps the drill position in the URL hash and the theme and
  // language in storage, as the app does; the next mount would restore them.
  window.history.replaceState(null, "", "/");
  localStorage.clear();
});

async function projectFs() {
  const fs = new InMemoryFileSystemProvider();
  await fs.writeFile(ENTRY, INDEX);
  await fs.writeFile(STYLE, "service { color: #FF0000; }");
  await fs.writeFile("/p/billing.krs", BILLING);
  await fs.writeFile(OTHER, OTHER_KRS);
  return fs;
}

function mount(options: ViewerOptions): HTMLElement {
  host = document.createElement("div");
  document.body.appendChild(host);
  handle = mountViewer(host, { initialLocale: "en", initialTheme: "light", ...options });
  return host;
}

const nodeIds = (el: HTMLElement) =>
  [...el.querySelectorAll("[data-node-id]")].map((n) => n.getAttribute("data-node-id"));

const node = (el: HTMLElement, id: string) => el.querySelector(`[data-node-id='${id}']`);

async function shows(el: HTMLElement, id: string) {
  await waitFor(() => expect(node(el, id)).not.toBeNull(), { timeout: 3000 });
}

/** A click as `PreviewPane` reads one: mousedown on the pane, mouseup on the target. */
function click(el: HTMLElement, target: Element, init: MouseEventInit = {}) {
  const pane = el.querySelector(".preview-container")!;
  fireEvent.mouseDown(pane, { button: 0, clientX: 10, clientY: 10 });
  fireEvent.mouseUp(target, { button: 0, clientX: 10, clientY: 10, ...init });
}

async function drillIntoApi(el: HTMLElement) {
  await shows(el, "Api");
  click(el, node(el, "Api")!);
  await shows(el, "Orders");
  expect(node(el, "Web")).toBeNull();
}

describe("mountViewer — gallery (source only)", () => {
  it("shows the submission with the theme and language switches and no Share", async () => {
    const el = mount({ source: OTHER_KRS });
    await shows(el, "Solo");
    expect(screen.getByRole("button", { name: "Switch to Japanese" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Share/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Export SVG" })).toBeTruthy();
  });
});

describe("mountViewer — host file system", () => {
  it("re-reads a changed file and keeps the drill position", async () => {
    const fs = await projectFs();
    const el = mount({ fs, entryPath: ENTRY });
    await drillIntoApi(el);

    await fs.writeFile(
      ENTRY,
      INDEX.replace(
        `domain Orders { label "Orders" }`,
        `domain Orders { label "Orders" }\n    domain Payments { label "Payments" }`,
      ),
    );
    handle!.filesChanged([ENTRY]);
    await shows(el, "Payments");
    expect(node(el, "Web")).toBeNull();
  });

  it("redraws on a style-only edit", async () => {
    const fs = await projectFs();
    const el = mount({ fs, entryPath: ENTRY });
    await drillIntoApi(el);
    expect(el.innerHTML).toMatch(/#ff0000/i);

    await fs.writeFile(STYLE, "service { color: #00FF00; }");
    handle!.filesChanged([STYLE]);
    await waitFor(() => expect(el.innerHTML).toMatch(/#00ff00/i), { timeout: 3000 });
    expect(node(el, "Orders")).not.toBeNull();
  });

  it("opens another entry and starts the view over", async () => {
    const fs = await projectFs();
    const el = mount({ fs, entryPath: ENTRY });
    await drillIntoApi(el);

    handle!.setEntry(OTHER);
    await shows(el, "Solo");
    expect(nodeIds(el)).not.toContain("Orders");
  });

  it("applies a call made before the first render", async () => {
    const fs = await projectFs();
    const el = mount({ fs, entryPath: ENTRY });
    handle!.setEntry(OTHER);
    await shows(el, "Solo");
    expect(nodeIds(el)).not.toContain("Api");
  });

  it("switches theme and language without losing the view", async () => {
    const fs = await projectFs();
    const el = mount({ fs, entryPath: ENTRY });
    await drillIntoApi(el);

    handle!.setTheme("dark");
    handle!.setLocale("ja");
    await waitFor(() => expect(document.documentElement.getAttribute("data-theme")).toBe("dark"));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "フォーカスモードに入る" })).toBeTruthy(),
    );
    expect(node(el, "Orders")).not.toBeNull();
  });

  it("switches the display mode", async () => {
    const fs = await projectFs();
    const el = mount({ fs, entryPath: ENTRY });
    await shows(el, "Api");
    const before = el.querySelector(".preview-container")!.innerHTML;

    handle!.setDisplayMode("icon");
    // The redraw replaces the diagram, so wait for the node to be back too.
    await waitFor(
      () => {
        expect(el.querySelector(".preview-container")!.innerHTML).not.toBe(before);
        expect(node(el, "Api")).not.toBeNull();
      },
      { timeout: 3000 },
    );
  });

  it("highlights the node the host names, and again after a clear", async () => {
    const fs = await projectFs();
    const el = mount({ fs, entryPath: ENTRY });
    await shows(el, "Web");

    handle!.highlight("Web");
    await waitFor(() => expect(node(el, "Web")!.classList).toContain("karasu-highlighted"));
    handle!.highlight(null);
    await waitFor(() => expect(node(el, "Web")!.classList).not.toContain("karasu-highlighted"));
    handle!.highlight("Web");
    await waitFor(() => expect(node(el, "Web")!.classList).toContain("karasu-highlighted"));
  });
});

describe("mountViewer — host callbacks", () => {
  it("offers no jump without onRevealNode", async () => {
    const fs = await projectFs();
    const el = mount({ fs, entryPath: ENTRY });
    await shows(el, "Web");
    click(el, node(el, "Web")!);
    await screen.findByText(/Runbook/);
    expect(screen.queryByText(/Jump to editor/)).toBeNull();
  });

  it("hands the host the node and the file that defines it", async () => {
    const onRevealNode = vi.fn<(nodeId: string, filePath: string) => void>();
    const fs = await projectFs();
    const el = mount({ fs, entryPath: ENTRY, onRevealNode });
    await shows(el, "Billing");

    // Cmd+click on a drillable node jumps instead of drilling (ADR-177).
    click(el, node(el, "Api")!, { metaKey: true });
    expect(onRevealNode).toHaveBeenLastCalledWith("Api", ENTRY);
    expect(node(el, "Web")).not.toBeNull();

    // A node from an imported file names that file, not the entry.
    click(el, node(el, "Billing")!, { ctrlKey: true });
    expect(onRevealNode).toHaveBeenLastCalledWith("Billing", "/p/billing.krs");

    click(el, node(el, "Web")!);
    fireEvent.click(await screen.findByText(/Jump to editor/));
    expect(onRevealNode).toHaveBeenLastCalledWith("Web", ENTRY);
  });

  it("hands external links to onOpenExternal instead of following them", async () => {
    const onOpenExternal = vi.fn<(url: string) => void>();
    const fs = await projectFs();
    const el = mount({ fs, entryPath: ENTRY, onOpenExternal });
    await shows(el, "Web");
    click(el, node(el, "Web")!);
    const link = await screen.findByText(/Runbook/);

    const followed = fireEvent.click(link);
    expect(followed).toBe(false);
    expect(onOpenExternal).toHaveBeenCalledWith("https://example.com/web");
  });

  it("opens no edge menu when read-only", async () => {
    const fs = await projectFs();
    const el = mount({ fs, entryPath: ENTRY, readOnly: true });
    await shows(el, "Web");
    const edge = el.querySelector("[data-edge-canonical-id]")!;
    fireEvent.contextMenu(edge, { clientX: 50, clientY: 60 });
    expect(document.querySelector(".edge-context-menu")).toBeNull();
  });

  it("opens the edge menu when the host can write", async () => {
    const fs = await projectFs();
    const el = mount({ fs, entryPath: ENTRY });
    await shows(el, "Web");
    const edge = el.querySelector("[data-edge-canonical-id]")!;
    fireEvent.contextMenu(edge, { clientX: 50, clientY: 60 });
    await waitFor(() => expect(document.querySelector(".edge-context-menu")).not.toBeNull());
  });
});
