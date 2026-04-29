import { test, expect } from "../../fixtures/opfs";

/**
 * Smoke tests for the OPFS fixture itself. Verifies that:
 *
 * 1. `reset()` produces an empty OPFS, after which the app's first-run
 *    seeding kicks in and populates the ProjectSelector dropdown.
 * 2. `seed()` materializes a custom project that the app picks up on boot
 *    and pre-selects via `lastProjectId`.
 * 3. `seed({ mode: "memory" })` routes through `?mode=memory` so
 *    `MemoryModeApp` renders instead of `ProjectModeApp`.
 *
 * If these pass, the fixture is ready to back AT-0004 (#865) and
 * AT-0014 (#866).
 */
test.describe("OPFS fixture smoke", () => {
  test("reset() leaves OPFS empty so the app seeds default projects", async ({ page, opfs }) => {
    await opfs.reset();
    await opfs.gotoApp();

    const dropdown = page.locator(".project-selector select.project-selector-dropdown");
    await expect(dropdown).toBeVisible();
    // First-run seeding writes the Getting Started project plus the ec-platform
    // examples. We don't pin the exact count here — just confirm seeding ran.
    await expect(dropdown.locator("option")).not.toHaveCount(0);
    await expect(dropdown.locator('option:has-text("01-system")')).toHaveCount(1);
  });

  test("seed() materializes a custom project that is preselected on boot", async ({
    page,
    opfs,
  }) => {
    await opfs.seed({
      projects: [
        {
          id: "fixture-only",
          name: "Fixture Only",
          files: { "index.krs": 'system "Fixture Only" {}\n' },
        },
      ],
      lastProjectId: "fixture-only",
    });
    await opfs.gotoApp();

    const dropdown = page.locator(".project-selector select.project-selector-dropdown");
    await expect(dropdown).toBeVisible();
    await expect(dropdown).toHaveValue("fixture-only");
    await expect(dropdown.locator("option")).toHaveCount(1);

    // The seeded file must be reachable from the host side too.
    const indexContent = await opfs.read("/projects/fixture-only/index.krs");
    expect(indexContent).toBe('system "Fixture Only" {}\n');
  });

  test("seed({ mode: 'memory' }) boots MemoryModeApp without OPFS state", async ({
    page,
    opfs,
  }) => {
    await opfs.seed({ mode: "memory" });
    await opfs.gotoApp();

    // MemoryModeApp does not render the ProjectSelector toolbar.
    await expect(page.locator(".project-selector")).toHaveCount(0);
    expect(opfs.mode).toBe("memory");
  });

  test("seed() pins karasu-locale=en by default after wiping localStorage (#1007)", async ({
    page,
    opfs,
  }) => {
    await opfs.seed({ projects: [], lastProjectId: undefined });
    const locale = await page.evaluate(() => localStorage.getItem("karasu-locale"));
    expect(locale).toBe("en");
  });

  test("reset() also pins karasu-locale=en by default (#1007)", async ({ page, opfs }) => {
    await opfs.reset();
    const locale = await page.evaluate(() => localStorage.getItem("karasu-locale"));
    expect(locale).toBe("en");
  });

  test("seed({ pinLocale: null }) leaves karasu-locale unset (#1007)", async ({ page, opfs }) => {
    await opfs.seed({ pinLocale: null });
    const locale = await page.evaluate(() => localStorage.getItem("karasu-locale"));
    expect(locale).toBeNull();
  });

  test("seed({ pinLocale: 'ja' }) pins karasu-locale=ja (#1007)", async ({ page, opfs }) => {
    await opfs.seed({ pinLocale: "ja" });
    const locale = await page.evaluate(() => localStorage.getItem("karasu-locale"));
    expect(locale).toBe("ja");
  });

  test("seed({ mode: 'memory', projects }) silently drops the projects payload", async ({
    opfs,
  }) => {
    await opfs.seed({
      mode: "memory",
      projects: [
        {
          id: "should-not-be-written",
          name: "Should Not Be Written",
          files: { "index.krs": 'system "X" {}\n' },
        },
      ],
    });

    // Memory mode does not touch OPFS — the meta file and project tree must
    // remain absent. Locks the contract before downstream tests rely on it.
    expect(await opfs.read("/meta/projects.json")).toBeNull();
    expect(await opfs.read("/projects/should-not-be-written/index.krs")).toBeNull();
  });
});
