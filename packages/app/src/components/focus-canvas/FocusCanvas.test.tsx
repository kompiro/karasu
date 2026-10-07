// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render as rtlRender, fireEvent, cleanup, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { compile, type NodeMetadata } from "@karasu-tools/core";
import { PreviewPane } from "../PreviewPane.js";
import { LocaleProvider } from "../../i18n/index.js";
import { edgesOf, readFocusSource } from "./build.js";
import { CommandProvider, useCommandRegistry } from "../../keyboard/command-context.js";

afterEach(cleanup);

// The preview with a real diagram: the focus canvas reads the cards and edges
// of the SVG the pane shows (#3031).
const dense = readFileSync(
  resolve(__dirname, "../../../../core/src/renderer/fixtures/dense-domain-canvas.krs"),
  "utf8",
);
const denseSvg = compile(dense, { viewPath: ["Umami", "UmamiApp"] }).svg;
const source = readFocusSource(denseSvg);

function render(ui: ReactElement) {
  const wrap = (node: ReactElement) => <LocaleProvider initialLocale="en">{node}</LocaleProvider>;
  const result = rtlRender(wrap(ui));
  return { ...result, rerender: (next: ReactElement) => result.rerender(wrap(next)) };
}

const pane = (svg = denseSvg) => (
  <PreviewPane
    svg={svg}
    diagnostics={[]}
    nodeMetadata={new Map()}
    currentFilePath={null}
    displayRoot={null}
  />
);

const container = (root: HTMLElement) => root.querySelector<HTMLElement>(".preview-container")!;

/** A press and release without movement: what the pane counts as a click. */
function click(root: HTMLElement, target: Element) {
  fireEvent.mouseDown(container(root), { button: 0, clientX: 10, clientY: 10 });
  fireEvent.mouseUp(target, { button: 0, clientX: 10, clientY: 10 });
}

const edgeGroup = (root: HTMLElement, from: string, to: string) =>
  root.querySelector(
    `.preview-container svg .krs-edge[data-edge-from="${from}"][data-edge-to="${to}"]`,
  )!;

const canvas = (root: HTMLElement) => root.querySelector(".focus-canvas");
const title = (root: HTMLElement) => root.querySelector(".focus-canvas__title")?.textContent;
/** A lane's label, its wrapped lines joined back into one. */
const laneText = (lane: Element | null) =>
  [...(lane?.querySelectorAll("tspan") ?? [])].map((t) => t.textContent).join(" ");
const words = (s: string) => s.split(/\s+/).join(" ");

/** Hover a card, then press the pill that appears on it. */
async function openNode(root: HTMLElement, id: string) {
  const card = root.querySelector(`.preview-container svg [data-node-id="${id}"] rect`)!;
  fireEvent.mouseOver(card);
  const pill = root.querySelector<HTMLButtonElement>(".node-focus-pill")!;
  expect(pill.hidden).toBe(false);
  await userEvent.setup().click(pill);
}

