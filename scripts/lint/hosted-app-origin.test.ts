import { describe, expect, it } from "vitest";
import { HOSTED_APP_ORIGIN } from "../../packages/app/src/utils/hosted-app.js";
import { APP_URL } from "../../packages/docs-site/scripts/lib/site-map.js";

// The public app's URL lives in two places: the app builds `karasu serve`'s
// Share links on it (#3162), and the docs site links "Open in the app" to it
// (ADR-1809). Kept as two constants so neither package imports the other; this
// test keeps them equal.
describe("the public app's URL", () => {
  it("is the same in the app and in the docs site", () => {
    expect(HOSTED_APP_ORIGIN).toBe(APP_URL);
  });
});
