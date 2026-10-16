import { test, expect } from "../../fixtures/opfs";

/**
 * Smoke test for the network base fixture (#3249). The app asks Google Fonts
 * for its web fonts on every boot; the fixture must answer that request
 * itself, so a stalled third-party host can no longer hold `page.goto` past
 * the test timeout.
 */
test.describe("network fixture smoke", () => {
  test("Google Fonts requests are answered by the stub, not the network", async ({
    page,
    opfs,
  }) => {
    // Start reading each body as the response arrives (the browser drops it
    // soon after), and turn a failed read into a value so a page that closes
    // first leaves no unhandled rejection behind.
    const stylesheetResponses: Promise<{ status: number; body: string }>[] = [];
    page.on("response", (response) => {
      if (!response.url().startsWith("https://fonts.googleapis.com/")) return;
      stylesheetResponses.push(
        response.text().then(
          (body) => ({ status: response.status(), body }),
          (error: unknown) => ({
            status: response.status(),
            body: `<unreadable: ${String(error)}>`,
          }),
        ),
      );
    });

    await opfs.seed({ mode: "memory" });
    await opfs.gotoApp();
    await expect(page.locator(".preview-container")).toBeVisible();

    // The app still asks for the stylesheet; the stub answers with an empty
    // one, where the real host would return `@font-face` rules.
    await expect.poll(() => stylesheetResponses.length).toBeGreaterThan(0);
    for (const response of await Promise.all(stylesheetResponses)) {
      expect(response).toEqual({ status: 200, body: "" });
    }

    // That empty stylesheet names no font files, so the app never reaches
    // fonts.gstatic.com on its own. Fetch one so that host's stub is exercised
    // too: the real host would answer this made-up path with a 404 page.
    const fontFile = await page.evaluate(async () => {
      const response = await fetch("https://fonts.gstatic.com/network-fixture-smoke.woff2");
      return { status: response.status, body: await response.text() };
    });
    expect(fontFile).toEqual({ status: 200, body: "" });
  });
});
