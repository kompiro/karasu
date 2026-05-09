import type { Page } from "@playwright/test";
import { replaceEditorContent } from "../fixtures/editor.js";
import { expect, test } from "../fixtures/opfs.js";
import type { Mode, OpfsFixture } from "../fixtures/opfs.js";

/**
 * AT-0014: MemoryModeApp / ProjectModeApp unification.
 *
 * Each scenario is parameterized over both modes so we prove the two app
 * surfaces share the same diagram-tab behavior, editor wiring, and reference
 * panel wiring.
 *
 * Out of scope:
 *  - AC-4 ProjectModeApp regressions that AT-0029 / AT-0044 already cover —
 *    we only assert the parts unique to the unification (tab parity in both
 *    modes).
 *  - AC-5 clipboard "Copy → Copied!" toggle (headless Chromium permission
 *    flake; manual review).
 */

const KRS_WITH_ALL_VIEWS = `system T {
  label "Test System"
  service Web {
    label "WebService"
  }
}

deploy "Production" {
  oci web {
    runtime "Node.js"
    realizes Web
  }
}

organization Acme {
  team Engineering {
    member alice { label "Alice" }
  }
}
`;

const KRS_NO_DEPLOY = `system T {
  service Web { label "WebService" }
}

organization Acme {
  team Engineering {
    member alice { label "Alice" }
  }
}
`;

const KRS_NO_ORG = `system T {
  service Web { label "WebService" }
}

deploy "Production" {
  oci web {
    runtime "Node.js"
    realizes Web
  }
}
`;

async function bootApp(page: Page, opfs: OpfsFixture, mode: Mode, initialContent: string) {
  if (mode === "opfs") {
    await opfs.seed({
      mode: "opfs",
      projects: [
        {
          id: "at-0014",
          name: "AT-0014",
          files: { "index.krs": initialContent },
        },
      ],
      lastProjectId: "at-0014",
    });
    await opfs.gotoApp();
  } else {
    await opfs.seed({ mode: "memory" });
    await opfs.gotoApp();
    // MemoryModeApp seeds its own sampleKrs on mount; replace it with the
    // scenario content so the assertions read against the same source.
    await replaceEditorContent(page, initialContent);
  }
}

const MODES: Mode[] = ["opfs", "memory"];

