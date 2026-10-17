import { test as base } from "@playwright/test";

/**
 * Base fixture every other `test` in this package extends (#3249).
 *
 * The app pulls its web fonts from Google Fonts with a CSS `@import`
 * (`packages/app/src/styles/web-fonts.css`), and an `@import`ed stylesheet
 * holds the page's `load` event until it arrives. `page.goto` waits for
 * `load`, so a stalled request to Google Fonts on the CI runner timed out a
 * test that had nothing to do with fonts (nightly run 38808705485).
 *
 * The auto fixture below answers every Google Fonts request with an empty
 * body before it leaves the browser: no test depends on reaching that host,
 * and every run renders with the same fallback stacks from `tokens.css`.
 * Diagram layout does not move with it, since node sizes come from
 * `estimateTextWidth`, not from measuring the rendered font.
 */
const GOOGLE_FONTS_URL = /^https:\/\/fonts\.(googleapis|gstatic)\.com\//;

export const test = base.extend<{ stubWebFonts: void }>({
  stubWebFonts: [
    async ({ context }, use) => {
      await context.route(GOOGLE_FONTS_URL, (route) =>
        route.fulfill({
          status: 200,
          contentType: route.request().resourceType() === "stylesheet" ? "text/css" : "font/woff2",
          // Google Fonts serves both hosts with this header; fonts are fetched
          // in CORS mode, so the stub keeps it.
          headers: { "access-control-allow-origin": "*" },
          body: "",
        }),
      );
      await use();
    },
    { auto: true },
  ],
});

export { expect } from "@playwright/test";
