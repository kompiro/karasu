import { describe, it, expect } from "vitest";
import { getBuiltinStyleSheet } from "./default-style.js";
import { INFRA_SUB_KIND_TO_TAG, resolveStyles } from "../resolver/style-resolver.js";
import type { DiagramTheme } from "../renderer/palette.js";
import type { KrsNode } from "../types/ast.js";

/**
 * An infra leaf has no colours of its own: each theme's builtin sheet gives it
 * its store's (#3777). The theme-colour guard (`theme-colour-sources.test.ts`)
 * only proves the leaf's colours come from the theme; this proves they are its
 * store's, so wiring `table` to `queue`'s colours fails here.
 */
const STORE_OF_LEAF: Record<string, KrsNode["kind"]> = {
  table: "database",
  "queue-item": "queue",
  bucket: "storage",
};

function node(kind: string, id: string, children: KrsNode[] = []): KrsNode {
  return {
    id,
    kind,
    label: id,
    tags: [],
    annotations: [],
    edges: [],
    children,
    properties: { links: [] },
  } as unknown as KrsNode;
}

describe.each(["dark", "light"] as DiagramTheme[])("infra leaf colours (%s theme)", (theme) => {
  // `INFRA_SUB_KIND_TO_TAG` keys are the leaf kinds; a leaf added there without
  // a store here fails before its colours go unchecked.
  it("names the store of every infra leaf kind", () => {
    expect(Object.keys(STORE_OF_LEAF).sort()).toEqual(Object.keys(INFRA_SUB_KIND_TO_TAG).sort());
  });

  it.each(Object.entries(STORE_OF_LEAF))("%s takes the colours of its %s", (leaf, store) => {
    const system = node("system", "S", [node(store, "Store", [node(leaf, "Leaf")])]);
    const styles = resolveStyles([system], [getBuiltinStyleSheet(theme)]);
    const storeStyle = styles.nodesByPath.get("S.Store");
    const leafStyle = styles.nodesByPath.get("S.Store.Leaf");
    expect(storeStyle, "the store resolved no style").toBeDefined();
    expect(leafStyle, "the leaf resolved no style").toBeDefined();
    const colours = (s: typeof storeStyle) => [s?.backgroundColor, s?.color, s?.borderColor];
    expect(colours(leafStyle)).toEqual(colours(storeStyle));
    // Only the colours: the shape stays the leaf's own.
    expect(leafStyle?.shape).not.toEqual(storeStyle?.shape);
  });
});
