import { test, expect } from "../../fixtures/opfs";
import { GOOGLE_FONTS_URL } from "../../fixtures/network";

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
    const fontResponses: Promise<{ status: number; body: string }>[] = [];
    page.on("response", (response) => {
      if (!GOOGLE_FONTS_URL.test(response.url())) return;
      fontResponses.push(
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

    // The app still asks for the fonts; the stub answers with an empty
    // stylesheet, where the real host would return `@font-face` rules.
    await expect.poll(() => fontResponses.length).toBeGreaterThan(0);
    for (const response of await Promise.all(fontResponses)) {
      expect(response).toEqual({ status: 200, body: "" });
    }
  });
});
