import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Fences the Node.js baseline decided in ADR-2397. The version is pinned in
// three unrelated shapes — `node-version:` in every workflow, the devcontainer
// base image tag, and `engines.node` / esbuild `--target=nodeNN` in the
// published packages — so a bump is a sweep, and a sweep closed by a
// hand-written file list leaves survivors (TPL-2253: the enumeration in Issue
// #2397 missed `examples/github-actions/*.yml`, found only by searching).
//
// The invariant is not "we are on Node 24" but "every pin agrees". A partial
// bump is silent otherwise: CI stays green on the files that were updated, and
// the stragglers keep building against a runtime nobody intends to support.

const REPO_ROOT = resolve(import.meta.dirname, "../..");

/** The Node major the toolchain runs on: CI, the devcontainer, the templates. */
const NODE_MAJOR = "24";

/**
 * The Node major the published packages claim to support. Trails `NODE_MAJOR`
 * on purpose: `karasu` and `@karasu-tools/core` are consumed by other people,
 * so the floor drops one LTS line at a time and only off an EOL line. Keeping
 * it below the CI major is fine; above it would mean CI never exercises the
 * oldest runtime we advertise.
 */
const ENGINES_FLOOR_MAJOR = "22";

/**
 * Directories whose `.yml` files carry a toolchain pin. `examples/github-actions`
 * is in scope because those templates are copied into users' repos verbatim
 * (`docs/github-actions.md`), so they are advice about which runtime to run
 * karasu on — not decoration.
 */
const PINNED_WORKFLOW_DIRS = [".github/workflows", "examples/github-actions"];

const DEVCONTAINER_DOCKERFILE = ".devcontainer/Dockerfile";

type Pin = { readonly where: string; readonly value: string };

const read = (path: string): string => readFileSync(join(REPO_ROOT, path), "utf8");

const ymlFilesIn = (dirs: readonly string[]): string[] =>
  dirs
    .flatMap((dir) =>
      readdirSync(join(REPO_ROOT, dir))
        .filter((name) => name.endsWith(".yml"))
        .map((name) => `${dir}/${name}`),
    )
    .sort();

/** The root manifest plus every workspace package manifest. */
const packageManifests = (): string[] =>
  [
    "package.json",
    ...readdirSync(join(REPO_ROOT, "packages")).map((p) => `packages/${p}/package.json`),
  ]
    .filter((file) => existsSync(join(REPO_ROOT, file)))
    .sort();

/** Every `node-version: "<v>"` line, tagged with `<file>:<line>`. */
function readNodeVersionPins(file: string): Pin[] {
  return read(file)
    .split("\n")
    .flatMap((line, index) => {
      const match = /^\s*node-version:\s*"([^"]+)"/.exec(line);
      return match ? [{ where: `${file}:${index + 1}`, value: match[1] }] : [];
    });
}

/** Every `engines.node` range across the workspace, tagged with its manifest. */
function readEnginesFloors(): Pin[] {
  return packageManifests().flatMap((file) => {
    const manifest = JSON.parse(read(file)) as { engines?: { node?: string } };
    const node = manifest.engines?.node;
    return node === undefined ? [] : [{ where: file, value: node }];
  });
}

/** Every esbuild `--target=nodeNN`, tagged with the manifest it appears in. */
function readEsbuildTargets(): Pin[] {
  return packageManifests().flatMap((file) =>
    [...read(file).matchAll(/--target=node(\d+)/g)].map((m) => ({ where: file, value: m[1] })),
  );
}

const workflowFiles = ymlFilesIn(PINNED_WORKFLOW_DIRS);
const pins = workflowFiles.flatMap(readNodeVersionPins);

describe("Node.js version policy (ADR-2397)", () => {
  it("finds the pins it is meant to guard", () => {
    // Parser sanity: a reformat (or a glob that stops matching) would otherwise
    // make every assertion below pass over an empty set.
    expect(workflowFiles.length).toBeGreaterThan(15);
    expect(pins.length).toBeGreaterThan(15);
    expect(readEnginesFloors().length).toBeGreaterThan(0);
    expect(readEsbuildTargets().length).toBeGreaterThan(0);
  });

  it("pins every workflow and shipped template to the same Node major", () => {
    const offenders = pins
      .filter((pin) => pin.value !== NODE_MAJOR)
      .map((pin) => `${pin.where} → ${pin.value}`);
    expect(offenders).toEqual([]);
  });

  it("builds the devcontainer on that same Node major", () => {
    const image = /^FROM\s+\S*typescript-node:(\S+)/m.exec(read(DEVCONTAINER_DOCKERFILE));
    expect(
      image,
      `no typescript-node base image found in ${DEVCONTAINER_DOCKERFILE}`,
    ).not.toBeNull();
    // Tag shape is `<feature-version>-<node-major>-<distro>`, e.g. `1-24-bookworm`.
    expect(image?.[1].split("-")[1]).toBe(NODE_MAJOR);
  });

  it("declares one engines floor across the workspace, at or below the CI major", () => {
    const floors = readEnginesFloors();
    const offenders = floors
      .filter((floor) => floor.value !== `>=${ENGINES_FLOOR_MAJOR}`)
      .map((floor) => `${floor.where} → ${floor.value}`);
    expect(offenders).toEqual([]);
    expect(Number(ENGINES_FLOOR_MAJOR)).toBeLessThanOrEqual(Number(NODE_MAJOR));
  });

  it("compiles the CLI bundle down to the engines floor, not to some older line", () => {
    // ADR-1315 set `engines.node` and `--target=nodeNN` together. Raising only
    // the former leaves the shipped bundle downlevelled for a runtime we no
    // longer claim to support — green everywhere, and invisible until someone
    // reads the build script.
    const offenders = readEsbuildTargets()
      .filter((target) => target.value !== ENGINES_FLOOR_MAJOR)
      .map((target) => `${target.where} → --target=node${target.value}`);
    expect(offenders).toEqual([]);
  });
});
