import type { Page } from "@playwright/test";
import { type OpfsFixture, expect, test } from "../fixtures/opfs.js";
import { openViewTab } from "../fixtures/tabs.js";

/**
 * AT-0058: diff **colour** contract — the half of the graphical diff viewer
 * that `at-0058-graphical-diff-viewer.spec.ts` explicitly left to manual
 * review ("Colour / opacity perception (TC-1/3/5/9), annotation-badge diff
 * (TC-4), and org-view (TC-8a) diff styling — visual checks").
 *
 * Those checks are structural, not perceptual: every diff visual is a
 * computed `stroke` / `stroke-dasharray` / `opacity` driven by the
 * `--diff-color-{added,removed,changed}` tokens (`themes.css` →
 * `styles/components/diff.css`). What a human actually judges by eye is
 * "added and removed are distinguishable at a glance"; that claim decomposes
 * into two machine-checkable halves, and this spec asserts both:
 *
 *  1. **wiring** — the element's computed stroke equals the resolved token,
 *     so a node/edge/badge that lost its diff rule is caught.
 *  2. **semantics** — the resolved tokens classify as green / red / amber and
 *     are mutually distinct, so an inverted or collapsed palette is caught.
 *
 * Deliberately *not* pinned to literal hex: a palette tune (#22c55e →
 * #16a34a) is not a regression, an inversion is. Only the residual
 * perceptual judgment (is this particular green *pleasant* / legible for a
 * colour-vision-deficient reader) stays manual.
 *
 * Coverage: AT-0058 TC-1 (added green), TC-2 (removed red dashed), TC-3
 * (changed amber), TC-4 (badge ring + unchanged body), TC-5 (unchanged
 * dimmed), TC-8 (identical files paint nothing), TC-8a (org view), TC-9
 * (deploy unit + ghost edge, both directions).
 *
 * Reads go through `expect.poll`: the preview swaps the SVG subtree when the
 * diff re-renders, and `getComputedStyle` on a node detached mid-swap returns
 * "" (TPL-20260510-14 — wait for the reached stable state, not the requested
 * one; observed as a real 1-in-4 flake in the #2049 prototype).
 */

const INDEX_KRS = `system Shop {
  service Catalog {
    label "商品カタログ"
  }
  service Orders @deprecated
  service Payments
  Catalog -> Orders "queries"
  Orders -> Payments "charges"
}

deploy Production {
  oci "catalog-svc" { realizes Catalog }
  oci "orders-svc" { realizes Orders }
  oci "payments-svc" { realizes Payments }
}
`;

// Same shape minus Payments, minus the `Catalog` label and the `@deprecated`
// annotation on `Orders` — one node/edge added, one label changed, one
// annotation-only change, everything else unchanged.
const BEFORE_KRS = `system Shop {
  service Catalog
  service Orders
  Catalog -> Orders "queries"
}

deploy Production {
  oci "catalog-svc" { realizes Catalog }
  oci "orders-svc" { realizes Orders }
}
`;

const ORG_INDEX_KRS = `system Shop {
  service Orders
  service Catalog
  service Payments
}

organization Acme {
  team teamA {
    owns Orders
    owns Catalog
    member alice {}
  }
  team teamB {
    member bob {}
  }
  team teamC {
    owns Payments
    member carol {}
  }
}
`;

// `Catalog` ownership moves teamB → teamA, `teamC` (with `carol`) is new.
const ORG_BEFORE_KRS = `system Shop {
  service Orders
  service Catalog
}

organization Acme {
  team teamA {
    owns Orders
    member alice {}
  }
  team teamB {
    owns Catalog
    member bob {}
  }
}
`;

type DiffTokens = { added: string; removed: string; changed: string };

/**
 * Resolve the three diff palette tokens to computed `rgb(...)` strings, so
 * they can be compared against a computed `stroke`. `getPropertyValue` alone
 * yields the authored hex ("#22c55e"); a probe element renders the `var()`
 * through the same cascade the SVG rules use.
 */
