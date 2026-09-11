import { describe, it, expect } from "vitest";
import { compile } from "./compile.js";

/**
 * The system view lights a deploy-jump button on a node that some deploy unit
 * realizes, matching container ids against its own node ids. A container's id
 * is its identity, and identity can need spelling a node's id space has no
 * word for — quotes around a dot-carrying segment (#2714), a qualified path
 * when two containers share a bare id (#2549) — so the match runs on the
 * container's `nodeId` instead. Fencing it here, at the seam where the two id
 * spaces meet, rather than at the renderer that is handed the set.
 */
describe("deploy affordance matches the node, not the container id (#2714)", () => {
  // `nodeControls` is what makes the buttons drawable at all — a static SVG
  // has nothing to click, so the affordance is only visible to the viewer.
  const systemSvg = (source: string) =>
    compile(source, { diagramType: "system", nodeControls: true }).svg;

  it("lights the button for a node whose own id contains a dot", () => {
    const svg = systemSvg(`
system Weird {
  service "Shop.Api" {}
}
deploy prod {
  oci c { realizes "Shop.Api" }
}
`);
    expect(svg).toContain('data-node-id="Shop.Api"');
    expect(svg).toContain('data-deploy-button="Shop.Api"');
  });

  it("still lights the button for an ordinary id", () => {
    const svg = systemSvg(`
system EC {
  service Api {}
}
deploy prod {
  oci a { realizes Api }
}
`);
    expect(svg).toContain('data-deploy-button="Api"');
  });

  it("lights neither node when two containers share the bare id (#2549)", () => {
    // The qualified ids exist precisely because one bare id cannot tell the
    // two apart, so neither `Api` node may claim the button.
    const svg = systemSvg(`
system Shop {
  service Api {}
}
system Admin {
  service Api {}
}
deploy prod {
  oci a { realizes Shop.Api }
  oci b { realizes Admin.Api }
}
`);
    expect(svg).not.toContain("data-deploy-button");
  });
});
