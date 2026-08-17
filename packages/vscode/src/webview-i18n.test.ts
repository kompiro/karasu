import { describe, expect, it } from "vitest";
import { en, ja } from "@karasu-tools/i18n";
import { buildPreviewPanelLabels } from "./webview-i18n.js";

// Locale resolution itself is not tested here: `PreviewPanel` calls the shared
// `resolveLocaleTag` on `vscode.env.language` directly, and that rule is fenced
// once in `packages/i18n/src/locale.test.ts` (#2081).
describe("buildPreviewPanelLabels", () => {
  // The webview panel must show byte-identical labels to the app's React
  // NodeDetailPanel, which reads the same `nodeDetail.*` keys through
  // `useTranslation`. Asserting against the raw i18n maps (not hardcoded
  // literals) keeps this test honest if a translation is ever reworded.
  it("mirrors the shared nodeDetail.* i18n keys for en", () => {
    const labels = buildPreviewPanelLabels("en");
    expect(labels).toEqual({
      close: en["nodeDetail.close"],
      linksTitle: en["nodeDetail.links.title"],
      resourcesTitle: en["nodeDetail.resources.title"],
      capabilitiesTitle: en["nodeDetail.capabilities.title"],
      migrationTitle: en["nodeDetail.migration.title"],
      migrationUntil: en["nodeDetail.migration.until"],
      migrationFrom: en["nodeDetail.migration.from"],
      openDeployView: en["nodeDetail.openDeployView"],
      jumpToEditor: en["nodeDetail.jumpToEditor"],
    });
  });

  it("mirrors the shared nodeDetail.* i18n keys for ja", () => {
    const labels = buildPreviewPanelLabels("ja");
    expect(labels).toEqual({
      close: ja["nodeDetail.close"],
      linksTitle: ja["nodeDetail.links.title"],
      resourcesTitle: ja["nodeDetail.resources.title"],
      capabilitiesTitle: ja["nodeDetail.capabilities.title"],
      migrationTitle: ja["nodeDetail.migration.title"],
      migrationUntil: ja["nodeDetail.migration.until"],
      migrationFrom: ja["nodeDetail.migration.from"],
      openDeployView: ja["nodeDetail.openDeployView"],
      jumpToEditor: ja["nodeDetail.jumpToEditor"],
    });
  });

  it("produces different section titles across locales (no accidental English pinning)", () => {
    expect(buildPreviewPanelLabels("en").resourcesTitle).not.toBe(
      buildPreviewPanelLabels("ja").resourcesTitle,
    );
  });
});
