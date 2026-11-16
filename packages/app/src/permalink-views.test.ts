import { describe, expectTypeOf, it } from "vitest";
import type { ShareTargetView } from "@karasu-tools/core";
import type { ActiveView } from "./state/app-reducer.js";

/**
 * The app's views and the views a deep permalink can name are one set
 * (docs/spec/permalink.md: `ActiveView`, mirrored by `ShareTargetView`). The
 * producers and parsers on both sides are exhaustive over their own union
 * (`buildHash`'s switch, `PARSE_DISPATCHERS`, `SHARE_TARGET_VIEWS`, the static
 * bundle's `BUNDLE_VIEWS`), so tying the two unions makes a view added to
 * either one a compile error on every producer and parser (TPL-1827, TPL-1094).
 * The check is the typecheck; the test body only names it.
 */
describe("the app's views", () => {
  it("are the views a permalink can name", () => {
    expectTypeOf<ActiveView>().toEqualTypeOf<ShareTargetView>();
  });
});
