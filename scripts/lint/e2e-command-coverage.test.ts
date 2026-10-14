import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import {
  APP_SRC_DIR,
  E2E_TESTS_DIR,
  EXEMPT,
  check,
  chordToPlaywright,
  collectCommands,
  topLevelProps,
} from "./e2e-command-coverage.ts";

const REPO_ROOT = resolve(import.meta.dirname, "../..");

describe("chordToPlaywright", () => {
  it("maps mod to ControlOrMeta and title-cases modifiers and letters", () => {
    expect(chordToPlaywright("mod+shift+p")).toBe("ControlOrMeta+Shift+P");
    expect(chordToPlaywright("mod+b")).toBe("ControlOrMeta+B");
    expect(chordToPlaywright("mod+1")).toBe("ControlOrMeta+1");
    expect(chordToPlaywright("mod+alt+shift+2")).toBe("ControlOrMeta+Alt+Shift+2");
  });
});

describe("topLevelProps", () => {
  it("reads only the object's own properties, not those nested in `run`", () => {
    const props = topLevelProps(`
      id: "view.showRelations",
      title: "Show Relations, of a node",
      run: () => { openFocus({ kind: "node", id: highlightedNodeId }); },
    `);
    expect(props.get("id")).toBe('"view.showRelations"');
    expect(props.get("title")).toBe('"Show Relations, of a node"');
    expect([...props.keys()]).toEqual(["id", "title", "run"]);
  });

  it("reads shorthand properties", () => {
    const props = topLevelProps("id, title, keybinding, run: onShow");
    expect(props.get("id")).toBe("id");
    expect(props.get("keybinding")).toBe("keybinding");
  });
});

describe("the app registry against the real e2e suite", () => {
  it("finds the commands of every registration form", () => {
    const byId = new Map(collectCommands(REPO_ROOT).map((c) => [c.id, c]));
    // Object literal, with a keybinding.
    expect(byId.get("view.showDeploy")?.keybinding).toBe("mod+2");
    // Same-file const id (CommandPalette.tsx).
    expect(byId.get("command.openCommandPalette")?.keybinding).toBe("mod+shift+p");
    // Prop passthrough: the id and keybinding come from `<SidebarViewCommand …>`.
    expect(byId.get("view.showFiles")?.keybinding).toBe("mod+shift+e");
    expect(byId.get("view.showOutline")?.keybinding).toBe("mod+shift+o");
    // Palette-only.
    expect(byId.get("project.switch")?.keybinding).toBeUndefined();
    // HTML ids are not commands.
    expect(byId.has("settings-language")).toBe(false);
    expect(byId.has("command-palette-list")).toBe(false);
  });

  it("drives every non-exempt command from some spec", () => {
    expect(check(REPO_ROOT)).toEqual([]);
  });

  it("keeps every EXEMPT entry justified with a reason", () => {
    for (const [, reason] of EXEMPT) expect(reason.length).toBeGreaterThan(0);
  });
});

describe("check (synthetic fixture)", () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "e2e-command-coverage-"));
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  function write(rel: string, content: string) {
    const abs = join(root, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  }
  const app = (name: string, content: string) => write(join(APP_SRC_DIR, name), content);
  const spec = (name: string, content: string) => write(join(E2E_TESTS_DIR, name), content);
  const noExempt = new Map<string, string>();

  it("fails when a keybinding is added without a spec", () => {
    app(
      "Zoom.tsx",
      `useCommand({ id: "view.zoomIn", title: "Zoom In", keybinding: "mod+shift+z", run });`,
    );
    spec("at-1-other.spec.ts", `await page.keyboard.press("ControlOrMeta+Shift+Y");`);
    expect(check(root, noExempt).map((p) => p.id)).toEqual(["view.zoomIn"]);
  });

  it("fails when a palette-only command is added without a spec", () => {
    app("Export.tsx", `useCommand({ id: "file.export", title: "Export", run });`);
    spec("at-1-other.spec.ts", `test("unrelated", () => {});`);
    expect(check(root, noExempt).map((p) => p.id)).toEqual(["file.export"]);
  });

  it("accepts the full Playwright chord, the pressChord form, or the id", () => {
    app(
      "Cmds.tsx",
      [
        `useCommand({ id: "a.full", title: "A", keybinding: "mod+shift+a", run });`,
        `useCommand({ id: "b.short", title: "B", keybinding: "mod+2", run });`,
        `useCommand({ id: "c.palette", title: "C", run });`,
      ].join("\n"),
    );
    spec(
      "at-1-cmds.spec.ts",
      [
        `await page.keyboard.press("ControlOrMeta+Shift+A");`,
        `await pressChord(page, "2");`,
        `// drives the palette-only \`c.palette\` command`,
      ].join("\n"),
    );
    expect(check(root, noExempt)).toEqual([]);
  });

  it("does not count an id that only appears as a prefix of a longer id", () => {
    app("Cmds.tsx", `useCommand({ id: "view.showOrg", title: "Org", run });`);
    spec("at-1-cmds.spec.ts", `// view.showOrgTree`);
    expect(check(root, noExempt).map((p) => p.id)).toEqual(["view.showOrg"]);
  });

  it("does not accept the docs display form or a bare digit string", () => {
    app("Cmds.tsx", `useCommand({ id: "b.short", title: "B", keybinding: "mod+2", run });`);
    spec("at-1-cmds.spec.ts", `// Ctrl/Cmd+2\nconst n = "2";`);
    expect(check(root, noExempt).map((p) => p.id)).toEqual(["b.short"]);
  });

  it("resolves a same-file const id and a component-prop id", () => {
    app(
      "Palette.tsx",
      `const OPEN_ID = "command.open";\nuseCommand({ id: OPEN_ID, title: "Open", keybinding: "mod+k", run });`,
    );
    app(
      "Area.tsx",
      [
        `<ViewCommand id="view.one" title="One" keybinding="mod+shift+1" onShow={() => show("one")} />`,
        `function ViewCommand({ id, title, keybinding, onShow }: Props) {`,
        `  useCommand({ id, title, keybinding, run: onShow });`,
        `}`,
      ].join("\n"),
    );
    spec("at-1-cmds.spec.ts", `await pressChord(page, "K");`);
    expect(check(root, noExempt).map((p) => p.id)).toEqual(["view.one"]);
    const ids = collectCommands(root).map((c) => `${c.id} ${c.keybinding}`);
    expect(ids.sort()).toEqual(["command.open mod+k", "view.one mod+shift+1"]);
  });

  it("fails loudly on an id it cannot resolve to a string literal", () => {
    app("Dyn.tsx", "useCommand({ id: `view.${name}`, title: 'Dyn', run });");
    expect(() => check(root, noExempt)).toThrow(/cannot resolve useCommand id/);
  });

  it("fails when a keybinding is declared outside any readable useCommand", () => {
    app(
      "Odd.tsx",
      `const cmd = { id: "x.odd", keybinding: "mod+shift+x" };\nregistry.register(cmd);`,
    );
    expect(check(root, noExempt).map((p) => p.id)).toEqual(["mod+shift+x"]);
  });

  it("flags an exemption that is covered or no longer registered", () => {
    app("Cmds.tsx", `useCommand({ id: "a.covered", title: "A", run });`);
    spec("at-1-cmds.spec.ts", `// a.covered`);
    const exempt = new Map([
      ["a.covered", "pending"],
      ["z.gone", "pending"],
    ]);
    expect(check(root, exempt).map((p) => p.id)).toEqual(["a.covered", "z.gone"]);
  });
});
