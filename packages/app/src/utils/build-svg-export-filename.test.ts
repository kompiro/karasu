import { describe, it, expect } from "vitest";
import { buildSvgExportFilename } from "./build-svg-export-filename.js";

describe("buildSvgExportFilename", () => {
  describe("system view", () => {
    it("uses the last breadcrumb item label", () => {
      expect(
        buildSvgExportFilename("system", {
          breadcrumbItems: [{ id: "MySystem", label: "My System" }],
        }),
      ).toBe("system-My_System.svg");
    });

    it("uses a drilled-down node name when deeper in the hierarchy", () => {
      expect(
        buildSvgExportFilename("system", {
          breadcrumbItems: [
            { id: "MySystem", label: "My System" },
            { id: "ECommerce", label: "E Commerce" },
          ],
        }),
      ).toBe("system-E_Commerce.svg");
    });

    it("falls back to view name when breadcrumbItems is empty", () => {
      expect(buildSvgExportFilename("system", { breadcrumbItems: [] })).toBe("system-system.svg");
    });

    it("preserves Japanese node names", () => {
      expect(
        buildSvgExportFilename("system", {
          breadcrumbItems: [{ id: "juchuu", label: "受注システム" }],
        }),
      ).toBe("system-受注システム.svg");
    });

    it("sanitizes unsafe characters in label, falls back to id when label sanitizes to empty", () => {
      expect(
        buildSvgExportFilename("system", {
          breadcrumbItems: [{ id: "my-node", label: "" }],
        }),
      ).toBe("system-my-node.svg");
    });
  });

  describe("deploy view", () => {
    it("uses the selected deploy block label", () => {
      expect(
        buildSvgExportFilename("deploy", {
          deployBlocks: [{ id: "block-a", label: "Block A" }],
          selectedDeployBlockId: "block-a",
        }),
      ).toBe("deploy-Block_A.svg");
    });

    it("uses block id when label is absent", () => {
      expect(
        buildSvgExportFilename("deploy", {
          deployBlocks: [{ id: "block-a" }],
          selectedDeployBlockId: "block-a",
        }),
      ).toBe("deploy-block-a.svg");
    });

    it("falls back to first block when selectedDeployBlockId is null", () => {
      expect(
        buildSvgExportFilename("deploy", {
          deployBlocks: [{ id: "block-a", label: "Block A" }],
          selectedDeployBlockId: null,
        }),
      ).toBe("deploy-Block_A.svg");
    });

    it("falls back to view name when deployBlocks is empty", () => {
      expect(buildSvgExportFilename("deploy", {})).toBe("deploy-deploy.svg");
    });
  });

  describe("org view", () => {
    it("uses the last breadcrumb item label", () => {
      expect(
        buildSvgExportFilename("org", {
          breadcrumbItems: [
            { id: "__org__", label: "EC開発組織" },
            { id: "team-a", label: "Team A" },
          ],
        }),
      ).toBe("org-Team_A.svg");
    });

    it("uses the root org label when only the root breadcrumb is present", () => {
      expect(
        buildSvgExportFilename("org", {
          breadcrumbItems: [{ id: "__org__", label: "EC開発組織" }],
        }),
      ).toBe("org-EC開発組織.svg");
    });

    it("falls back to view name when breadcrumbItems is empty", () => {
      expect(buildSvgExportFilename("org", {})).toBe("org-org.svg");
    });
  });
});
