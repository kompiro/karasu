import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { renderDeploy } from "./deploy-renderer.js";
import { getBuiltinStyleSheet } from "../builtins/default-style.js";
import { getIconThemeStyleSheet } from "../builtins/icon-theme.js";
import { loadAndRegisterIcon } from "./svg-icon-loader.js";
import { resolveStyles } from "../resolver/style-resolver.js";
import "../renderer/shapes.js";
import { extractDeployView } from "../view/deploy-view-extract.js";
import { withUnassignedSystem } from "../view/unassigned-system.js";
import { Parser } from "../parser/parser.js";
import type { DeployViewSlice } from "../view/deploy-view-extract.js";

const LOC = { start: { line: 1, column: 0, offset: 0 }, end: { line: 1, column: 0, offset: 0 } };

function makeStyles() {
  return resolveStyles([], [getBuiltinStyleSheet()]);
}

function makeSlice(): DeployViewSlice {
  return {
    deployLabel: "本番環境",
    containers: [
      {
        serviceId: "ECommerce",
        serviceLabel: "ECサイト",
        units: [
          { kind: "oci", id: "order-api", properties: { runtime: "Node.js 20" }, loc: LOC },
          { kind: "oci", id: "order-worker", properties: { runtime: "Node.js 20" }, loc: LOC },
        ],
      },
      {
        serviceId: "Payment",
        serviceLabel: "決済サービス",
        units: [{ kind: "lambda", id: "payment-fn", properties: { runtime: "Go 1.22" }, loc: LOC }],
      },
    ],
    unclassifiedUnits: [{ kind: "job", id: "migration", properties: {}, loc: LOC }],
    ghostEdges: [{ from: "ECommerce", to: "Payment", kind: "sync" }],
  };
}

