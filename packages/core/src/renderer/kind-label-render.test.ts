// Guard for TPL-74 checklist item 4: a renderer path draws a node's `label`,
// falling back to its id only when the label is unset, and never prints the
// id over a label the author wrote.
//
// The closed sets are `KrsNode["kind"]` × the surfaces a kind is drawn on
// (`DiagramType`, plus the entity sub-mode of a domain) × `DisplayMode`.
//
//   - `KIND_SURFACES` is a `Record` over `KrsNode["kind"]`, so a new kind does
//     not type-check until it names the surfaces it is drawn on.
//   - `DIAGRAM_TYPE_SCOPE` is a `Record` over `DiagramType`, so a new diagram
//     type does not type-check until it says which kinds it draws; the test
//     then requires every diagram type that draws kinds to be probed by at
//     least one row of `KIND_SURFACES`.
//   - `DISPLAY_MODES` is held to the whole `DisplayMode` union.
//
// Every probe renders one model in which each node has the id `K_<kind>` and
// the label `Lbl-<kind>`, and asserts the canvas text shows the label and not
// the id. A second pass renders the same model without labels and asserts the
// id is the fallback (no blank card, no "undefined").

import { describe, expect, it } from "vitest";
import { compile, renderEntityView, type DiagramType } from "../compile/compile.js";
import type { KrsNode } from "../types/ast.js";
import type { DisplayMode } from "./layout-types.js";

type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2 ? true : false;

type Kind = KrsNode["kind"];

/** Where a kind's card is drawn. `entity` is a domain's entity sub-mode. */
type Surface =
  | { diagram: "system"; viewPath: readonly string[] }
  | { diagram: "deploy" }
  | { diagram: "entity"; viewPath: readonly string[] };

const ROOT: Surface = { diagram: "system", viewPath: [] };
const SYSTEM: Surface = { diagram: "system", viewPath: ["K_system"] };
const SERVICE: Surface = { diagram: "system", viewPath: ["K_system", "K_service"] };
const DOMAIN: Surface = { diagram: "system", viewPath: ["K_system", "K_service", "K_domain"] };
const USECASE: Surface = {
  diagram: "system",
  viewPath: ["K_system", "K_service", "K_domain", "K_usecase"],
};
const ENTITIES: Surface = { diagram: "entity", viewPath: ["K_system", "K_service", "K_domain"] };

const KIND_SURFACES = {
  system: [ROOT, SYSTEM],
  user: [ROOT, SYSTEM],
  client: [ROOT, SYSTEM],
  // A deploy unit's card names the service it realizes by that service's label.
  service: [ROOT, SYSTEM, SERVICE, { diagram: "deploy" }],
  domain: [SERVICE, DOMAIN],
  usecase: [DOMAIN, USECASE],
  resource: [USECASE],
  entity: [ENTITIES],
  database: [ROOT, { diagram: "system", viewPath: ["K_database"] }],
  table: [{ diagram: "system", viewPath: ["K_database"] }],
  queue: [ROOT, { diagram: "system", viewPath: ["K_queue"] }],
  "queue-item": [{ diagram: "system", viewPath: ["K_queue"] }],
  storage: [ROOT, { diagram: "system", viewPath: ["K_storage"] }],
  bucket: [{ diagram: "system", viewPath: ["K_storage"] }],
} as const satisfies Record<Kind, readonly Surface[]>;

/**
 * Which kinds each diagram type draws as a card. `"probed"` means the rows of
 * `KIND_SURFACES` must reach it; a string is the reason the diagram type draws
 * no kind's card.
 */
const DIAGRAM_TYPE_SCOPE = {
  system: "probed",
  deploy: "probed",
  // A team card lists `owns` as the reference the author wrote (#2088, #2819),
  // not as the owned node's card, so there is no node label to choose.
  org: "draws teams and members only; owns lines show the reference as written (#2088)",
} as const satisfies Record<DiagramType, string>;

const DISPLAY_MODES = ["shape", "icon"] as const satisfies readonly DisplayMode[];
const _displayModesContract: Equal<(typeof DISPLAY_MODES)[number], DisplayMode> = true;
void _displayModesContract;

