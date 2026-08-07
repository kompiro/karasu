import type { Locator, Page } from "@playwright/test";
import { expect, test } from "../fixtures/opfs.js";
import { replaceEditorContent } from "../fixtures/editor.js";

/**
 * AT-0006 AC-1: the built-in stylesheet's rendered result — node shapes, the
 * kind palette, `[external]` and async-edge dashing, and a user sheet
 * overriding an inferred shape. Also closes AT-0049's "node shape / visual
 * rendering — covered by manual visual review".
 *
 * Shapes are asserted by *classifying the emitted geometry* rather than
 * probing for one element type, because `shapes.ts` emits overlapping element
 * sets: cylinder and queue are both `path` + `ellipse` and differ only in
 * which axis the cap is stretched along. Checking "an ellipse exists" would
 * pass if a queue rendered as a cylinder, which is exactly the confusion worth
 * fencing — so `shapeOf` distinguishes them by `rx` vs `ry`.
 *
 * Colours are asserted as *relationships and hue classes*, not literal hex:
 * the AC claims "service is a blue box" and "[external] is grey and dashed",
 * which is a claim about distinguishability. Re-tuning `default-style.ts` is
 * not a regression; collapsing external into the service palette, or losing
 * the dash, is.
 *
 * AC-1.2 note: the checklist literally says `resource DB "DB" [table]`, which
 * is a parse error under the shipped grammar — inline label strings do not
 * exist and resources live inside a usecase. The shipped mechanism is shape
 * *inference from the infra kind* (`table` → cylinder, `queue` → queue,
 * `bucket` → cloud, via `default-style.ts`'s `resource[table]` rules and the
 * infra-kind → tag mapping), which is what this spec exercises. The AT text
 * has been corrected alongside.
 */

const KRS = `system Demo {
  database MainDB {
    table Orders {
      label "Orders"
    }
  }
  queue Bus {
    queue Created {
      label "Created"
    }
  }
  storage Media {
    bucket Images {
      label "Images"
    }
  }
  user Visitor
  service Api {
    domain Core {
      usecase Handle {
        resource MainDB.Orders
        resource Bus.Created
        resource Media.Images
      }
    }
  }
  service Legacy [external]
  Visitor -> Api "uses"
  Api --> Legacy "notifies"
}
`;

// Same model, with a user sheet that overrides the inferred resource shape.
const STYLED_KRS = `@import "custom.krs.style"

${KRS}`;

// Equal specificity to the built-in `resource[table]` rule (kind + tag = 11);
// the user sheet is applied later, so it wins the tie. A bare `resource`
// (score 1) would lose — see the second assertion in the override test.
const USER_STYLE = `resource[table] {
  shape: hexagon;
}

resource[queue] {
  background-color: #FF00AA;
}
`;

type Shape = "box" | "user" | "cylinder" | "queue" | "hexagon" | "cloud" | "unknown";

/**
 * Classify a node group's rendered shape from the geometry `shapes.ts` emits:
 *
 *   box      rect
 *   user     circle + path      (head + body)
 *   hexagon  polygon
 *   cloud    path
 *   cylinder path + ellipse, cap stretched horizontally (rx > ry)
 *   queue    path + ellipse, cap stretched vertically   (ry > rx)
 */
async function shapeOf(node: Locator): Promise<Shape> {
  return node.first().evaluate((el): Shape => {
    const tags = new Set(
      Array.from(el.children)
        .map((c) => c.tagName.toLowerCase())
        .filter((t) => ["rect", "circle", "path", "polygon", "ellipse"].includes(t)),
    );
    if (tags.has("polygon")) return "hexagon";
    if (tags.has("circle") && tags.has("path")) return "user";
    if (tags.has("ellipse")) {
      const ellipse = el.querySelector("ellipse");
      if (!ellipse) return "unknown";
      const rx = Number(ellipse.getAttribute("rx"));
      const ry = Number(ellipse.getAttribute("ry"));
      return rx > ry ? "cylinder" : "queue";
    }
    if (tags.has("rect")) return "box";
    if (tags.has("path")) return "cloud";
    return "unknown";
  });
}

/** Computed `fill` of a node group's first painted shape element. */
function fillOf(page: Page, nodeId: string) {
  return () =>
    page
      .locator(`.preview-container svg [data-node-id="${nodeId}"]`)
      .first()
      .evaluate((el) => {
        const shape = el.querySelector("rect, path, polygon, circle, ellipse");
        return shape ? getComputedStyle(shape).fill : "";
      })
      .catch(() => "");
}