describe("the focus canvas in the preview", () => {
  const edge = source.edges.find((e) => e.from === "Analytics" && e.to === "Identity")!;

  it("opens on an edge click, with its two cards and every edge between them", () => {
    const { container: root } = render(pane());
    click(root, edgeGroup(root, edge.from, edge.to).querySelector("path")!);

    expect(canvas(root)).not.toBeNull();
    expect(title(root)).toBe("Analytics → Identity & access");
    const lanes = [...root.querySelectorAll(".focus-canvas .focus-canvas__lane")];
    const between = source.edges.filter(
      (e) =>
        (e.from === edge.from && e.to === edge.to) || (e.from === edge.to && e.to === edge.from),
    );
    expect(lanes).toHaveLength(between.length);
    // The label in full, which the main canvas leaves off or cuts.
    expect(laneText(lanes[0])).toBe(words(edge.label));
  });

  it("does not open at the end of a pan", () => {
    const { container: root } = render(pane());
    fireEvent.mouseDown(container(root), { button: 0, clientX: 10, clientY: 10 });
    fireEvent.mouseUp(edgeGroup(root, edge.from, edge.to).querySelector("path")!, {
      button: 0,
      clientX: 60,
      clientY: 10,
    });
    expect(canvas(root)).toBeNull();
  });

  it("opens a node from the Relations pill, one lane per edge", async () => {
    const { container: root } = render(pane());
    await openNode(root, "Identity");

    const { incoming, outgoing } = edgesOf(source, "Identity");
    expect(title(root)).toBe("Identity & access");
    expect(root.querySelector(".focus-canvas__count")?.textContent).toBe(
      `${incoming.length} in · ${outgoing.length} out`,
    );
    expect(root.querySelectorAll(".focus-canvas .focus-canvas__lane")).toHaveLength(
      incoming.length + outgoing.length,
    );
  });

  it("dims the edges a hovered card does not touch, and shows how many it has", () => {
    const { container: root } = render(pane());
    const card = root.querySelector(`.preview-container svg [data-node-id="Identity"] rect`)!;
    fireEvent.mouseOver(card);
    const { incoming, outgoing } = edgesOf(source, "Identity");
    expect(root.querySelector(".node-focus-pill")?.textContent).toBe(
      `⇄ Relations ${incoming.length + outgoing.length}`,
    );
    const rule = [...document.head.querySelectorAll("style")].map((s) => s.textContent).join("");
    expect(rule).toContain('[data-edge-from="Identity"]');
    expect(rule).toContain("opacity:0.12");
    // Leaving the diagram takes the dim and the pill away.
    fireEvent.mouseLeave(container(root));
    expect(root.querySelector<HTMLElement>(".node-focus-pill")!.hidden).toBe(true);
  });

  it("walks the graph: a card moves to that node, a lane to that pair, Back returns", async () => {
    const { container: root } = render(pane());
    await openNode(root, "Identity");
    const user = userEvent.setup();

    await user.click(root.querySelector('.focus-canvas [data-focus-node="Teams"] rect')!);
    expect(title(root)).toBe("Teams");

    const lane = root.querySelector(
      '.focus-canvas [data-focus-from="Teams"][data-focus-to="Identity"] path',
    )!;
    await user.click(lane);
    expect(title(root)).toBe("Teams → Identity & access");

    await user.click(root.querySelector(".focus-canvas__back")!);
    expect(title(root)).toBe("Teams");
    await user.click(root.querySelector(".focus-canvas__back")!);
    expect(title(root)).toBe("Identity & access");
    expect(root.querySelector(".focus-canvas__back")).toBeNull();
  });

  it("closes from Close, Esc and the backdrop", async () => {
    const { container: root } = render(pane());
    const user = userEvent.setup();
    const open = () => click(root, edgeGroup(root, edge.from, edge.to).querySelector("path")!);

    open();
    await user.click(root.querySelector(".focus-canvas__close")!);
    expect(canvas(root)).toBeNull();

    open();
    await user.keyboard("{Escape}");
    expect(canvas(root)).toBeNull();

    open();
    await user.click(canvas(root)!);
    expect(canvas(root)).toBeNull();
  });

  it("moves the view on a drag, and a drag that ends on a card does not open it", async () => {
    const { container: root } = render(pane());
    await openNode(root, "Identity");
    const body = root.querySelector<HTMLElement>(".focus-canvas__body")!;
    const teams = root.querySelector('.focus-canvas [data-focus-node="Teams"] rect')!;

    // Press, move past the click threshold, release on a card: a pan.
    fireEvent.mouseDown(teams, { button: 0, clientX: 100, clientY: 100 });
    expect(body.hasAttribute("data-panning")).toBe(true);
    fireEvent.mouseMove(teams, { clientX: 160, clientY: 130 });
    // Released inside the canvas, where the overlay keeps the event from
    // bubbling: the pan must still end.
    fireEvent.mouseUp(teams, { clientX: 160, clientY: 130 });
    fireEvent.click(teams);
    expect(title(root)).toBe("Identity & access");
    expect(body.hasAttribute("data-panning")).toBe(false);

    // Press and release in place: a click, which moves to that node.
    fireEvent.mouseDown(teams, { button: 0, clientX: 100, clientY: 100 });
    fireEvent.mouseUp(teams, { clientX: 101, clientY: 100 });
    fireEvent.click(teams);
    expect(title(root)).toBe("Teams");
  });

  it("leaves a press on a label to text selection, and does not navigate after one", async () => {
    const { container: root } = render(pane());
    await openNode(root, "Identity");
    const body = root.querySelector<HTMLElement>(".focus-canvas__body")!;
    const label = root.querySelector(
      '.focus-canvas [data-focus-from="Teams"][data-focus-to="Identity"] .focus-canvas__label tspan',
    )!;

    // No pan starts, so nothing prevents the browser from selecting.
    const press = fireEvent.mouseDown(label, { button: 0, clientX: 100, clientY: 100 });
    expect(press).toBe(true); // not default-prevented
    expect(body.hasAttribute("data-panning")).toBe(false);

    // A selection made over the label: its click does not move to the pair.
    const range = document.createRange();
    range.selectNodeContents(label);
    window.getSelection()!.removeAllRanges();
    window.getSelection()!.addRange(range);
    fireEvent.click(label);
    expect(title(root)).toBe("Identity & access");

    // Without a selection, the same click still moves to the pair.
    window.getSelection()!.removeAllRanges();
    fireEvent.click(label);
    expect(title(root)).toBe("Teams → Identity & access");
  });

  it("leaves a press on a card's text to text selection too", async () => {
    const { container: root } = render(pane());
    await openNode(root, "Identity");
    const body = root.querySelector<HTMLElement>(".focus-canvas__body")!;
    const name = root.querySelector('.focus-canvas [data-focus-node="Teams"] text')!;

    expect(fireEvent.mouseDown(name, { button: 0, clientX: 100, clientY: 100 })).toBe(true);
    expect(body.hasAttribute("data-panning")).toBe(false);

    const range = document.createRange();
    range.selectNodeContents(name);
    window.getSelection()!.removeAllRanges();
    window.getSelection()!.addRange(range);
    fireEvent.click(name);
    expect(title(root)).toBe("Identity & access");

    window.getSelection()!.removeAllRanges();
    fireEvent.click(name);
    expect(title(root)).toBe("Teams");
  });

  it("stays open when a drag that began in the canvas ends on the backdrop", async () => {
    const { container: root } = render(pane());
    await openNode(root, "Identity");
    const card = root.querySelector('.focus-canvas [data-focus-node="Teams"] rect')!;
    const backdrop = canvas(root)!;

    fireEvent.mouseDown(card, { button: 0, clientX: 100, clientY: 100 });
    fireEvent.mouseMove(window, { clientX: 400, clientY: 100 });
    fireEvent.mouseUp(window, { clientX: 400, clientY: 100 });
    // The browser sends the click to the common ancestor: the backdrop.
    fireEvent.click(backdrop);
    expect(canvas(root)).not.toBeNull();

    // A press and release on the backdrop itself still closes it.
    fireEvent.mouseDown(backdrop, { button: 0 });
    fireEvent.click(backdrop);
    expect(canvas(root)).toBeNull();
  });

  it("leaves Esc in a text field to that field", () => {
    const { container: root } = render(
      <>
        <textarea aria-label="editor" />
        {pane()}
      </>,
    );
    click(root, edgeGroup(root, edge.from, edge.to).querySelector("path")!);
    fireEvent.keyDown(root.querySelector("textarea")!, { key: "Escape" });
    expect(canvas(root)).not.toBeNull();
  });

  it("keeps the pill and the copied cards out of queries for cards", async () => {
    const { container: root } = render(pane());
    await openNode(root, "Identity");
    // Only the main canvas answers to a card id; the copies and the pill do not.
    expect(root.querySelectorAll('[data-node-id="Identity"]')).toHaveLength(1);
    expect(root.querySelectorAll('[data-node-id="Teams"]')).toHaveLength(1);
  });

  it("keeps a press on the canvas from reaching the diagram under it", async () => {
    const { container: root } = render(pane());
    click(root, edgeGroup(root, edge.from, edge.to).querySelector("path")!);
    // A click on a card in the focus canvas refocuses; it does not drill down
    // or open the node detail panel underneath.
    await userEvent
      .setup()
      .click(root.querySelector('.focus-canvas [data-focus-node="Identity"] rect')!);
    expect(title(root)).toBe("Identity & access");
    expect(root.querySelector(".node-detail-panel")).toBeNull();
  });

  it("follows the diagram, and closes when an edit removes what it shows", () => {
    const { container: root, rerender } = render(pane());
    click(root, edgeGroup(root, edge.from, edge.to).querySelector("path")!);

    const relabelled = compile(dense.replace(edge.label, "authorizes requests"), {
      viewPath: ["Umami", "UmamiApp"],
    }).svg;
    act(() => rerender(pane(relabelled)));
    expect(laneText(root.querySelector(".focus-canvas .focus-canvas__lane"))).toBe(
      "authorizes requests",
    );

    const without = compile(dense.replace(`-> Identity "${edge.label}"`, ""), {
      viewPath: ["Umami", "UmamiApp"],
    }).svg;
    expect(without).not.toContain('data-edge-from="Analytics" data-edge-to="Identity"');
    act(() => rerender(pane(without)));
    expect(canvas(root)).toBeNull();
  });

  it("draws every edge the pill counts, an edge to a database included", async () => {
    const example = readFileSync(
      resolve(__dirname, "../../../../../examples/en/feature-samples/boundary-clusters.krs"),
      "utf8",
    );
    const { container: root } = render(pane(compile(example).svg));
    const card = root.querySelector(`.preview-container svg [data-node-id="Checkout"] rect`)!;
    fireEvent.mouseOver(card);
    const count = Number(/(\d+)$/.exec(root.querySelector(".node-focus-pill")!.textContent!)![1]);
    await userEvent.setup().click(root.querySelector(".node-focus-pill")!);
    const lanes = [...root.querySelectorAll(".focus-canvas .focus-canvas__lane")];
    expect(lanes).toHaveLength(count);
    expect(lanes.map((l) => l.getAttribute("data-focus-to"))).toContain("OrderDB");
  });

  it("leaves an aggregated edge to its detail panel", () => {
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg">` +
      `<g data-node-id="A"><rect x="0" y="0" width="100" height="40"/><text>A</text></g>` +
      `<g data-node-id="B"><rect x="200" y="0" width="100" height="40"/><text>B</text></g>` +
      `<g class="krs-edge" data-edge-from="A" data-edge-to="B"><path d="M 100 20 L 200 20" stroke="#999"/>` +
      `<g data-domain-edges='[{"fromDomainId":"A","fromDomainLabel":"A","toDomainId":"B","toDomainLabel":"B"}]'><text>1 domain edge</text></g></g>` +
      `</svg>`;
    const { container: root } = render(pane(svg));
    click(root, root.querySelector(".krs-edge path")!);
    expect(canvas(root)).toBeNull();
  });
});