describe("renderDeploy", () => {
  let styles: ReturnType<typeof makeStyles>;

  beforeAll(() => {
    styles = makeStyles();
  });

  it("returns a valid SVG string", () => {
    const svg = renderDeploy(makeSlice(), styles);
    expect(svg).toContain("<svg");
    expect(svg).toContain("</svg>");
  });

  it("includes container labels", () => {
    const svg = renderDeploy(makeSlice(), styles);
    expect(svg).toContain("ECサイト");
    expect(svg).toContain("決済サービス");
  });

  it("includes unit labels", () => {
    const svg = renderDeploy(makeSlice(), styles);
    expect(svg).toContain("order-api");
    expect(svg).toContain("payment-fn");
  });

  it("includes runtime as description text", () => {
    const svg = renderDeploy(makeSlice(), styles);
    expect(svg).toContain("Node.js 20");
    expect(svg).toContain("Go 1.22");
  });

  it("includes unclassified unit", () => {
    const svg = renderDeploy(makeSlice(), styles);
    expect(svg).toContain("migration");
    expect(svg).toContain("Unclassified");
  });

  it("includes data-container-id attributes", () => {
    const svg = renderDeploy(makeSlice(), styles);
    expect(svg).toContain('data-container-id="ECommerce"');
    expect(svg).toContain('data-container-id="Payment"');
  });

  it("includes data-node-id attributes for units", () => {
    const svg = renderDeploy(makeSlice(), styles);
    expect(svg).toContain('data-node-id="ECommerce::order-api"');
  });

  it("renders empty state SVG for empty slice", () => {
    const empty: DeployViewSlice = {
      deployLabel: "",
      containers: [],
      unclassifiedUnits: [],
      ghostEdges: [],
    };
    const svg = renderDeploy(empty, styles);
    expect(svg).toContain("<svg");
    expect(svg).toContain("No deploy block defined");
  });

  it("uses provided empty-state labels in the empty SVG", () => {
    const empty: DeployViewSlice = {
      deployLabel: "",
      containers: [],
      unclassifiedUnits: [],
      ghostEdges: [],
    };
    const svg = renderDeploy(empty, styles, undefined, {
      emptyLabels: { deployTitle: "デプロイ未定義", deployHint: "追加してね" },
    });
    expect(svg).toContain("デプロイ未定義");
    expect(svg).toContain("追加してね");
    expect(svg).not.toContain("No deploy block defined");
  });

  it("includes ghost edge group", () => {
    const svg = renderDeploy(makeSlice(), styles);
    expect(svg).toContain("ghost-edges");
  });

  it("includes kind badge labels", () => {
    const svg = renderDeploy(makeSlice(), styles);
    expect(svg).toContain("oci");
    expect(svg).toContain("lambda");
  });

  describe("containerDiffState", () => {
    it("emits data-diff-state on the container group when provided", () => {
      const containerDiffState = new Map<string, string>([
        ["ECommerce", "added"],
        ["Payment", "unchanged"],
      ]);
      const svg = renderDeploy(makeSlice(), styles, undefined, { containerDiffState });
      expect(svg).toContain('data-container-id="ECommerce" data-diff-state="added"');
      expect(svg).toContain('data-container-id="Payment" data-diff-state="unchanged"');
    });

    it("omits data-diff-state when no state is supplied", () => {
      const svg = renderDeploy(makeSlice(), styles);
      expect(svg).not.toContain("data-diff-state");
    });
  });

  describe("icon mode", () => {
    it("renders frame rect with stroke when displayMode is icon", () => {
      const svg = renderDeploy(makeSlice(), styles, "icon");
      // renderFromLayout adds a frame rect with stroke in icon mode
      expect(svg).toContain("stroke");
    });

    it("accepts displayMode without error", () => {
      expect(() => renderDeploy(makeSlice(), styles, "icon")).not.toThrow();
      expect(() => renderDeploy(makeSlice(), styles, "shape")).not.toThrow();
    });

    // Regression for #1666: deploy units are stored in resolved styles under the
    // bare unit id (`order-api`), but the deploy layout keys nodes as
    // `containerId::unitId`. The render lookup used to miss and fall back to the
    // default (box) style, so Icon Mode drew no icon. With the fallback to
    // `layoutNode.id`, the unit picks up its `shape: url("oci")` and the
    // registered icon glyph is drawn.
    it("draws the registered icon glyph for a unit in Icon Mode (#1666)", () => {
      const iconsDir = resolve(dirname(fileURLToPath(import.meta.url)), "../../icons");
      loadAndRegisterIcon("oci", readFileSync(resolve(iconsDir, "oci.svg"), "utf8"));
      const slice = makeSlice();
      const units = [...slice.containers.flatMap((c) => c.units), ...slice.unclassifiedUnits];
      // Icon Mode injects the icon theme (shape: url(...)); shape mode does not.
      const iconStyles = resolveStyles(
        [],
        [getBuiltinStyleSheet(), getIconThemeStyleSheet()],
        units,
      );
      const shapeStyles = resolveStyles([], [getBuiltinStyleSheet()], units);

      // The icon glyph is emitted by registerIcon as `<g transform="translate(...) scale(...)">`.
      const ICON_GLYPH = /transform="translate\([^)]*\) scale\(/;
      expect(renderDeploy(slice, iconStyles, "icon")).toMatch(ICON_GLYPH);
      expect(renderDeploy(slice, shapeStyles, "shape")).not.toMatch(ICON_GLYPH);
    });
  });

  describe("light theme", () => {
    // Regression for #1697: the deploy-kind rules in the light template set
    // background / border / badge but used to omit `color`, so node labels fell
    // back to the default white (#F9FAFB) and were unreadable on the light cards.
    it("renders dark, readable node text (not the white default)", () => {
      const slice = makeSlice();
      const units = [...slice.containers.flatMap((c) => c.units), ...slice.unclassifiedUnits];
      const lightStyles = resolveStyles([], [getBuiltinStyleSheet("light")], units);
      const svg = renderDeploy(slice, lightStyles, "shape");
      // `order-api` is an `oci` unit → dark blue text in the light theme, not the
      // white default (#F9FAFB) that was unreadable on the light card.
      const ociNode = svg.slice(svg.indexOf('data-node-id="ECommerce::order-api"'));
      expect(ociNode).toMatch(/<text[^>]*fill="#1E3A8A"/);
      expect(ociNode).not.toMatch(/<text[^>]*fill="#F9FAFB"/);
    });
  });

  describe("job band (#1738)", () => {
    function makeJobBandSlice(): DeployViewSlice {
      return {
        deployLabel: "Prod",
        containers: [
          {
            serviceId: "Api",
            serviceLabel: "API",
            units: [{ kind: "oci", id: "api", properties: { runtime: "Node.js 20" }, loc: LOC }],
          },
          {
            serviceId: "Feedback",
            serviceLabel: "Feedback",
            units: [{ kind: "job", id: "weekly", properties: { schedule: "0 0 * * 1" }, loc: LOC }],
            kindBand: "job",
          },
        ],
        unclassifiedUnits: [],
        ghostEdges: [],
      };
    }

    it("emits the job band wrapper with its caption and data-kind-band", () => {
      const svg = renderDeploy(makeJobBandSlice(), styles);
      expect(svg).toContain('data-kind-band="job"');
      expect(svg).toContain("Scheduled jobs");
    });

    it("does not emit a job band when there are no job-only containers", () => {
      const svg = renderDeploy(makeSlice(), styles);
      expect(svg).not.toContain('data-kind-band="job"');
      expect(svg).not.toContain("Scheduled jobs");
    });

    it("renders the localized band caption from emptyLabels (i18n pass-through)", () => {
      const svg = renderDeploy(makeJobBandSlice(), styles, "shape", {
        emptyLabels: { deployJobBand: "定期実行ジョブ" },
      });
      expect(svg).toContain("定期実行ジョブ");
      expect(svg).not.toContain("Scheduled jobs");
    });
  });
});

