import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { collectChords } from "./app-shortcut-docs-sync.ts";
import { type AppCommand, collectCommands } from "./e2e-command-coverage.ts";

// No two app commands share a keybinding (TPL-1419). The command registry
// resolves a chord to the first live command that holds it, so a second
// command bound to the same chord would never fire, and nothing in the UI
// shows it. `CommandProvider.register` throws on such a pair while both are
// mounted, but only in vitest and `vite` dev (a production build, which the
// CI E2E suite runs, only logs it), and only when a test mounts both; this
// check reads every `useCommand` registration in the source, mounted or not.
//
// `collectCommands` is the same reader `lint:e2e-command-coverage` uses. It
// resolves a literal, a same-file const and a component prop, and throws on
// any other value, so a registration it cannot read fails here rather than
// being skipped.

const REPO_ROOT = resolve(import.meta.dirname, "../..");

/** Commands allowed to share one chord, and why they are never mounted together. */
interface SharedChord {
  /** The command ids that may hold the chord. Any other holder is a collision. */
  ids: readonly string[];
  reason: string;
}

/**
 * Chords that two commands may share because the commands are never mounted
 * at the same time. If they ever are, `CommandProvider.register` throws in
 * vitest and `vite` dev, while a production build only logs it and keeps the
 * first. Each entry names the commands and why they are exclusive; a third
 * command on the chord is still reported. Empty today.
 */
const SHARED_CHORDS: ReadonlyMap<string, SharedChord> = new Map();

/** Every chord held by more than one command id, with those ids. */
function collisions(commands: readonly AppCommand[]): Map<string, string[]> {
  const holders = new Map<string, Set<string>>();
  for (const { id, keybinding } of commands) {
    if (keybinding === undefined) continue;
    const ids = holders.get(keybinding) ?? new Set<string>();
    ids.add(id);
    holders.set(keybinding, ids);
  }
  return new Map(
    [...holders].filter(([, ids]) => ids.size > 1).map(([chord, ids]) => [chord, [...ids].sort()]),
  );
}

/**
 * The collisions that `shared` does not permit: a chord it does not list, or a
 * listed chord held by a command outside that entry's `ids`.
 */
function unexpectedCollisions(
  commands: readonly AppCommand[],
  shared: ReadonlyMap<string, SharedChord>,
): Map<string, string[]> {
  const found = collisions(commands);
  for (const [chord, { ids }] of shared) {
    const holders = found.get(chord);
    if (holders?.every((id) => ids.includes(id))) found.delete(chord);
  }
  return found;
}

describe("app keybindings (TPL-1419)", () => {
  const commands = collectCommands(REPO_ROOT);

  it("reads the commands that hold a keybinding", () => {
    // The reader must see the registrations this check is about; an empty
    // or partial read would pass the collision check vacuously. Every chord
    // a source line declares (the docs-sync reader) is among them.
    const held = new Set(commands.flatMap((c) => (c.keybinding ? [c.keybinding] : [])));
    expect(held.size).toBeGreaterThanOrEqual(10);
    for (const chord of collectChords(resolve(REPO_ROOT, "packages/app/src"))) {
      expect(held).toContain(chord);
    }
  });

  it("binds each chord to one command", () => {
    expect(Object.fromEntries(unexpectedCollisions(commands, SHARED_CHORDS))).toEqual({});
  });

  it("keeps every SHARED_CHORDS entry shared and justified", () => {
    const shared = collisions(commands);
    for (const [chord, { ids, reason }] of SHARED_CHORDS) {
      expect(reason.length).toBeGreaterThan(0);
      // The entry lists exactly the commands that hold the chord today, so a
      // stale id or a holder that left does not keep the exemption open.
      expect(shared.get(chord)).toEqual([...ids].sort());
    }
  });

  it("reports a chord two ids hold, and not one id registered twice", () => {
    expect(
      collisions([
        { id: "a", keybinding: "mod+b", file: "A.tsx" },
        { id: "b", keybinding: "mod+b", file: "B.tsx" },
        { id: "c", keybinding: "mod+c", file: "C.tsx" },
        { id: "c", keybinding: "mod+c", file: "C2.tsx" },
        { id: "d", file: "D.tsx" },
        { id: "e", file: "E.tsx" },
      ]),
    ).toEqual(new Map([["mod+b", ["a", "b"]]]));
  });

  it("lets a listed shared chord through and still reports the others", () => {
    const synthetic: AppCommand[] = [
      { id: "a", keybinding: "mod+b", file: "A.tsx" },
      { id: "b", keybinding: "mod+b", file: "B.tsx" },
      { id: "c", keybinding: "mod+c", file: "C.tsx" },
      { id: "d", keybinding: "mod+c", file: "D.tsx" },
    ];
    expect(
      unexpectedCollisions(
        synthetic,
        new Map([["mod+b", { ids: ["a", "b"], reason: "a and b are never mounted together" }]]),
      ),
    ).toEqual(new Map([["mod+c", ["c", "d"]]]));
  });

  it("still reports a holder of a shared chord that the entry does not list", () => {
    const synthetic: AppCommand[] = [
      { id: "a", keybinding: "mod+b", file: "A.tsx" },
      { id: "b", keybinding: "mod+b", file: "B.tsx" },
      { id: "c", keybinding: "mod+b", file: "C.tsx" },
    ];
    expect(
      unexpectedCollisions(
        synthetic,
        new Map([["mod+b", { ids: ["a", "b"], reason: "a and b are never mounted together" }]]),
      ),
    ).toEqual(new Map([["mod+b", ["a", "b", "c"]]]));
  });
});
