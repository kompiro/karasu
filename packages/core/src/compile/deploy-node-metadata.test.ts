import { describe, it, expect } from "vitest";
import { compile } from "./compile.js";

/**
 * The metadata the deploy view hands the detail panel. `NodeDetailPanel`
 * renders the `realizes` row as `metadata.realizes.join(", ")`, so anything
 * recorded twice is read out twice — the surface that made a repeated target
 * visible to a reader before #2552 folded it at the declaration.
 */
describe("deploy node metadata", () => {
  const metadataFor = (realizes: string) => {
    const result = compile(
      `
system EC {
  service OrderService {}
}
deploy Production {
  oci app {
    runtime "Kubernetes"
${realizes}
  }
}
`,
      { diagramType: "deploy" },
    );
    if (result.diagramType !== "deploy") throw new Error("expected the deploy view");
    return result.nodeMetadata.get("OrderService::app");
  };

  it("lists a target named twice once", () => {
    expect(metadataFor("    realizes OrderService\n    realizes OrderService")?.realizes).toEqual([
      "OrderService",
    ]);
  });

  it("lists a target named twice within one comma list once", () => {
    expect(metadataFor("    realizes OrderService, OrderService")?.realizes).toEqual([
      "OrderService",
    ]);
  });

  it("keeps both spellings when two refs merely resolve to one node", () => {
    // The model holds two refs here, and the panel reads back what the author
    // wrote: the deploy view collapses them into one container, but neither
    // spelling is the model's to discard.
    expect(
      metadataFor("    realizes OrderService\n    realizes EC.OrderService")?.realizes,
    ).toEqual(["OrderService", "EC.OrderService"]);
  });
});
