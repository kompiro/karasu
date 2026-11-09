import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

// What a package publishes is decided by its `files` (and `.npmignore`), and
// what those let through depends on what happens to sit in the directories they
// name. A whole-directory entry ships whatever a local or stale build left
// there: compiled tests, test type definitions, source maps of sources the
// tarball does not carry (TPL-1681).
//
// So this asks the packer itself, without building anything: for each
// publishable workspace package it copies the manifest into an empty directory,
// plants probe files of each excluded kind in every directory `files` names,
// and runs `pnpm pack --dry-run`. A probe in the listing is a kind of file the
// package would ship if a build ever emitted it. A new publishable package is
// enumerated the day it lands. The real tarballs are checked by
// `packages/cli/pack/serve-from-tarball.test.ts` and
// `scripts/skills/karasu-skills-package.test.ts`.

const ROOT = resolve(import.meta.dirname, "../..");

/**
 * Files a tarball must not carry, as names planted in each shipped directory.
 * Only these kinds are probed: an arbitrary dev-only file (a script, a config)
 * has no name to plant, so it stays outside this check (TPL-1681 says so).
 */
const PROBES = [
  "probe.test.js",
  "probe.test.mjs",
  "probe.test.ts",
  "probe.spec.js",
  "probe.spec.ts",
  "probe.test.d.ts",
  "probe.js.map",
  "probe.d.ts.map",
];

/**
 * Shipped directories that may hold probes because the package's pack empties
 * and refills them, and the reason. The packer runs no scripts here, so it
 * cannot see that.
 */
const REFILLED_ON_PACK: Record<string, Record<string, string>> = {
  karasu: {
    "dist/app/":
      "`prepack` runs `build:app`, whose `scripts/stage-app.ts` empties dist/app/ and copies in the serve build, which emits no source maps (vite.serve.config.ts); packages/cli/src/packaging.test.ts pins that script.",
  },
};

interface Manifest {
  name: string;
  private?: boolean;
  files?: string[];
}

const PUBLISHABLE = readdirSync(resolve(ROOT, "packages"), { withFileTypes: true })
  // A leftover directory without a manifest is not a package.
  .filter(
    (entry) =>
      entry.isDirectory() && existsSync(join(ROOT, "packages", entry.name, "package.json")),
  )
  .map((entry) => ({
    dir: join(ROOT, "packages", entry.name),
    manifest: JSON.parse(
      readFileSync(join(ROOT, "packages", entry.name, "package.json"), "utf-8"),
    ) as Manifest,
  }))
  .filter(({ manifest }) => manifest.private !== true);

/**
 * The directories a `files` list ships: entries ending in `/`, entries that are
 * directories in the package, and extensionless entries (`dist` before a
 * build). A glob ships from its static prefix. No `files` ships the root.
 */
function shippedDirs(pkgDir: string, files: readonly string[] | undefined): string[] {
  if (files === undefined) return [""];
  return files
    .filter((entry) => !entry.startsWith("!"))
    .flatMap((entry) => {
      const glob = entry.search(/[*?{[]/);
      if (glob >= 0) return [entry.slice(0, entry.lastIndexOf("/", glob) + 1)];
      if (entry.endsWith("/")) return [entry];
      const real = join(pkgDir, entry);
      if (existsSync(real) ? statSync(real).isDirectory() : !/\.[^/]+$/.test(entry))
        return [`${entry}/`];
      return [];
    });
}

const work = mkdtempSync(join(tmpdir(), "karasu-pack-probe-"));
afterAll(() => rmSync(work, { recursive: true, force: true }));

/** The paths `pnpm pack --dry-run` lists for the package with probes planted. */
function packedProbes(pkgDir: string, manifest: Manifest): string[] {
  const dir = join(work, manifest.name.replace(/[@/]/g, "_"));
  mkdirSync(dir, { recursive: true });
  // Only what decides the listing: no scripts, so nothing builds or stamps.
  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify({ name: manifest.name, version: "0.0.0", files: manifest.files }),
  );
  if (existsSync(join(pkgDir, ".npmignore")))
    copyFileSync(join(pkgDir, ".npmignore"), join(dir, ".npmignore"));
  for (const shipped of shippedDirs(pkgDir, manifest.files)) {
    for (const probe of PROBES) {
      const path = join(dir, shipped, "nested", probe);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, "");
      writeFileSync(join(dir, shipped, probe), "");
    }
  }
  const listing = JSON.parse(
    execFileSync("pnpm", ["pack", "--dry-run", "--json"], { cwd: dir, encoding: "utf-8" }),
  ) as { files: { path: string }[] };
  return listing.files
    .map((file) => file.path)
    .filter((path) => PROBES.some((probe) => path.endsWith(probe)));
}

describe("publishable tarballs leave out test and source-map files (TPL-1681)", () => {
  it("finds the publishable packages", () => {
    // Sanity: an empty enumeration would pass every test below.
    expect(PUBLISHABLE.map(({ manifest }) => manifest.name)).toEqual(
      expect.arrayContaining(["@karasu-tools/core", "karasu"]),
    );
  });

  it.each(PUBLISHABLE.map(({ dir, manifest }) => ({ name: manifest.name, dir, manifest })))(
    "$name ships no probe outside a directory its pack refills",
    ({ dir, manifest }) => {
      const refilled = Object.keys(REFILLED_ON_PACK[manifest.name] ?? {});
      const packed = packedProbes(dir, manifest);
      expect(packed.filter((path) => !refilled.some((prefix) => path.startsWith(prefix)))).toEqual(
        [],
      );
      // An exemption that no longer exempts anything has outlived its reason.
      expect(refilled.filter((prefix) => !packed.some((path) => path.startsWith(prefix)))).toEqual(
        [],
      );
    },
  );

  it("plants probes where a whole-directory entry would ship them", () => {
    expect(
      shippedDirs("/nonexistent", ["dist", "dist/index.js", "dist/app/", "lib/*.js", "!dist/x"]),
    ).toEqual(["dist/", "dist/app/", "lib/"]);
    expect(shippedDirs("/nonexistent", undefined)).toEqual([""]);
  });
});
