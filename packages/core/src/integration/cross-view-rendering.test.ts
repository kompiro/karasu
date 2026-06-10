import { describe, it, expect } from "vitest";
import { Parser } from "../parser/parser.js";
import { resolveStyles } from "../resolver/style-resolver.js";
import { getBuiltinStyleSheet } from "../builtins/default-style.js";
import { extractView } from "../view/view-extract.js";
import { extractOrgView } from "../view/org-view-extract.js";
import { render } from "../renderer/svg-renderer.js";
import { renderOrgView } from "../renderer/org-renderer.js";
import type { ViewPath } from "../view/view-extract.js";

/**
 * Cross-layer integration coverage for the two "writer writes one coarse line
 * → reader sees progressive disclosure across views" mechanics described by
 * TPL-20260510-23: `owns` (organization → team) and inherited `service`
 * annotations (`@deprecated` / `@experimental`, ADR-20260415-01).
 *
 * The parser / resolver layers are already well-tested in isolation
 * (`parser.test.ts`, `warnings.test.ts`, `inherited-annotations.test.ts`).
 * What was missing — and what these tests assert — is that the *renderer*
 * actually applies the team-attribution markers and inherited badges to the
 * SVG output. A renderer refactor that dropped `ownerIndex` threading or the
 * inherited-annotation lookup would pass every per-layer test but fail here.
 *
 * Operationalizes AT-0056 (inherit-service-annotations) cases 1, 3, 4, 5.
 */

function parseFixture(krs: string) {
  const parseResult = Parser.parse(krs);
  const styles = resolveStyles(parseResult.value.systems, [getBuiltinStyleSheet()]);
  return { parseResult, styles };
}

function renderSystemView(krs: string, path: ViewPath): string {
  const { parseResult, styles } = parseFixture(krs);
  const viewSlice = extractView(parseResult.value.systems, path);
  return render(viewSlice, styles, undefined, parseResult.value.ownerIndex);
}

function renderOrg(krs: string): string {
  const { parseResult, styles } = parseFixture(krs);
  const orgSlice = extractOrgView(parseResult.value.organizations, []);
  return renderOrgView(orgSlice, styles);
}

describe("cross-view rendering integration", () => {
  describe("Part A: owns propagates to both org-view and system-view rendering", () => {
    const withOwns = `
system Shop {
  service ECommerce { label "EC" }
}
organization Org {
  team Platform {
    label "Platform"
    owns ECommerce
  }
}
`;
    const withoutOwns = `
system Shop {
  service ECommerce { label "EC" }
}
organization Org {
  team Platform {
    label "Platform"
  }
}
`;

    it("system view shows the owning team on the owned service node", () => {
      const svg = renderSystemView(withOwns, ["Shop"]);
      expect(svg).toContain('data-team-button="Platform"');
      expect(svg).toContain("👥Platform");
    });

    it("org view shows the owned service under the owning team", () => {
      const svg = renderOrg(withOwns);
      expect(svg).toContain('data-owned-service-button="ECommerce"');
    });

    it("regression rehearsal: removing the owns binding drops both markers", () => {
      const systemSvg = renderSystemView(withoutOwns, ["Shop"]);
      expect(systemSvg).not.toContain('data-team-button="Platform"');
      expect(systemSvg).not.toContain("👥Platform");

      const orgSvg = renderOrg(withoutOwns);
      expect(orgSvg).not.toContain('data-owned-service-button="ECommerce"');
    });
  });

  describe("Part B: inherited service annotations propagate through to descendant rendering", () => {
    const deprecatedBadgeLabel = "Deprecated"; // builtin style for @deprecated
    const experimentalBadgeLabel = "Experimental"; // builtin style for @experimental

    const inheritedDeprecated = `
system S {
  service Foo @deprecated {
    domain Bar {
      usecase Baz {}
    }
  }
}
`;
    const noAnnotation = `
system S {
  service Foo {
    domain Bar {
      usecase Baz {}
    }
  }
}
`;
    const childOverride = `
system S {
  service Foo @deprecated {
    domain Bar @experimental {
      usecase Baz {}
    }
  }
}
`;

    it("a @deprecated service propagates the deprecated badge to its descendants (AT-0056 case 1)", () => {
      // Drill into the service: the immediate child domain carries the badge.
      const atService = renderSystemView(inheritedDeprecated, ["S", "Foo"]);
      expect(atService).toContain('data-node-badge="Bar"');
      expect(atService).toContain(deprecatedBadgeLabel);

      // Drill one level deeper: the usecase carries it too (transitive).
      const atDomain = renderSystemView(inheritedDeprecated, ["S", "Foo", "Bar"]);
      expect(atDomain).toContain('data-node-badge="Baz"');
      expect(atDomain).toContain(deprecatedBadgeLabel);
    });

    it("a @experimental service propagates the experimental badge to its descendants (AT-0056 case 3)", () => {
      const krs = `
system S {
  service Cat @experimental {
    domain Listing {}
  }
}
`;
      const svg = renderSystemView(krs, ["S", "Cat"]);
      expect(svg).toContain('data-node-badge="Listing"');
      expect(svg).toContain(experimentalBadgeLabel);
    });

    it("an un-annotated service introduces no inherited visual treatment (AT-0056 case 4)", () => {
      const atService = renderSystemView(noAnnotation, ["S", "Foo"]);
      expect(atService).not.toContain('data-node-badge="Bar"');
      expect(atService).not.toContain(deprecatedBadgeLabel);
      expect(atService).not.toContain(experimentalBadgeLabel);

      const atDomain = renderSystemView(noAnnotation, ["S", "Foo", "Bar"]);
      expect(atDomain).not.toContain('data-node-badge="Baz"');
      expect(atDomain).not.toContain(deprecatedBadgeLabel);
    });

    it("an explicit child annotation overrides the inherited one and re-propagates (AT-0056 case 5)", () => {
      // Bar declares @experimental → Bar shows the experimental badge, never the
      // deprecated one inherited from Foo.
      const atService = renderSystemView(childOverride, ["S", "Foo"]);
      expect(atService).toContain('data-node-badge="Bar"');
      expect(atService).toContain(experimentalBadgeLabel);
      expect(atService).not.toContain(deprecatedBadgeLabel);

      // Baz inherits from Bar (not Foo) → experimental, not deprecated.
      const atDomain = renderSystemView(childOverride, ["S", "Foo", "Bar"]);
      expect(atDomain).toContain('data-node-badge="Baz"');
      expect(atDomain).toContain(experimentalBadgeLabel);
      expect(atDomain).not.toContain(deprecatedBadgeLabel);
    });
  });
});