async function diffTokens(page: Page): Promise<DiffTokens> {
  return page.evaluate(() => {
    const probe = document.createElement("span");
    probe.style.display = "none";
    document.body.appendChild(probe);
    const resolve = (name: string) => {
      probe.style.color = `var(${name})`;
      return getComputedStyle(probe).color;
    };
    try {
      return {
        added: resolve("--diff-color-added"),
        removed: resolve("--diff-color-removed"),
        changed: resolve("--diff-color-changed"),
      };
    } finally {
      probe.remove();
    }
  });
}

/**
 * Coarse hue bucket for an `rgb()` string. Green = green channel leads;
 * amber = red leads with the green channel well clear of blue; red = red
 * leads with green and blue close together. Anything else (the un-diffed
 * blues of the builtin palette) is "other".
 */
function hueClass(rgb: string): "green" | "red" | "amber" | "other" {
  const m = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!m) return "other";
  const [r, g, b] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (g > r && g > b) return "green";
  if (r > g && r > b) return g - b >= 40 ? "amber" : "red";
  return "other";
}

/** Poll-safe computed-style read of the first match for `selector`. */
function styleOf(page: Page, selector: string, prop: "stroke" | "strokeDasharray" | "opacity") {
  return () =>
    page
      .locator(selector)
      .first()
      .evaluate((el, p) => getComputedStyle(el)[p as "stroke"], prop)
      .catch(() => "");
}

async function seedAndOpen(opfs: OpfsFixture, files: Record<string, string>): Promise<void> {
  await opfs.seed({ projects: [{ id: "diff", name: "Diff", files }], lastProjectId: "diff" });
  await opfs.gotoApp();
}

/** Enter diff mode with `other` as the before-side and `index.krs` as after. */
async function enterDiff(page: Page, other = "before.krs"): Promise<void> {
  await page.locator(".file-tree-item", { hasText: "index.krs" }).first().click();
  await page.locator(".file-tree-item", { hasText: other }).first().click({ button: "right" });
  await page.getByRole("button", { name: "⇄ Compare with current" }).click();
  await expect(page.getByRole("status", { name: "Diff mode active" })).toBeVisible();
  await expect(page.locator("[data-diff-state]").first()).toBeVisible();
}

