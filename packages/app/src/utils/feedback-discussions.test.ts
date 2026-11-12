import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { FEEDBACK_CATEGORY_SLUG, FEEDBACK_DISCUSSION_URL } from "./feedback-discussions.js";

/**
 * GitHub shows a discussion form only when the category's slug names a file in
 * `.github/DISCUSSION_TEMPLATE/`. A renamed file or slug still opens the
 * category, just without the form and its warning about private share links,
 * so nothing would look broken (#3689).
 */
const REPO_ROOT = fileURLToPath(new URL("../../../../", import.meta.url));

describe("feedback discussions link", () => {
  it("preselects the category whose form is in .github/DISCUSSION_TEMPLATE", () => {
    expect(new URL(FEEDBACK_DISCUSSION_URL).searchParams.get("category")).toBe(
      FEEDBACK_CATEGORY_SLUG,
    );
    expect(
      existsSync(`${REPO_ROOT}.github/DISCUSSION_TEMPLATE/${FEEDBACK_CATEGORY_SLUG}.yml`),
    ).toBe(true);
  });
});
