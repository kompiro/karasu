// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render as rtlRender, fireEvent, cleanup, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { compile } from "@karasu-tools/core";
import { PreviewPane } from "../PreviewPane.js";
import { LocaleProvider } from "../../i18n/index.js";
import { edgesOf, readFocusSource } from "./build.js";

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
    fireEvent.mouseMove(window, { clientX: 160, clientY: 130 });
    fireEvent.mouseUp(window, { clientX: 160, clientY: 130 });
    fireEvent.click(teams);
    expect(title(root)).toBe("Identity & access");
    expect(body.hasAttribute("data-panning")).toBe(false);

    // Press and release in place: a click, which moves to that node.
    fireEvent.mouseDown(teams, { button: 0, clientX: 100, clientY: 100 });
    fireEvent.mouseUp(window, { clientX: 101, clientY: 100 });
    fireEvent.click(teams);
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
