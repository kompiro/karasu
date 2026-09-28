import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { RELEASED_PACKAGES } from "./github-release.mts";

// RELEASED_PACKAGES decides what the release train lists in its Issue and
// commit subject, and which package tags the `record` job turns into the
// GitHub Release. `changeset publish` does not read it, so a package missing
// from it still ships to npm but silently drops out of the release record:
// `karasu-skills` did exactly that on its first train (#2932, Issue #2979).
//
// The invariant: every package the repo publishes is listed. That is every
// non-private workspace package (npm), plus the VS Code extension, which is
// private to npm but released to the Marketplace by the same train.

const REPO_ROOT = resolve(import.meta.dirname, "../..");

/** Released even though `private: true` keeps it off npm. */
const RELEASED_PRIVATE = new Set(["karasu-vscode"]);

type Manifest = { name: string; private?: boolean };

const workspacePackages = readdirSync(join(REPO_ROOT, "packages"), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => join("packages", entry.name))
  .filter((dir) => existsSync(join(REPO_ROOT, dir, "package.json")))
  .map((dir) => ({
    dir,
    manifest: JSON.parse(readFileSync(join(REPO_ROOT, dir, "package.json"), "utf8")) as Manifest,
  }));

describe("RELEASED_PACKAGES", () => {
  it("lists every package the release train publishes", () => {
    const published = workspacePackages
      .filter(({ manifest }) => !manifest.private || RELEASED_PRIVATE.has(manifest.name))
      .map(({ manifest }) => manifest.name)
      .sort();
    expect(RELEASED_PACKAGES.map(({ name }) => name).sort()).toEqual(published);
  });

  it("points each entry at the directory whose package.json has that name", () => {
    const actual = RELEASED_PACKAGES.map(({ dir }) => ({
      dir,
      name: workspacePackages.find((pkg) => pkg.dir === dir)?.manifest.name,
    }));
    expect(actual).toEqual(RELEASED_PACKAGES.map(({ name, dir }) => ({ dir, name })));
  });
});