const MODEL = `
system K_system {
  label "Lbl-system"
  user K_user { label "Lbl-user" }
  client K_client { label "Lbl-client" }
  service K_service {
    label "Lbl-service"
    domain K_domain {
      label "Lbl-domain"
      usecase K_usecase {
        label "Lbl-usecase"
        resource K_resource { label "Lbl-resource" }
      }
      entity K_entity { label "Lbl-entity" }
    }
  }
  K_user -> K_client
  K_client -> K_service
  K_service -> K_database
}
database K_database {
  label "Lbl-database"
  table K_table { label "Lbl-table" }
}
queue K_queue {
  label "Lbl-queue"
  queue K_queue_item { label "Lbl-queue-item" }
}
storage K_storage {
  label "Lbl-storage"
  bucket K_bucket { label "Lbl-bucket" }
}
deploy "Prod" {
  oci "unit" { realizes "K_service" }
}
`;

const UNLABELLED = MODEL.replace(/^\s*label "Lbl-[a-z-]+"\n/gm, "").replace(
  / \{ label "Lbl-[a-z-]+" \}/g,
  " {}",
);

const idOf = (kind: Kind) => `K_${kind.replace(/-/g, "_")}`;
const labelOf = (kind: Kind) => `Lbl-${kind}`;

/**
 * Whole-token matchers. `Lbl-queue` is a prefix of `Lbl-queue-item` and
 * `K_queue` of `K_queue_item`, so a substring test would let one kind's text
 * stand in for another's.
 */
const idPattern = (kind: Kind) => new RegExp(`(?<![\\w-])${idOf(kind)}(?![\\w-])`);
const labelPattern = (kind: Kind) => new RegExp(`(?<![\\w-])${labelOf(kind)}(?![\\w-])`);

/** The text content of every `<text>` element, tags stripped. */
function canvasTexts(svg: string): string[] {
  return [...svg.matchAll(/<text\b[^>]*>([\s\S]*?)<\/text>/g)]
    .map((m) => m[1].replace(/<[^>]+>/g, "").trim())
    .filter((t) => t.length > 0);
}

function renderSurface(source: string, surface: Surface, displayMode: DisplayMode) {
  const result =
    surface.diagram === "entity"
      ? renderEntityView(source, [...surface.viewPath], undefined, displayMode)
      : compile(source, {
          diagramType: surface.diagram,
          viewPath: surface.diagram === "system" ? [...surface.viewPath] : undefined,
          displayMode,
        });
  const errors = result.diagnostics.filter((d) => d.severity === "error");
  expect(errors, "the probe model parses without errors").toEqual([]);
  return canvasTexts(result.svg);
}

function surfaceName(surface: Surface): string {
  return "viewPath" in surface
    ? `${surface.diagram}[${surface.viewPath.join(".") || "root"}]`
    : surface.diagram;
}

const PROBES = (Object.entries(KIND_SURFACES) as [Kind, readonly Surface[]][]).flatMap(
  ([kind, surfaces]) =>
    surfaces.flatMap((surface) =>
      DISPLAY_MODES.map((mode) => [kind, surfaceName(surface), mode, surface] as const),
    ),
);

describe("every kind is drawn by its label on every surface (TPL-74)", () => {
  it("probes every diagram type that draws a kind's card", () => {
    const probed = new Set<string>(
      Object.values(KIND_SURFACES).flatMap((surfaces) => surfaces.map((s) => s.diagram)),
    );
    // A diagram type marked "probed" must be reached by some row; one scoped
    // out with a reason must not be (or its reason is stale).
    const mismatched = Object.entries(DIAGRAM_TYPE_SCOPE)
      .filter(([type, scope]) => probed.has(type) !== (scope === "probed"))
      .map(([type, scope]) => `${type}: ${scope}`);
    expect(mismatched).toEqual([]);
  });

  it.each(PROBES)("%s on %s (%s) shows the label, not the id", (kind, _name, mode, surface) => {
    const texts = renderSurface(MODEL, surface, mode);
    const id = idPattern(kind);
    const label = labelPattern(kind);
    expect(
      texts.some((t) => label.test(t)),
      `${labelOf(kind)} among ${JSON.stringify(texts)}`,
    ).toBe(true);
    expect(
      texts.filter((t) => id.test(t)),
      `text that prints the id ${idOf(kind)}`,
    ).toEqual([]);
  });

  it.each(PROBES)("%s on %s (%s) falls back to the id", (kind, _name, mode, surface) => {
    const texts = renderSurface(UNLABELLED, surface, mode);
    const id = idPattern(kind);
    expect(
      texts.some((t) => id.test(t)),
      `${idOf(kind)} among ${JSON.stringify(texts)}`,
    ).toBe(true);
    expect(texts.filter((t) => t.includes("undefined") || t.includes("Lbl-"))).toEqual([]);
  });
});