test.describe("AT-0058 diff colour contract", () => {
  test("the palette itself is green / red / amber and mutually distinct", async ({
    page,
    opfs,
  }) => {
    await seedAndOpen(opfs, { "index.krs": INDEX_KRS });

    const tokens = await diffTokens(page);
    expect(hueClass(tokens.added)).toBe("green");
    expect(hueClass(tokens.removed)).toBe("red");
    expect(hueClass(tokens.changed)).toBe("amber");
    // "Distinguishable at a glance" proxy: three distinct hues, three
    // distinct values. Whether *this* green reads well stays a human check.
    expect(new Set([tokens.added, tokens.removed, tokens.changed]).size).toBe(3);
  });

  test("added node and edge are green, a label change is amber, unchanged is dimmed (TC-1/TC-3/TC-5)", async ({
    page,
    opfs,
  }) => {
    await seedAndOpen(opfs, { "index.krs": INDEX_KRS, "before.krs": BEFORE_KRS });
    await enterDiff(page);
    const tokens = await diffTokens(page);

    // TC-1: the added service and the added edge both take the added token.
    await expect
      .poll(styleOf(page, '[data-node-id="Payments"][data-diff-state="added"] rect', "stroke"))
      .toBe(tokens.added);
    await expect
      .poll(
        styleOf(
          page,
          '[data-edge-from="Orders"][data-edge-to="Payments"][data-diff-state="added"] line',
          "stroke",
        ),
      )
      .toBe(tokens.added);

    // TC-3: label-only change → amber border.
    await expect
      .poll(styleOf(page, '[data-node-id="Catalog"][data-diff-state="changed"] rect', "stroke"))
      .toBe(tokens.changed);

    // TC-5: unchanged elements are dimmed and keep their non-diff stroke, so
    // the changes are what stands out.
    await expect
      .poll(async () =>
        Number(
          await styleOf(page, '[data-node-id="Orders"][data-diff-state="unchanged"]', "opacity")(),
        ),
      )
      .toBeCloseTo(0.55, 1);
    const unchangedStroke = await styleOf(
      page,
      '[data-node-id="Orders"][data-diff-state="unchanged"] rect',
      "stroke",
    )();
    expect([tokens.added, tokens.removed, tokens.changed]).not.toContain(unchangedStroke);
  });

  test("removed node and edge are red and dashed after swapping direction (TC-2)", async ({
    page,
    opfs,
  }) => {
    await seedAndOpen(opfs, { "index.krs": INDEX_KRS, "before.krs": BEFORE_KRS });
    await enterDiff(page);
    const tokens = await diffTokens(page);

    await page.getByRole("button", { name: "Swap diff direction" }).click();

    const removedRect = '[data-node-id="Payments"][data-diff-state="removed"] rect';
    await expect.poll(styleOf(page, removedRect, "stroke")).toBe(tokens.removed);
    // Dashed, not merely red: the dash is what marks "was here, now gone" for
    // readers who cannot rely on hue.
    await expect.poll(styleOf(page, removedRect, "strokeDasharray")).toMatch(/\d/);

    const removedEdge =
      '[data-edge-from="Orders"][data-edge-to="Payments"][data-diff-state="removed"] line';
    await expect.poll(styleOf(page, removedEdge, "stroke")).toBe(tokens.removed);
    await expect.poll(styleOf(page, removedEdge, "strokeDasharray")).toMatch(/\d/);
  });

  test("an annotation-only change rings the badge and leaves the body undecorated (TC-4)", async ({
    page,
    opfs,
  }) => {
    await seedAndOpen(opfs, { "index.krs": INDEX_KRS, "before.krs": BEFORE_KRS });
    await enterDiff(page);
    const tokens = await diffTokens(page);

    // `Orders` gained `@deprecated` only: the badge ring carries the added
    // colour while the node body stays unchanged (and therefore dimmed) —
    // annotation churn must not repaint the whole node.
    await expect
      .poll(styleOf(page, '[data-node-badge="Orders"][data-diff-state="added"] circle', "stroke"))
      .toBe(tokens.added);
    const bodyStroke = await styleOf(
      page,
      '[data-node-id="Orders"][data-diff-state="unchanged"] rect',
      "stroke",
    )();
    expect([tokens.added, tokens.removed, tokens.changed]).not.toContain(bodyStroke);
    // The badge stays at full opacity even though its ancestor is dimmed.
    await expect
      .poll(async () =>
        Number(
          await styleOf(page, '[data-node-badge="Orders"][data-diff-state="added"]', "opacity")(),
        ),
      )
      .toBe(1);

    // Reversed: the ghost removed badge is red and dashed.
    await page.getByRole("button", { name: "Swap diff direction" }).click();
    const ghost = '[data-node-badge="Orders"][data-diff-state="removed"] circle';
    await expect.poll(styleOf(page, ghost, "stroke")).toBe(tokens.removed);
    await expect.poll(styleOf(page, ghost, "strokeDasharray")).toMatch(/\d/);
  });

  test("comparing identical files paints no diff colour anywhere (TC-8)", async ({
    page,
    opfs,
  }) => {
    await seedAndOpen(opfs, { "index.krs": INDEX_KRS, "same.krs": INDEX_KRS });
    await enterDiff(page, "same.krs");
    const tokens = await diffTokens(page);

    // Negative case for the palette: everything is `unchanged`, so no green /
    // red / amber may appear on any shape in the diagram.
    await expect(page.locator('[data-diff-state="added"]')).toHaveCount(0);
    await expect(page.locator('[data-diff-state="removed"]')).toHaveCount(0);
    await expect(page.locator('[data-diff-state="changed"]')).toHaveCount(0);
    await expect(page.locator('[data-diff-state="unchanged"]').first()).toBeVisible();

    const strokes = await page
      .locator(".preview-container svg")
      .first()
      .evaluate((root) =>
        // `polyline` is in the list because a routed edge is drawn as one; a
        // negative assertion that omits a shape passes for the wrong reason
        // (TPL-1954 — a new route shape must not fall outside what consumes it).
        Array.from(
          root.querySelectorAll("rect, path, circle, polygon, line, polyline, ellipse"),
        ).map((el) => getComputedStyle(el).stroke),
      );
    expect(strokes.length).toBeGreaterThan(0);
    for (const value of [tokens.added, tokens.removed, tokens.changed]) {
      expect(strokes).not.toContain(value);
    }
  });

  test("org view paints an added team green and a reshuffled team amber (TC-8a)", async ({
    page,
    opfs,
  }) => {
    await seedAndOpen(opfs, { "index.krs": ORG_INDEX_KRS, "before.krs": ORG_BEFORE_KRS });
    await enterDiff(page);
    await openViewTab(page, "Org");
    const tokens = await diffTokens(page);

    // New team → green card; the two teams whose `owns` set was reshuffled →
    // amber card.
    await expect
      .poll(styleOf(page, '[data-node-id="teamC"][data-diff-state="added"] rect', "stroke"))
      .toBe(tokens.added);
    await expect
      .poll(styleOf(page, '[data-node-id="teamA"][data-diff-state="changed"] rect', "stroke"))
      .toBe(tokens.changed);
    await expect
      .poll(styleOf(page, '[data-node-id="teamB"][data-diff-state="changed"] rect', "stroke"))
      .toBe(tokens.changed);

    // Owns buttons are text-only (no stroked shape), so their diff signal is
    // opacity, not hue: the moved `→ Catalog` entries stay at full opacity on
    // both cards while the untouched `→ Orders` is dimmed with its card body.
    await expect(
      page.locator('[data-node-id="teamA"] [data-owned-service-button="Catalog"]'),
    ).toHaveAttribute("data-diff-state", "added");
    await expect(
      page.locator('[data-node-id="teamB"] [data-owned-service-button="Catalog"]'),
    ).toHaveAttribute("data-diff-state", "removed");
    await expect
      .poll(async () =>
        Number(
          await styleOf(
            page,
            '[data-node-id="teamA"] [data-owned-service-button="Catalog"]',
            "opacity",
          )(),
        ),
      )
      .toBe(1);
    await expect
      .poll(async () =>
        Number(
          await styleOf(
            page,
            '[data-node-id="teamA"] [data-owned-service-button="Orders"]',
            "opacity",
          )(),
        ),
      )
      .toBeCloseTo(0.55, 1);

    // Drilling into the new team keeps the added colour on its new member.
    // (The team drill-down level renders member cards only — it has no owns
    // buttons to carry a state, so the AT checklist's "owns button in the
    // drill-down view" item does not apply to the shipped renderer.)
    await page
      .locator('[data-node-id="teamC"] rect')
      .first()
      .click({ position: { x: 20, y: 8 } });
    await expect
      .poll(styleOf(page, '[data-node-id="carol"][data-diff-state="added"] rect', "stroke"))
      .toBe(tokens.added);
  });

  test("deploy view colours the added unit and its ghost edge, red dashed when swapped (TC-9)", async ({
    page,
    opfs,
  }) => {
    await seedAndOpen(opfs, { "index.krs": INDEX_KRS, "before.krs": BEFORE_KRS });
    await enterDiff(page);
    await openViewTab(page, "Deploy");
    const tokens = await diffTokens(page);

    // Added unit, its container, and the new ghost edge between containers.
    await expect
      .poll(
        styleOf(
          page,
          '[data-node-id="Payments::payments-svc"][data-diff-state="added"] rect',
          "stroke",
        ),
      )
      .toBe(tokens.added);
    await expect
      .poll(styleOf(page, '[data-container-id="Payments"][data-diff-state="added"] rect', "stroke"))
      .toBe(tokens.added);
    await expect
      .poll(
        styleOf(
          page,
          '[data-edge-from="Orders"][data-edge-to="Payments"][data-diff-state="added"] line',
          "stroke",
        ),
      )
      .toBe(tokens.added);

    // Reversed direction → the same three go red and dashed.
    await page.getByRole("button", { name: "Swap diff direction" }).click();
    const removedUnit = '[data-node-id="Payments::payments-svc"][data-diff-state="removed"] rect';
    await expect.poll(styleOf(page, removedUnit, "stroke")).toBe(tokens.removed);
    await expect.poll(styleOf(page, removedUnit, "strokeDasharray")).toMatch(/\d/);
    const removedGhost =
      '[data-edge-from="Orders"][data-edge-to="Payments"][data-diff-state="removed"] line';
    await expect.poll(styleOf(page, removedGhost, "stroke")).toBe(tokens.removed);
    await expect.poll(styleOf(page, removedGhost, "strokeDasharray")).toMatch(/\d/);
  });
});
