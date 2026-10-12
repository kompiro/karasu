import { beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Parser } from "../parser/parser.js";
import { compile } from "../compile/compile.js";
import type { SvgResult } from "./all-layers-svg.js";
import { buildAllLayersSvg } from "./all-layers-svg.js";
import { buildAllViewsSvg, buildDrillDownSvg } from "./drill-down-svg.js";
import { resetRegistryToBuiltins } from "./shapes.js";

// #2933: a static bundle has room for one `<g id="krs-<view>-<id>">` level per
// anchor id, and two nodes can share an id (two systems' `Api`, two services'
// `Core`). The bundle emits the level of the node the SPA resolves the same
// fragment to (`nodePathIndex`, TPL-1583 / TPL-1827), walks every other node at
// its own path so a uniquely named descendant keeps its level, and links a card
// only to its own level. AT-2933.

beforeEach(() => {
  resetRegistryToBuiltins();
});

const TWO_SYSTEMS = `
system Shop {
  service Api { domain Orders { usecase Place {} } }
  service Worker {}
}
system Admin {
  service Api { domain Users { usecase Invite {} } }
}
`;

const MIGRATION_TARGET = `
system Shop {
  service Api { domain Orders { usecase Place {} } }
}
system Admin {
  service Api @migration_target { domain Users { usecase Invite {} } }
}
`;

const ONE_SYSTEM_SHARED_DOMAIN = `
system Shop {
  service Legacy @deprecated { domain Core { entity Old {} usecase X {} } }
  service Next @migration_target { domain Core { entity New {} usecase Y {} } }
}
`;

const PARKED = `
system Shop {
  service Api { domain Orders { usecase Place {} } }
}
service Api { domain Parked { usecase P {} } }
`;

interface Level {
  id: string;
  body: string;
}

const levelsOf = (svg: string): Level[] => {
  const starts = [...svg.matchAll(/<g id="(krs-(?:system|entity)-[^"]+)" class="krs-view[^"]*">/g)];
  return starts.map((m, i) => ({
    id: m[1],
    body: svg.slice(m.index, starts[i + 1]?.index ?? svg.length),
  }));
};

const nodePaths = (s: string): string[] =>
  [...new Set([...s.matchAll(/data-node-path="([^"]+)"/g)].map((m) => m[1]))].sort();

const levelIds = (svg: string): string[] => levelsOf(svg).map((l) => l.id);

const levelNamed = (svg: string, id: string): Level => {
  const matches = levelsOf(svg).filter((l) => l.id === id);
  expect(matches).toHaveLength(1);
  return matches[0];
};

const backTarget = (level: Level): string | undefined =>
  /<a href="#([^"]+)" tabindex="0"><g class="krs-back-button"/.exec(level.body)?.[1];

/** Card paths wrapped in a link to `anchor` on this level. */
const linkedCards = (level: Level, anchor: string): string[] =>
  [
    ...level.body.matchAll(
      new RegExp(`<a href="#${anchor}"><g data-node-id="[^"]+" data-node-path="([^"]+)"`, "g"),
    ),
  ].map((m) => m[1]);

const BUILDERS: [string, (src: string) => SvgResult][] = [
  ["buildDrillDownSvg", (src) => buildDrillDownSvg(Parser.parse(src).value)],
  ["buildAllViewsSvg", (src) => buildAllViewsSvg(Parser.parse(src).value)],
];

describe.each(BUILDERS)("%s: one level per anchor id (#2933)", (_name, build) => {
  it("emits each anchor id once", () => {
    for (const src of [TWO_SYSTEMS, MIGRATION_TARGET, ONE_SYSTEM_SHARED_DOMAIN, PARKED]) {
      const ids = levelIds(build(src).svg);
      expect(ids).toEqual([...new Set(ids)]);
    }
  });

  it("shows the node the SPA resolves the same anchor to, for every anchor", () => {
    // PARKED is left out: the SPA's own extraction of `nodePathIndex.get("Parked")`
    // (`["Api", "Parked"]`) resolves through Shop.Api and comes back empty (#3113),
    // so there is no SPA view to compare with. The bundle's level is pinned below.
    for (const src of [TWO_SYSTEMS, MIGRATION_TARGET, ONE_SYSTEM_SHARED_DOMAIN]) {
      const index = Parser.parse(src).value.nodePathIndex;
      for (const level of levelsOf(build(src).svg)) {
        const system = /^krs-system-(.+)$/.exec(level.id);
        if (system === null || system[1] === "root") continue;
        const spa = compile(src, {
          diagramType: "system",
          viewPath: index.get(system[1]),
        });
        if (spa.diagramType !== "system") throw new Error("expected the system view");
        expect({ [level.id]: nodePaths(level.body) }).toEqual({ [level.id]: nodePaths(spa.svg) });
      }
    }
  });

  it("draws the later system's subtree from its own nodes", () => {
    const svg = build(TWO_SYSTEMS).svg;
    expect(nodePaths(levelNamed(svg, "krs-system-Api").body)).toEqual(["Shop.Api.Orders"]);
    expect(nodePaths(levelNamed(svg, "krs-system-Users").body)).toEqual(["Admin.Api.Users.Invite"]);
  });

  it("follows @migration_target to the later system", () => {
    const svg = build(MIGRATION_TARGET).svg;
    expect(nodePaths(levelNamed(svg, "krs-system-Api").body)).toEqual(["Admin.Api.Users"]);
    // The first system's Api emits no level, but its unique domain still does.
    expect(nodePaths(levelNamed(svg, "krs-system-Orders").body)).toEqual(["Shop.Api.Orders.Place"]);
  });

  it("dedupes a domain id shared by two services of one system, and its entity view", () => {
    const svg = build(ONE_SYSTEM_SHARED_DOMAIN).svg;
    expect(nodePaths(levelNamed(svg, "krs-system-Core").body)).toEqual(["Shop.Next.Core.Y"]);
    expect(nodePaths(levelNamed(svg, "krs-entity-Core").body)).toEqual(["Shop.Next.Core.New"]);
  });

  it("draws a top-level node's subtree under the Unassigned frame", () => {
    const svg = build(PARKED).svg;
    expect(nodePaths(levelNamed(svg, "krs-system-Api").body)).toEqual(["Shop.Api.Orders"]);
    expect(nodePaths(levelNamed(svg, "krs-system-Parked").body)).toEqual([
      "__unassigned__.Api.Parked.P",
    ]);
  });
});

