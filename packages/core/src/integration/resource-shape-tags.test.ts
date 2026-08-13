import { describe, it, expect } from "vitest";
import { Parser } from "../parser/parser.js";
import { extractView } from "../view/view-extract.js";
import { resolveStyles } from "../resolver/style-resolver.js";
import { renderShape } from "../renderer/shapes.js";
import { getBuiltinStyleSheet } from "../builtins/default-style.js";
import type { ResolvedNodeStyle } from "../types/style.js";

/**
 * Cross-layer coverage for AT-0006 AC-1.2 — "a resource's tag picks its shape".
 *
 * The AC used to be a manual browser step whose sample line
 * (`resource DB "DB" [table]`) had drifted out of the grammar, so nobody could
 * run it (Issue #2047). Getting a tag shape on screen is a *three-layer*
 * agreement, and each layer can break without the other two noticing:
 *
 *   1. view    — the resource must be **promoted** to a sibling node of its
 *                usecase in the domain view, which only happens once it
 *                resolves (dot-notation ref, or a bare id naming an `entity`).
 *   2. style   — the builtin sheet maps `resource[<tag>]` to a shape name,
 *                with the sub-resource kind inferred for dot-notation refs
 *                (ADR-351) and a hand-written tag winning over the inference.
 *   3. renderer — the shape name must be a registered shape whose primitive
 *                actually differs from a plain box.
 *
 * The trap the old AC fell into is pinned at the bottom: an *unresolved* bare
 * resource resolves a perfectly good shape at layer 2 yet is never promoted by
 * layer 1, so the tag is invisible in the domain view no matter how correct the
 * stylesheet is. It is still drawn one level deeper, inside its own usecase —
 * both halves are fenced there, because pinning only the negative half is what
 * let the docs drift into "never drawn at all" (#2200).
 */

// The model AT-0006 AC-1.2 tells the reader to paste into the editor. Kept
// literally in sync with the ```krs block in docs/acceptance/0006-*.md.
const MODEL = `system Demo {
  database MainDB {
    table Orders { label "Orders" }
  }
  queue Bus {
    queue Created { label "Created" }
  }
  storage Media {
    bucket Images { label "Images" }
  }
  service Api {
    domain Core {
      entity PaymentGateway { label "決済ゲートウェイ" }
      usecase Handle {
        resource MainDB.Orders
        resource Bus.Created
        resource Media.Images
        resource PaymentGateway [api]
      }
    }
  }
}`;

const DOMAIN_VIEW = ["Demo", "Api", "Core"];

function parseModel(krs: string) {
  const result = Parser.parse(krs);
  expect(result.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  return result.value;
}

/**
 * The production style path: `compile()` resolves styles from the **systems**
 * tree (not the view slice), so the test must too — resolving from the slice
 * would pass on copies carrying pre-applied tags and hide a regression in the
 * resolver's own inference.
 */
function resolveModelStyles(krs: string) {
  return resolveStyles(parseModel(krs).systems, [getBuiltinStyleSheet()]);
}

describe("AT-0006 AC-1.2: resource tag → shape, end to end", () => {
  it("promotes every resolved resource to a sibling node of its usecase in the domain view", () => {
    const view = extractView(parseModel(MODEL).systems, DOMAIN_VIEW);

    expect(view.childNodes.map((n) => n.id)).toEqual([
      "Handle",
      "MainDB.Orders",
      "Bus.Created",
      "Media.Images",
      "PaymentGateway",
    ]);
  });

  describe("the builtin sheet gives each tag its shape", () => {
    const styles = resolveModelStyles(MODEL);

    it.each([
      // id, shape, how the tag got there
      ["MainDB.Orders", "cylinder", "inferred from the table sub-resource"],
      ["Bus.Created", "queue", "inferred from the queue-item sub-resource"],
      ["Media.Images", "cloud", "inferred from the bucket sub-resource"],
      ["PaymentGateway", "hexagon", "hand-written [api], no infra counterpart"],
    ])("%s → %s (%s)", (id, shape) => {
      expect(styles.nodes.get(id)?.shape).toBe(shape);
    });
  });

  describe("each shape name draws a distinct primitive", () => {
    // 120×100 keeps every derived radius a whole number, so the assertions
    // below can quote exact geometry instead of matching float noise.
    const box = (shape: string): string =>
      renderShape(0, 0, 120, 100, {
        shape,
        borderWidth: 1,
        borderStyle: "solid",
      } as unknown as ResolvedNodeStyle);

    it("cylinder is a body path capped by a full-width ellipse on top", () => {
      const svg = box("cylinder");
      expect(svg).toContain("<path");
      // Centred on the box, spanning its full width — the DB lid.
      expect(svg).toContain('<ellipse cx="60" cy="12" rx="60"');
    });

    it("queue is a body path capped by a narrow ellipse on its right edge", () => {
      const svg = box("queue");
      expect(svg).toContain("<path");
      // Parked at the right edge and only as wide as the pipe's rounding.
      expect(svg).toContain('<ellipse cx="108" cy="50" rx="12"');
    });

    it("api renders as a polygon (hexagon), not a rect", () => {
      const svg = box("hexagon");
      expect(svg).toContain("<polygon");
      expect(svg).not.toContain("<rect");
    });

    it("storage renders as a single cloud path", () => {
      const svg = box("cloud");
      expect(svg).toContain("<path");
      expect(svg).not.toContain("<ellipse");
    });
  });

  describe("an unresolved bare resource is drawn in its usecase, not promoted to the domain", () => {
    // The shape AT-0006 AC-1.2 used to ask the reader to look for, on a
    // resource that names neither an infra sub-resource nor an entity.
    const withScratch = MODEL.replace(
      "        resource PaymentGateway [api]",
      "        resource PaymentGateway [api]\n        resource ScratchTable [table]",
    );

    it("resolves a shape all the way through the style layer", () => {
      expect(resolveModelStyles(withScratch).nodes.get("ScratchTable")?.shape).toBe("cylinder");
    });

    it("is not promoted to a sibling of its usecase in the domain view", () => {
      // Promotion is what *resolution* buys (see AT-0049): an unresolved bare
      // resource stays inside its usecase instead of joining the domain view.
      const view = extractView(parseModel(withScratch).systems, DOMAIN_VIEW);
      expect(view.childNodes.map((n) => n.id)).not.toContain("ScratchTable");
    });

    it("is drawn one level deeper, in its usecase's own drill-down view", () => {
      // The other half of the contract, and the half `docs/spec/syntax.md`
      // means by "drawn inside its usecase" (#2200). Fencing only the negative
      // half above is what let the docs drift into claiming the resource is
      // never drawn at all — it is, just not at domain level. Resources are a
      // usecase's own children here, so no resolution gate applies.
      const view = extractView(parseModel(withScratch).systems, [...DOMAIN_VIEW, "Handle"]);
      expect(view.childNodes.map((n) => n.id)).toContain("ScratchTable");
    });
  });
});