for (const mode of MODES) {
  test.describe(`AT-0014 [${mode}]`, () => {
    test("DiagramTabBar shows System / Deploy / Org with System selected by default (AC-1.1, AC-1.2)", async ({
      page,
      opfs,
    }) => {
      await bootApp(page, opfs, mode, KRS_WITH_ALL_VIEWS);

      const systemTab = page.getByRole("tab", { name: /System$/ });
      const deployTab = page.getByRole("tab", { name: /Deploy$/ });
      const orgTab = page.getByRole("tab", { name: /Org$/ });

      await expect(systemTab).toBeVisible();
      await expect(deployTab).toBeVisible();
      await expect(orgTab).toBeVisible();
      await expect(systemTab).toHaveAttribute("aria-selected", "true");
    });

    test("Switching to Deploy and Org renders their diagrams; switching back to System works (AC-1.3, AC-1.4, AC-1.5)", async ({
      page,
      opfs,
    }) => {
      await bootApp(page, opfs, mode, KRS_WITH_ALL_VIEWS);

      // Deploy view: oci unit "web" must appear in the rendered SVG.
      await page.getByRole("tab", { name: /Deploy$/ }).click();
      await expect(page.getByRole("tab", { name: /Deploy$/ })).toHaveAttribute(
        "aria-selected",
        "true",
      );
      await expect(page.locator(".preview-column svg").first()).toContainText("web");

      // Org view: alice member card must appear.
      await page.getByRole("tab", { name: /Org$/ }).click();
      await expect(page.getByRole("tab", { name: /Org$/ })).toHaveAttribute(
        "aria-selected",
        "true",
      );
      await expect(page.locator(".preview-column svg").first()).toContainText("Engineering");

      // Back to System.
      await page.getByRole("tab", { name: /System$/ }).click();
      await expect(page.getByRole("tab", { name: /System$/ })).toHaveAttribute(
        "aria-selected",
        "true",
      );
      await expect(page.locator(".preview-column svg").first()).toContainText("WebService");
    });

    test("Editing the .krs source updates all three diagrams (AC-3.1)", async ({ page, opfs }) => {
      await bootApp(page, opfs, mode, KRS_WITH_ALL_VIEWS);

      const previewSvg = page.locator(".preview-column svg").first();

      // Sanity: original system label is rendered.
      await expect(previewSvg).toContainText("WebService");

      // Rename the service and confirm the change reaches the System view.
      await replaceEditorContent(
        page,
        KRS_WITH_ALL_VIEWS.replace('label "WebService"', 'label "ApiService"'),
      );

      await expect(previewSvg).toContainText("ApiService");

      await page.getByRole("tab", { name: /Deploy$/ }).click();
      await expect(previewSvg).toContainText("web");

      await page.getByRole("tab", { name: /Org$/ }).click();
      await expect(previewSvg).toContainText("Engineering");
    });

    // Tracked in #1171 — flake surfaced by #1169 (retries 2 → 1 in #1008
    // Phase 1). The highlight assertion failed both attempts under retries=1
    // but passed under retries=2 (3 attempts). Re-enable once stabilized.
    test.fixme("Clicking a deploy container switches to System with the realizes target highlighted (AC-2.1, AC-2.2, AC-2.3)", async ({
      page,
      opfs,
    }) => {
      await bootApp(page, opfs, mode, KRS_WITH_ALL_VIEWS);

      // Open the Deploy view and click the container whose realizes target is `Web`.
      await page.getByRole("tab", { name: /Deploy$/ }).click();
      await expect(page.getByRole("tab", { name: /Deploy$/ })).toHaveAttribute(
        "aria-selected",
        "true",
      );
      // Wait for the deploy SVG to fully render — otherwise the click can land
      // on a transient element while the realize-target container is still
      // being mounted.
      await expect(page.locator(".preview-column svg").first()).toContainText("web");

      // The container <g> wraps a rect + label; the deploy-unit text node sits
      // in a sibling overlay group and intercepts a centered click. Click the
      // top-left so we hit the container background, not the unit label.
      const container = page.locator('svg [data-container-id="Web"]').first();
      await expect(container).toBeAttached();
      await container.click({ position: { x: 4, y: 4 } });

      // Cross-navigation lands on System with `Web` highlighted.
      await expect(page.getByRole("tab", { name: /System$/ })).toHaveAttribute(
        "aria-selected",
        "true",
      );
      const highlighted = page.locator('svg [data-node-id="Web"].karasu-highlighted');
      await expect(highlighted).toHaveCount(1);

      // Highlight clears when the user drills/clicks elsewhere — confirm by
      // clicking outside any node (the SVG background) and re-checking.
      await page
        .locator(".preview-column svg")
        .first()
        .click({ position: { x: 5, y: 5 } });
      await expect(page.locator("svg .karasu-highlighted")).toHaveCount(0);
    });

    test("Removing the organization block keeps the Org tab clickable with an empty placeholder (AC-3.3)", async ({
      page,
      opfs,
    }) => {
      await bootApp(page, opfs, mode, KRS_NO_ORG);

      const orgTab = page.getByRole("tab", { name: /Org$/ });
      await orgTab.click();
      await expect(orgTab).toHaveAttribute("aria-selected", "true");
      // No error: the org view renders the localized empty placeholder.
      await expect(page.locator(".preview-column svg").first()).toContainText(
        /No org diagram|org 図がありません|No teams defined|team が定義されていません/,
      );
    });

    test("Removing the deploy block surfaces the empty-state placeholder on the Deploy tab (AC-3.2)", async ({
      page,
      opfs,
    }) => {
      await bootApp(page, opfs, mode, KRS_NO_DEPLOY);

      await page.getByRole("tab", { name: /Deploy$/ }).click();
      // Empty-state SVG carries the localized placeholder text.
      await expect(page.locator(".preview-column svg").first()).toContainText(
        /No deploy block|deploy ブロック/,
      );
    });

    test("ReferencePanel exposes the Samples tab with system/deploy/organization sample (AC-5)", async ({
      page,
      opfs,
    }) => {
      await bootApp(page, opfs, mode, KRS_WITH_ALL_VIEWS);

      await page.getByRole("button", { name: "Open reference" }).click();

      const samplesTab = page.locator(".reference-panel-tab", { hasText: "Samples" });
      await samplesTab.click();
      await expect(samplesTab).toHaveClass(/active/);

      // The samples tab body shows the sampleKrs source covering all three blocks.
      const content = page.locator(".reference-panel-content");
      await expect(content).toContainText("system");
      await expect(content).toContainText("deploy");
      await expect(content).toContainText("organization");

      // The Copy button is present and bound (the actual clipboard side
      // effect plus the "Copy → Copied!" toggle stays in the manual checklist
      // because the headless Chromium clipboard permission is environment-
      // dependent).
      await expect(content.locator(".reference-copy-btn")).toBeVisible();
    });
  });
}