function rgb(value: string): { r: number; g: number; b: number } | null {
  const m = value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  return m ? { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]) } : null;
}

/** Chroma = max − min channel. Near zero means grey. */
function chroma(value: string): number {
  const c = rgb(value);
  if (!c) return -1;
  return Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b);
}

function isBlueDominant(value: string): boolean {
  const c = rgb(value);
  return c !== null && c.b > c.r && c.b > c.g;
}

test.describe("AT-0006 built-in style rendering", () => {
  test("kind shapes come from the built-in sheet with no user stylesheet", async ({
    page,
    opfs,
  }) => {
    await opfs.seed({ mode: "memory" });
    await opfs.gotoApp();
    await replaceEditorContent(page, KRS);

    const svg = page.locator(".preview-container svg").first();
    await expect(svg.locator('[data-node-id="Api"]').first()).toBeVisible();

    // service → box, user → person.
    expect(await shapeOf(svg.locator('[data-node-id="Api"]'))).toBe("box");
    expect(await shapeOf(svg.locator('[data-node-id="Visitor"]'))).toBe("user");
  });

  test("the kind palette makes services blue and keeps [external] grey and dashed", async ({
    page,
    opfs,
  }) => {
    await opfs.seed({ mode: "memory" });
    await opfs.gotoApp();
    await replaceEditorContent(page, KRS);

    const svg = page.locator(".preview-container svg").first();
    await expect(svg.locator('[data-node-id="Api"]').first()).toBeVisible();

    const service = await fillOf(page, "Api")();
    const external = await fillOf(page, "Legacy")();

    // "Blue box" for a plain service.
    expect(isBlueDominant(service), `service fill ${service} should be blue-dominant`).toBe(true);

    // "[external] is grey": distinctly less saturated than the service colour,
    // and not the same colour — the tag has to be visible as a difference.
    expect(external).not.toBe(service);
    expect(chroma(external)).toBeLessThan(chroma(service));

    // …and dashed. `stroke-dasharray` may be set as an attribute or via style.
    const dash = await svg
      .locator('[data-node-id="Legacy"] rect')
      .first()
      .evaluate(
        (el) => el.getAttribute("stroke-dasharray") ?? getComputedStyle(el).strokeDasharray,
      );
    expect(dash).toMatch(/\d/);
  });

  test("async edges are dashed and sync edges are solid", async ({ page, opfs }) => {
    await opfs.seed({ mode: "memory" });
    await opfs.gotoApp();
    await replaceEditorContent(page, KRS);

    const svg = page.locator(".preview-container svg").first();
    await expect(svg.locator('[data-node-id="Api"]').first()).toBeVisible();

    // `Visitor -> Api` is sync, `Api --> Legacy` is async. Both are compared as
    // a pair: a stylesheet that dashed *everything* would still satisfy a lone
    // "async is dashed" assertion.
    //
    // Each edge group carries an invisible wide stroke first (the pointer
    // hit-area, `stroke: rgba(0,0,0,0)`, never dashed) followed by the painted
    // one. Reading `querySelector("line")` picks the hit-area and always
    // reports "none", so the *visible* stroke has to be selected explicitly.
    //
    // Match every shape an edge can be drawn as: `line` when it runs straight,
    // `polyline` once it is routed around an obstacle, and `path` when a hop
    // mark cuts it. Listing only some of them makes the query silently return
    // nothing for the others and read as "not dashed" (TPL-1954 — a new route
    // shape must not fall outside what consumes it).
    const dashByEdge = await svg.evaluate((root) => {
      const out: Record<string, string> = {};
      for (const edge of Array.from(root.querySelectorAll("[data-edge-from]"))) {
        const key = `${edge.getAttribute("data-edge-from")}->${edge.getAttribute("data-edge-to")}`;
        const painted = Array.from(edge.querySelectorAll("line, polyline, path")).find(
          (candidate) => {
            const stroke = getComputedStyle(candidate).stroke;
            return stroke !== "none" && !/rgba?\([^)]*,\s*0\)$/.test(stroke);
          },
        );
        out[key] = painted
          ? (painted.getAttribute("stroke-dasharray") ?? getComputedStyle(painted).strokeDasharray)
          : "";
      }
      return out;
    });

    expect(dashByEdge["Api->Legacy"], "async edge should be dashed").toMatch(/\d/);
    expect(dashByEdge["Visitor->Api"], "sync edge should be solid").not.toMatch(/\d/);
  });

  test("resource shapes are inferred from the infra kind (AC-1.2, AT-0049)", async ({
    page,
    opfs,
  }) => {
    await opfs.seed({ mode: "memory" });
    await opfs.gotoApp();
    await replaceEditorContent(page, KRS);

    // Dot-notation resources are drawn at the domain level, so drill in.
    await page.locator('.preview-container svg [data-node-id="Api"]').first().click();
    await page.locator('.preview-container svg [data-node-id="Core"]').first().click();

    const svg = page.locator(".preview-container svg").first();
    await expect(svg.locator('[data-node-id="MainDB.Orders"]').first()).toBeVisible();

    // table → cylinder, queue item → queue, bucket → cloud. Cylinder and
    // queue are only distinguishable by cap orientation, which is the point.
    expect(await shapeOf(svg.locator('[data-node-id="MainDB.Orders"]'))).toBe("cylinder");
    expect(await shapeOf(svg.locator('[data-node-id="Bus.Created"]'))).toBe("queue");
    expect(await shapeOf(svg.locator('[data-node-id="Media.Images"]'))).toBe("cloud");

    // AC-1.2's fourth row (`[api]` -> hexagon) is deliberately absent. `[api]`
    // maps to no infra kind, so it can only reach a diagram as a hand-written
    // tag on an unassigned resource -- and an unassigned resource is not drawn
    // at the domain level at all (it only raises "resource X is not assigned to
    // any database or entity"). `docs/spec/syntax.md` says such a resource is
    // "rendered as an orphan node", which does not match the app; filed as
    // #2200. The hexagon shape rule itself is covered by the override test.
  });

  test("a user stylesheet overrides an inferred resource shape at equal specificity (AC-1.3)", async ({
    page,
    opfs,
  }) => {
    await opfs.seed({
      projects: [
        {
          id: "builtin",
          name: "Builtin",
          files: { "index.krs": STYLED_KRS, "custom.krs.style": USER_STYLE },
        },
      ],
      lastProjectId: "builtin",
    });
    await opfs.gotoApp();
    await page.locator(".file-tree-item", { hasText: "index.krs" }).first().click();

    await page.locator('.preview-container svg [data-node-id="Api"]').first().click();
    await page.locator('.preview-container svg [data-node-id="Core"]').first().click();

    const svg = page.locator(".preview-container svg").first();
    await expect(svg.locator('[data-node-id="MainDB.Orders"]').first()).toBeVisible();

    // The user sheet wins the tie against the built-in
    // `resource[table] { shape: cylinder }` because it is applied later.
    expect(await shapeOf(svg.locator('[data-node-id="MainDB.Orders"]'))).toBe("hexagon");

    // A different property on another tag-scoped rule lands too, so the win
    // above is the cascade resolving a tie rather than the whole user sheet
    // replacing the built-in one.
    expect(await fillOf(page, "Bus.Created")()).toBe("rgb(255, 0, 170)");

    // The queue keeps its built-in shape — the user sheet said nothing about
    // it, so a "user origin wins everything" implementation would show here.
    expect(await shapeOf(svg.locator('[data-node-id="Bus.Created"]'))).toBe("queue");
  });

  // Documents the cascade as specified in `docs/spec/style.md`: precedence is
  // specificity-first with later-wins on ties, and there is **no** user-origin
  // boost. So a bare `resource` rule (score 1) does not beat the built-in
  // `resource[table]` (score 11) — surprising when read as "my stylesheet
  // should win", and exactly what AT-0006 AC-1.3's example glosses over
  // (its `resource { shape: hexagon }` only overrides an *untagged* resource).
  test("a lower-specificity user rule does not override a tag-scoped built-in rule", async ({
    page,
    opfs,
  }) => {
    await opfs.seed({
      projects: [
        {
          id: "cascade",
          name: "Cascade",
          files: {
            "index.krs": STYLED_KRS,
            "custom.krs.style": "resource {\n  shape: hexagon;\n}\n",
          },
        },
      ],
      lastProjectId: "cascade",
    });
    await opfs.gotoApp();
    await page.locator(".file-tree-item", { hasText: "index.krs" }).first().click();

    await page.locator('.preview-container svg [data-node-id="Api"]').first().click();
    await page.locator('.preview-container svg [data-node-id="Core"]').first().click();

    const svg = page.locator(".preview-container svg").first();
    await expect(svg.locator('[data-node-id="MainDB.Orders"]').first()).toBeVisible();

    expect(await shapeOf(svg.locator('[data-node-id="MainDB.Orders"]'))).toBe("cylinder");
  });
});
