import { describe, it, expect } from "vitest";
import { compile } from "./compile.js";
import { parseNodePathRefId } from "../parser/node-path.js";

/**
 * #3113 (TPL-3113): every path the compile writes for a node opens that
 * node's own children when the app compiles it back. That covers a card's
 * `data-node-path` (which the app's click splits into the drill path), the
 * card's `nodeMetadataByPath` `viewPath`, and the node's `nodePathIndex`
 * `viewPath` (the permalink). A top-level `Api` shares its id with `Shop.Api`,
 * which is the case where these writers and the reader used to disagree.
 */
const SRC = `
system Shop {
  service Api { domain Orders { usecase Place {} } }
}
service Api { domain Parked { usecase P {} } }
`;

const nodeIds = (svg: string): string[] =>
  [...new Set([...svg.matchAll(/data-node-id="([^"]*)"/g)].map((m) => m[1]))].sort();

const drill = (viewPath: string[]): string[] =>
  nodeIds(compile(SRC, { diagramType: "system", viewPath }).svg);

/** Each card: the canvas it sits on, its `data-node-path`, and its node's children. */
const CARDS: { canvas: string[]; card: string; children: string[] }[] = [
  { canvas: [], card: "Api", children: ["Parked"] },
  { canvas: [], card: "Shop.Api", children: ["Orders"] },
  { canvas: ["Api"], card: "__unassigned__.Api.Parked", children: ["P"] },
  { canvas: ["Shop", "Api"], card: "Shop.Api.Orders", children: ["Place"] },
];

describe("a top-level node sharing its id with a system's child (#3113)", () => {
  it("opens the node's children from its permalink path", () => {
    // The app resolves `#krs-system-<id>` through the org compile's index.
    const org = compile(SRC, { diagramType: "org" });
    if (org.diagramType !== "org") throw new Error("expected the org view");
    expect(org.nodePathIndex.get("Parked")).toEqual(["Api", "Parked"]);
    expect(drill(["Api", "Parked"])).toEqual(["P"]);
  });

  it.each(CARDS)(
    "opens $card's children from its card on [$canvas]",
    ({ canvas, card, children }) => {
      const result = compile(SRC, { diagramType: "system", viewPath: canvas });
      if (result.diagramType !== "system") throw new Error("expected the system view");
      expect(result.svg).toContain(`data-node-path="${card}"`);
      expect(drill(parseNodePathRefId(card))).toEqual(children);
      const viewPath = result.nodeMetadataByPath.get(card)?.viewPath;
      expect(viewPath).toBeDefined();
      expect(drill(viewPath!)).toEqual(children);
    },
  );
});
