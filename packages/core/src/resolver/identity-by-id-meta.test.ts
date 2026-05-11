/**
 * Meta-test enforcing TPL-20260510-20 (identity / equality / aggregation
 * keys must use `id`, never `label` or other display / translatable
 * strings). Issue #1275 / coverage gap GR20-1.
 *
 * The discipline is already followed in practice — `warnings.ts` and
 * `view-extract.ts` consistently compare by `.id`. This test is the
 * **lock-in**: it operationalizes the principle so a future detector
 * or refactor that introduces a `.label`-based comparison would only
 * be caught here in CI, not by individual code review.
 *
 * Mechanism: a curated table of identity-comparison sites. Every site
 * is exercised with two fixtures:
 *
 *   - **id-based** — ids agree, labels may differ; the detector must
 *     fire / resolve / aggregate on the id alone.
 *   - **label-collision** — labels collide but ids differ; the
 *     detector must **not** treat label collisions as identity
 *     collisions.
 *
 * Each fixture row encodes a single expected outcome: either a
 * warning with an optional anchored param (proving the right entity
 * was identified by id) or zero warnings of that kind. Two separate
 * `it.each` loops then assert the two outcome shapes — keeping every
 * `expect` call unconditional and out of helper functions, so the
 * lint rules `no-conditional-expect` / `no-standalone-expect` stay
 * happy.
 *
 * Adding a new identity-comparison site to the codebase requires
 * registering both rows here. The convention is captured in the
 * leading comment so code review surfaces omissions; a new
 * `.label`-based comparison without registration would still slip
 * past this test, but registering it is cheap and the pattern matches
 * the other curated-table meta-tests (#1233 / #1247 / #1265 / #1267).
 *
 * Refs:
 *   - TPL-20260510-20 (identity is id, not label), checklist items 1/3
 *   - warnings.test.ts:204 / :221 — canonical domain-dispersal pair
 *     this generalizes
 */
import { describe, it, expect } from "vitest";
import { compile } from "../index.js";

interface WarningExpected {
  /** Site name + "id-based" / "label-collision" suffix for `$name`. */
  name: string;
  /** Source fixture. */
  krs: string;
  /** Expected warning kind. */
  kind: string;
  /** Required param anchor: `params[paramKey]` should equal `paramValue`.
   * Anchoring proves the right entity was identified by id. */
  paramKey: string;
  paramValue: string;
}

interface NoWarningExpected {
  name: string;
  krs: string;
  kind: string;
}

/**
 * Curated identity-comparison sites — rows that **must** trigger the
 * named warning kind because the detector identifies by id. Each row
 * pairs with a `NO_WARNING_CHECKS` row that flips ids and labels;
 * together they prove the detector uses id, not label.
 *
 * **When you add a new identity / equality / aggregation site to
 * `warnings.ts`, `view-extract.ts`, or similar resolver/extractor
 * code, add a row here AND a paired row in `NO_WARNING_CHECKS`.**
 */
const WARNING_CHECKS: WarningExpected[] = [
  {
    // Same domain id in two services — dispersion warning fires
    // regardless of differing labels.
    name: "domain-dispersal: id-based (same id, different labels)",
    krs: `
system ECPlatform {
  service ECommerce {
    domain Payment { label "決済" }
  }
  service Checkout {
    domain Payment { label "お支払い" }
  }
}
`,
    kind: "domain-dispersal",
    paramKey: "domainId",
    paramValue: "Payment",
  },
  {
    // service id is "Backend", label is "MyService". `team owns MyService`
    // must NOT resolve via label match — the invalid-owns warning fires.
    name: "invalid-owns: label-collision (owns target equals an unrelated service's label)",
    krs: `
system MySystem {
  service Backend { label "MyService" }
}
organization Corp {
  team eng {
    owns MyService
  }
}
`,
    kind: "invalid-owns",
    paramKey: "ownedId",
    paramValue: "MyService",
  },
  {
    // domain id "OrderEntry" with label "Order"; client handles Order
    // must NOT resolve via the label match.
    name: "unresolved-handles: label-collision (handles target equals an unrelated domain's label)",
    krs: `
system S {
  client WebApp [web] { handles Order }
  service Backend {
    domain OrderEntry { label "Order" }
  }
  WebApp -> Backend
}
`,
    kind: "unresolved-handles",
    paramKey: "domainId",
    paramValue: "Order",
  },
  {
    // service id "Backend", label "ECommerce". realizes ECommerce
    // (the label) must not resolve via label match.
    name: "unresolved-realizes: label-collision (realizes target equals an unrelated service's label)",
    krs: `
system S {
  service Backend { label "ECommerce" }
}
deploy Production {
  oci ecommerceApp {
    runtime "Kubernetes"
    realizes ECommerce
  }
}
`,
    kind: "unresolved-realizes",
    paramKey: "target",
    paramValue: "ECommerce",
  },
];

const NO_WARNING_CHECKS: NoWarningExpected[] = [
  {
    // Different domain ids that happen to share a label — no dispersion.
    name: "domain-dispersal: label-collision (different ids, same label)",
    krs: `
system ECPlatform {
  service ECommerce {
    domain PaymentA { label "決済" }
  }
  service Checkout {
    domain PaymentB { label "決済" }
  }
}
`,
    kind: "domain-dispersal",
  },
  {
    // Service id "MyService" with distinct label; team owns MyService
    // must resolve via id regardless of label divergence.
    name: "invalid-owns: id-based (owns target matches service id, labels differ)",
    krs: `
system MySystem {
  service MyService { label "Distinct Label" }
}
organization Corp {
  team backend {
    owns MyService
  }
}
`,
    kind: "invalid-owns",
  },
  {
    // Domain id Order with divergent label; handles Order resolves by id.
    name: "unresolved-handles: id-based (handles target matches domain id, labels differ)",
    krs: `
system S {
  client WebApp [web] { handles Order }
  service Backend {
    domain Order { label "受注" }
  }
  WebApp -> Backend
}
`,
    kind: "unresolved-handles",
  },
  {
    // Service id ECommerce with divergent label; realizes ECommerce
    // resolves by id.
    name: "unresolved-realizes: id-based (realizes target matches service id, labels differ)",
    krs: `
system S {
  service ECommerce { label "EC platform" }
}
deploy Production {
  oci ecommerceApp {
    runtime "Kubernetes"
    realizes ECommerce
  }
}
`,
    kind: "unresolved-realizes",
  },
];

describe("meta: identity-comparison sites compare by id, never label (TPL-20260510-20)", () => {
  it.each(WARNING_CHECKS)("$name → warning surfaces with id-anchored params", (row) => {
    const result = compile(row.krs);
    const w = result.warnings.find((wn) => wn.kind === row.kind);
    expect(w).toBeDefined();
    // `w.params` is a discriminated-union shape; cast to record for
    // the param anchor check. The table is the source of truth for
    // which `kind` carries which param.
    const params = (w?.params ?? {}) as Record<string, unknown>;
    expect(params[row.paramKey]).toBe(row.paramValue);
  });

  it.each(NO_WARNING_CHECKS)("$name → no warning fires", (row) => {
    const result = compile(row.krs);
    const matching = result.warnings.filter((w) => w.kind === row.kind);
    expect(matching).toHaveLength(0);
  });
});