describe("examples/en/migration: the bundle opens the migration target (#2933)", () => {
  const src = readFileSync(
    resolve(
      dirname(fileURLToPath(import.meta.url)),
      "../../../../examples/en/migration/system.krs",
    ),
    "utf8",
  );

  it.each(BUILDERS)(
    "%s: #krs-system-Order is OrderService's Order, not the deprecated one",
    (_n, build) => {
      const svg = build(src).svg;
      const order = nodePaths(levelNamed(svg, "krs-system-Order").body);
      expect(order).toContain("ECommercePlatform.OrderService.Order.CancelOrder");
      expect(order.filter((p) => p.includes("LegacyMonolith"))).toEqual([]);
      const catalog = nodePaths(levelNamed(svg, "krs-system-Catalog").body);
      expect(catalog).toContain("ECommercePlatform.CatalogService.Catalog.UpdateProduct");
      expect(catalog.filter((p) => p.includes("LegacyMonolith"))).toEqual([]);
    },
  );
});

describe("links and back buttons around a same-id node (#2933)", () => {
  it("links only the card whose own level the anchor names", () => {
    const root = levelNamed(
      buildDrillDownSvg(Parser.parse(TWO_SYSTEMS).value).svg,
      "krs-system-root",
    );
    expect(linkedCards(root, "krs-system-Api")).toEqual(["Shop.Api"]);
    // Admin's Api card is still drawn, unlinked.
    expect(root.body).toContain('data-node-path="Admin.Api"');

    const migrated = levelNamed(
      buildDrillDownSvg(Parser.parse(MIGRATION_TARGET).value).svg,
      "krs-system-root",
    );
    expect(linkedCards(migrated, "krs-system-Api")).toEqual(["Admin.Api"]);
  });

  it("links a top-level card by its root path, not the system card that shares its id", () => {
    const root = levelNamed(buildDrillDownSvg(Parser.parse(PARKED).value).svg, "krs-system-root");
    expect(linkedCards(root, "krs-system-Api")).toEqual(["Shop.Api"]);
  });

  it("points a back button past an ancestor whose anchor names another node", () => {
    const svg = buildDrillDownSvg(Parser.parse(TWO_SYSTEMS).value).svg;
    expect(backTarget(levelNamed(svg, "krs-system-Users"))).toBe("krs-system-root");
    expect(backTarget(levelNamed(svg, "krs-system-Orders"))).toBe("krs-system-Api");
    expect(
      backTarget(
        levelNamed(buildDrillDownSvg(Parser.parse(PARKED).value).svg, "krs-system-Parked"),
      ),
    ).toBe("krs-system-root");
  });

  it("keeps the links and back buttons of a model without shared ids", () => {
    const src = `
system Shop {
  service Api { domain Orders { usecase Place {} } }
}
system Admin {
  service Console { domain Users { usecase Invite {} } }
}
`;
    const svg = buildDrillDownSvg(Parser.parse(src).value).svg;
    const root = levelNamed(svg, "krs-system-root");
    expect(linkedCards(root, "krs-system-Api")).toEqual(["Shop.Api"]);
    expect(linkedCards(root, "krs-system-Console")).toEqual(["Admin.Console"]);
    expect(backTarget(levelNamed(svg, "krs-system-Users"))).toBe("krs-system-Console");
  });
});

describe("buildAllLayersSvg draws same-id nodes at their own paths (#2933)", () => {
  const bandLabels = (svg: string): string[] =>
    [...svg.matchAll(/font-weight="600"[^>]*>([^<]+)</g)].map((m) => m[1]);

  it("labels each band from its own system and draws the later subtree", () => {
    const svg = buildAllLayersSvg(Parser.parse(TWO_SYSTEMS).value).svg;
    expect(bandLabels(svg)).toEqual([
      "Shop",
      "Shop › Api",
      "Shop › Api › Orders",
      "Admin › Api",
      "Admin › Api › Users",
    ]);
    expect(svg).toContain('data-node-path="Admin.Api.Users.Invite"');
  });
});
