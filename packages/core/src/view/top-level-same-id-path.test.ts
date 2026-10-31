import { describe, it, expect } from "vitest";
import { extractView, extractEntityView } from "./view-extract.js";
import { resolveContainerChain } from "./view-path.js";
import { withUnassignedSystem } from "./unassigned-system.js";
import { Parser } from "../parser/parser.js";

/**
 * #3113: a path with no system segment names a top-level node first. Before the
 * fix it went to the first real system owning its first segment, so a
 * top-level node sharing its id with a system's child could not be drilled
 * into (`["Api", "Parked"]` was empty, `["Api"]` opened `Shop.Api`).
 */
const SRC = `
system Shop {
  service Api {
    domain Orders { usecase Place {} }
    domain Core { entity A {} }
  }
}
service Api {
  domain Parked { usecase P {} }
  domain Core { entity B {} }
}
`;

const krsFile = Parser.parse(SRC).value;
const systems = withUnassignedSystem(krsFile);
const ids = (nodes: { id: string }[]): string[] => nodes.map((n) => n.id).sort();
const chainOf = (path: string[]): string[] | undefined =>
  resolveContainerChain(systems, path)?.ancestorChain.map((n) => n.id);

describe("resolveContainerChain: a path with no system segment (#3113)", () => {
  it("walks a top-level node's path from the Unassigned pseudo-system", () => {
    expect(chainOf(["Api", "Parked"])).toEqual(["__unassigned__", "Api", "Parked"]);
    expect(ids(extractView(systems, ["Api", "Parked"]).childNodes)).toEqual(["P"]);
  });

  it("lands a path both a top-level node and a system's child walk on the top-level node", () => {
    expect(chainOf(["Api"])).toEqual(["__unassigned__", "Api"]);
    expect(ids(extractView(systems, ["Api"]).childNodes)).toEqual(["Core", "Parked"]);
  });

  it("still resolves a system-less path that only a system's child walks", () => {
    expect(chainOf(["Api", "Orders"])).toEqual(["Shop", "Api", "Orders"]);
    expect(ids(extractView(systems, ["Api", "Orders"]).childNodes)).toEqual(["Place"]);
  });

  it("leaves a path that starts with a system id unchanged", () => {
    expect(chainOf(["Shop", "Api"])).toEqual(["Shop", "Api"]);
    expect(ids(extractView(systems, ["Shop", "Api"]).childNodes)).toEqual(["Core", "Orders"]);
    expect(chainOf(["__unassigned__", "Api", "Parked"])).toEqual([
      "__unassigned__",
      "Api",
      "Parked",
    ]);
  });

  it("reports how many leading segments the system took", () => {
    expect(resolveContainerChain(systems, ["Api", "Parked"])?.startIndex).toBe(0);
    expect(resolveContainerChain(systems, ["Shop", "Api"])?.startIndex).toBe(1);
  });

  it("returns null when no candidate walks the whole path", () => {
    expect(chainOf(["Api", "Missing"])).toBeUndefined();
    expect(chainOf([])).toBeUndefined();
  });

  it("gives the entity view the same resolution", () => {
    expect(ids(extractEntityView(systems, ["Api", "Core"]).childNodes)).toEqual(["B"]);
    expect(ids(extractEntityView(systems, ["Shop", "Api", "Core"]).childNodes)).toEqual(["A"]);
  });

  it("prefers the top-level nodes a caller passes separately when there is no pseudo-system", () => {
    // The drawio exporter's shape: real systems only, top-level nodes on the side.
    const real = krsFile.systems;
    expect(
      resolveContainerChain(real, ["Api", "Parked"], krsFile.services)?.ancestorChain.map(
        (n) => n.id,
      ),
    ).toEqual(["Shop", "Api", "Parked"]);
    expect(ids(extractView(real, ["Api", "Parked"], [], krsFile.services).childNodes)).toEqual([
      "P",
    ]);
    expect(ids(extractView(real, ["Api", "Orders"], [], krsFile.services).childNodes)).toEqual([
      "Place",
    ]);
  });

  it("keeps resolving a top-level node passed separately under a system id, as before", () => {
    // Those callers draw top-level nodes inside the first system's frame.
    const real = krsFile.systems;
    expect(
      resolveContainerChain(
        real,
        ["Shop", "Parked"],
        [],
        krsFile.services[0].children,
      )?.ancestorChain.map((n) => n.id),
    ).toEqual(["Shop", "Parked"]);
  });
});