describe("keyboard and touch routes into the focus canvas (#3057)", () => {
  const relations = (id: string) => {
    const { incoming, outgoing } = edgesOf(source, id);
    return incoming.length + outgoing.length;
  };

  /** The pane under a command registry, with a handle on the registry. */
  function paneWithCommands(highlightedNodeId: string | null) {
    let registry!: ReturnType<typeof useCommandRegistry>;
    function Probe() {
      registry = useCommandRegistry();
      return null;
    }
    const result = render(
      <CommandProvider>
        <Probe />
        <PreviewPane
          svg={denseSvg}
          diagnostics={[]}
          nodeMetadata={new Map([["Identity", identityMetadata]])}
          currentFilePath={null}
          displayRoot={null}
          highlightedNodeId={highlightedNodeId}
        />
      </CommandProvider>,
    );
    const run = () =>
      act(() =>
        registry
          .getCommands()
          .find((c) => c.id === "view.showRelations")!
          .run(),
      );
    return { ...result, registry: () => registry, run };
  }

  const identityMetadata: NodeMetadata = {
    kind: "domain",
    label: "Identity & access",
    description: "",
    links: [],
    tags: [],
    annotations: [],
    hasChildren: true,
  };

  it("offers Relations in the node detail panel, which a tap opens", async () => {
    // The app draws each card's ⓘ (`nodeControls`); a tap on it opens the panel.
    const withControls = compile(dense, {
      viewPath: ["Umami", "UmamiApp"],
      interactive: true,
      nodeControls: true,
    }).svg;
    const { container: root } = render(
      <PreviewPane
        svg={withControls}
        diagnostics={[]}
        nodeMetadata={new Map([["Identity", identityMetadata]])}
        currentFilePath={null}
        displayRoot={null}
      />,
    );
    // ⓘ opens the panel (a tap is a click without movement).
    const info = root.querySelector('.preview-container svg [data-info-button="Identity"]');
    expect(info).not.toBeNull();
    click(root, info!);
    const button = [...root.querySelectorAll(".node-detail-panel button")].find((b) =>
      b.textContent?.startsWith("⇄ Relations"),
    );
    expect(button?.textContent).toBe(`⇄ Relations ${relations("Identity")}`);

    await userEvent.setup().click(button!);
    expect(title(root)).toBe("Identity & access");
    expect(root.querySelectorAll(".focus-canvas .focus-canvas__lane")).toHaveLength(
      relations("Identity"),
    );
    // The panel gave way to the canvas.
    expect(root.querySelector(".node-detail-panel")).toBeNull();
  });

  it("shows no Relations button for a node with no edges", () => {
    const lone =
      `<svg xmlns="http://www.w3.org/2000/svg">` +
      `<g data-node-id="Lone" data-has-children="false"><rect x="0" y="0" width="100" height="40"/>` +
      `<text>Lone</text></g></svg>`;
    const { container: root } = render(
      <PreviewPane
        svg={lone}
        diagnostics={[]}
        nodeMetadata={
          new Map([["Lone", { ...identityMetadata, label: "Lone", hasChildren: false }]])
        }
        currentFilePath={null}
        displayRoot={null}
      />,
    );
    // A leaf card opens the panel.
    click(root, root.querySelector('[data-node-id="Lone"] rect')!);
    expect(root.querySelector(".node-detail-panel")).not.toBeNull();
    const labels = [...root.querySelectorAll(".node-detail-panel button")].map(
      (b) => b.textContent,
    );
    expect(labels.some((l) => l?.startsWith("⇄"))).toBe(false);
  });

  it("registers a palette-only command that opens the highlighted node", () => {
    const { container: root, registry, run } = paneWithCommands("Identity");
    const command = registry()
      .getCommands()
      .find((c) => c.id === "view.showRelations");
    expect(command?.title).toBe("Show Relations of Highlighted Node");
    expect(command?.keybinding).toBeUndefined();
    run();
    expect(title(root)).toBe("Identity & access");
  });

  it("opens nothing without a highlighted node, or for one not on this level", () => {
    const none = paneWithCommands(null);
    none.run();
    expect(canvas(none.container)).toBeNull();
    cleanup();
    // Highlighted in the Outline, but its card is on another level.
    const elsewhere = paneWithCommands("SomeDeepNode");
    elsewhere.run();
    expect(canvas(elsewhere.container)).toBeNull();
  });

  it("is a set of buttons to the keyboard: focus moves in, Enter moves on, focus returns", async () => {
    const { container: root, run } = paneWithCommands("Identity");
    const before = document.createElement("button");
    document.body.appendChild(before);
    before.focus();
    run();

    // Focus is on the canvas, not left behind on the page.
    const panel = root.querySelector<HTMLElement>(".focus-canvas__panel")!;
    expect(document.activeElement).toBe(panel);

    // The neighbours and the lanes are buttons; the node itself is not.
    const teams = root.querySelector('.focus-canvas [data-focus-node="Teams"]')!;
    expect(teams.getAttribute("tabindex")).toBe("0");
    expect(teams.getAttribute("role")).toBe("button");
    expect(teams.getAttribute("aria-label")).toBe("Teams");
    expect(
      root.querySelector('.focus-canvas [data-focus-node="Identity"]')!.hasAttribute("tabindex"),
    ).toBe(false);
    const lane = root.querySelector(
      '.focus-canvas [data-focus-from="Teams"][data-focus-to="Identity"]',
    )!;
    expect(lane.getAttribute("role")).toBe("button");
    expect(lane.getAttribute("aria-label")).toMatch(/^Teams → Identity & access: /);

    // Enter on a lane moves to that pair; focus comes back to the panel.
    (lane as unknown as HTMLElement).focus();
    fireEvent.keyDown(lane, { key: "Enter" });
    expect(title(root)).toBe("Teams → Identity & access");
    expect(document.activeElement).toBe(root.querySelector(".focus-canvas__panel"));

    // Space on a card moves to that node.
    const card = root.querySelector('.focus-canvas [data-focus-node="Teams"]')!;
    fireEvent.keyDown(card, { key: " " });
    expect(title(root)).toBe("Teams");

    // Closing hands focus back to where it was.
    await userEvent.setup().keyboard("{Escape}");
    expect(canvas(root)).toBeNull();
    expect(document.activeElement).toBe(before);
    before.remove();
  });

  it("makes no lane a button on an edge's canvas, where a lane leads nowhere", () => {
    const { container: root } = render(pane());
    click(root, edgeGroup(root, "Analytics", "Identity").querySelector("path")!);
    for (const lane of root.querySelectorAll(".focus-canvas .focus-canvas__lane")) {
      expect(lane.hasAttribute("tabindex")).toBe(false);
    }
    // Both cards still move to their node.
    expect(root.querySelectorAll('.focus-canvas .focus-canvas__card[role="button"]')).toHaveLength(
      2,
    );
  });
});