describe("container ids in the SVG (#2714)", () => {
  it("emits one element per container when a dotted id meets a qualified path", () => {
    // Built from source, not hand-assembled: the claim is that the id the
    // extractor decides reaches the DOM the app clicks through, so the fence
    // has to run parse → extract → render.
    const file = Parser.parse(`
system Shop {
  service Api {}
}
system Admin {
  service Api {}
}
system Weird {
  service "Shop.Api" {}
}
deploy prod {
  oci a { realizes Shop.Api }
  oci b { realizes Admin.Api }
  oci c { realizes "Shop.Api" }
}
`).value;
    const slice = extractDeployView(file.deploys, withUnassignedSystem(file));
    const svg = renderDeploy(slice, makeStyles());

    expect(svg).toContain('data-container-id="Shop.Api"');
    expect(svg).toContain('data-container-id="Admin.Api"');
    // XML-escaped in the attribute, and read back as `"Shop.Api"` by the DOM.
    expect(svg).toContain('data-container-id="&quot;Shop.Api&quot;"');
    expect(svg.match(/data-container-id="/g)).toHaveLength(3);
  });
});

// #2818: the container's identity (`data-container-id`, ADR-2714) is not the
// id a viewer can match a node against, so the node a container realizes rides
// along as `data-realized-node-id`. Built from source like the fence above:
// the claim is that `DeployContainer.nodeId` reaches the DOM.
describe("realized node ids in the SVG (#2818)", () => {
  const renderSource = (source: string) => {
    const file = Parser.parse(source).value;
    const slice = extractDeployView(file.deploys, withUnassignedSystem(file));
    return renderDeploy(slice, makeStyles());
  };

  it("carries a quoted id's bare node id, which the container id cannot spell", () => {
    const svg = renderSource(`
system Weird {
  service "www.example.com" {}
}
deploy prod {
  oci w { realizes "www.example.com" }
}
`);
    expect(svg).toContain('data-container-id="&quot;www.example.com&quot;"');
    expect(svg).toContain('data-realized-node-id="www.example.com"');
  });

  it("spells both attributes the same for a plain id", () => {
    const svg = renderSource(`
system EC {
  service Api {}
}
deploy prod {
  oci a { realizes Api }
}
`);
    expect(svg).toContain('data-container-id="Api"');
    expect(svg).toContain('data-realized-node-id="Api"');
  });

  it("omits it on qualified containers and on a narrowed ref", () => {
    // Two containers share the bare id `Api`, so neither realizes a node the
    // bare id names alone; `Worker` does. A narrowed ref (`Shop.Api` while an
    // undeployed `Admin.Api` exists) is the same verdict with one container.
    const qualified = renderSource(`
system Shop {
  service Api {}
  service Worker {}
}
system Admin {
  service Api {}
}
deploy prod {
  oci a { realizes Shop.Api }
  oci b { realizes Admin.Api }
  oci w { realizes Worker }
}
`);
    expect(qualified).toContain('data-container-id="Shop.Api"');
    expect(qualified).toContain('data-container-id="Admin.Api"');
    expect(qualified.match(/data-realized-node-id="/g)).toHaveLength(1);
    expect(qualified).toContain('data-realized-node-id="Worker"');

    const narrowed = renderSource(`
system Shop {
  service Api {}
}
system Admin {
  service Api {}
}
deploy prod {
  oci a { realizes Shop.Api }
}
`);
    expect(narrowed).toContain('data-container-id="Api"');
    expect(narrowed).not.toContain("data-realized-node-id");
  });

  it("never marks the synthetic containers", () => {
    // The job realizes its own service so it forms a job-only container and
    // pulls the `__job_band__` wrapper into the drawing; a job sharing `Api`
    // with the `oci` would join that mixed container instead (#1738).
    const svg = renderSource(`
system EC {
  service Api {}
  service Cron {}
}
deploy prod {
  oci a { realizes Api }
  oci stray {}
  job nightly { realizes Cron }
}
`);
    // `__unclassified__` and `__job_band__` are drawn; only the two real
    // containers carry a realized node. `el()` writes attributes in insertion
    // order, so a marked wrapper would read `data-container-id="__job_band__"
    // data-realized-node-id=…`.
    expect(svg).toContain('data-container-id="__unclassified__"');
    expect(svg).toContain('data-container-id="__job_band__"');
    expect(svg).not.toMatch(
      /data-container-id="__(unclassified|job_band)__" data-realized-node-id/,
    );
    expect(svg).toContain('data-realized-node-id="Api"');
    expect(svg).toContain('data-realized-node-id="Cron"');
    expect(svg.match(/data-realized-node-id="/g)).toHaveLength(2);
  });
});
