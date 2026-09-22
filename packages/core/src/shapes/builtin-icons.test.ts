import { describe, it, expect, afterAll } from "vitest";
// Import through the package entry, exactly as a host does — the point of
// these tests is that importing core is all a host has to do (TPL-2802).
import {
  CLIENT_SUBTYPE_TAGS,
  clearRegistry,
  compile,
  getIconDef,
  hasShape,
  resetRegistryToBuiltins,
} from "../index.js";
import { ICON_RULES } from "../builtins/icon-theme.js";
import { BUILTIN_ICON_SOURCES } from "./builtin-icons.generated.js";

/** Every name core ships, read from the generated set rather than a copy. */
const BUILTIN_ICON_NAMES = BUILTIN_ICON_SOURCES.map((s) => s.name);

/** A path only `icons/database.svg` draws — the cylinder's side wall. */
const DATABASE_PICTOGRAM = "M2 4v12c0 1.7 3.6 3 8 3s8-1.3 8-3V4";
/** A path only `icons/service.svg` draws — the gear's ring. */
const SERVICE_PICTOGRAM = "M10 0a10 10 0 0 1 4.5 1.1";

const MODEL = `system Shop {
  service Api {
    label "API"
  }
}`;

afterAll(() => {
  // Leave the registry as core ships it for anything that runs after.
  resetRegistryToBuiltins();
});

describe("built-in icons register on import (#2802, TPL-2802)", () => {
  it("every manifest icon is a registered, built-in shape without any host call", () => {
    expect(BUILTIN_ICON_NAMES.length).toBeGreaterThanOrEqual(30);
    const unregistered = BUILTIN_ICON_NAMES.filter((name) => !hasShape(name));
    expect(unregistered).toEqual([]);
    const notBuiltIn = BUILTIN_ICON_NAMES.filter((name) => getIconDef(name)?.builtIn !== true);
    expect(notBuiltIn).toEqual([]);
  });

  it('draws `shape: url("database")` as the database icon with no host registration', () => {
    const { svg, warnings } = compile(MODEL, {
      diagramType: "system",
      styleSource: `service { shape: url("database"); }`,
    });
    expect(svg).toContain(DATABASE_PICTOGRAM);
    expect(warnings.filter((w) => w.kind === "style-unknown-icon")).toEqual([]);
  });

  it("draws icon display mode with the built-in icons, with no host registration", () => {
    const { svg } = compile(MODEL, { diagramType: "system", displayMode: "icon" });
    expect(svg).toContain(SERVICE_PICTOGRAM);
  });

  it("still falls back to box for an unknown name, and now says so", () => {
    const { svg, warnings } = compile(MODEL, {
      diagramType: "system",
      styleSource: `service { shape: url("databse"); }`,
    });
    expect(svg).not.toContain(DATABASE_PICTOGRAM);
    expect(warnings).toContainEqual(
      expect.objectContaining({
        kind: "style-unknown-icon",
        params: { property: "shape", name: "databse" },
      }),
    );
  });

  // #2715 / TPL-2715: a sheet passed as a string is a second document with no
  // path, so a position on it would be read against the `.krs`. The named
  // sheet keeps its position — `builtin-icons-extension-host.test.ts` in
  // packages/vscode asserts that half through `compileProject`.
  it("reports the warning without a position when the sheet was handed in as a string", () => {
    const { warnings } = compile(MODEL, {
      diagramType: "system",
      styleSource: `service {\n  shape: url("databse");\n}`,
    });
    const warning = warnings.find((w) => w.kind === "style-unknown-icon");
    expect(warning).toBeDefined();
    expect(warning).not.toHaveProperty("loc");
  });
});

describe("icon theme parity — every name the theme generates is registered (TPL-1415)", () => {
  it("ICON_RULES only name built-in icons", () => {
    const missing = ICON_RULES.map((r) => r.icon).filter((icon) => !hasShape(icon));
    expect(missing).toEqual([]);
  });

  it("every client subtype has its client-<subtype> variant registered", () => {
    const missing = CLIENT_SUBTYPE_TAGS.map((t) => `client-${t}`).filter((n) => !hasShape(n));
    expect(missing).toEqual([]);
  });
});

describe("resetRegistryToBuiltins()", () => {
  it("restores every shape and icon core ships, so a reset cannot restore half", () => {
    clearRegistry();
    expect(hasShape("box")).toBe(false);
    expect(hasShape("database")).toBe(false);

    resetRegistryToBuiltins();

    // A geometric shape and an icon: the two places core fills the registry
    // from. Restoring one and not the other is the trap this helper closes.
    expect(hasShape("box")).toBe(true);
    expect(hasShape("database")).toBe(true);
    expect(getIconDef("database")?.builtIn).toBe(true);
  });
});
