import { describe, expect, it } from "vitest";
import { publishedPackages } from "./published-packages.mts";

// Fences the tag check added for #2982. The fixture is the `changeset publish`
// output of release run 36555712361 (release train 2026-09-28), escape
// sequences included, as GitHub Actions logged it.
const RUN_36555712361 = [
  "🦋 changeset v3.0.3",
  "",
  "These packages will be published as they were not found in the registry:",
  "karasu@0.8.0",
  "@karasu-tools/core@0.3.1",
  "1 packages are already published.",
  "\u001b[?25l◒  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ Publishing packages...",
  "\u001b[1G\u001b[J◐  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ Publishing packages (1/2)...",
  "\u001b[1G\u001b[J◇  Successfully published:",
  "@karasu-tools/core@0.3.1",
  "karasu@0.8.0",
  "\u001b[?25h\u001b[?25l◒  Creating git tags...",
  "\u001b[1G\u001b[J◇  Created git tags.",
  "\u001b[?25h",
].join("\n");

describe("publishedPackages", () => {
  it("reads the packages listed under 'Successfully published:'", () => {
    expect(publishedPackages(RUN_36555712361)).toEqual([
      "@karasu-tools/core@0.3.1",
      "karasu@0.8.0",
    ]);
  });

  it("ignores the pre-publish plan, which lists packages that may still fail", () => {
    const planOnly = RUN_36555712361.slice(0, RUN_36555712361.indexOf("1 packages are already"));
    expect(publishedPackages(planOnly)).toEqual([]);
  });

  it("does not count packages under 'Some packages failed to publish:'", () => {
    const log = [
      "◇  Successfully published:",
      "karasu@0.8.0",
      "",
      "Some packages failed to publish:",
      "@karasu-tools/core@0.3.1",
    ].join("\n");
    expect(publishedPackages(log)).toEqual(["karasu@0.8.0"]);
  });

  it("returns nothing for a run that published nothing", () => {
    expect(publishedPackages("🦋 changeset v3.0.3\nNo unpublished projects to publish\n")).toEqual(
      [],
    );
  });
});
