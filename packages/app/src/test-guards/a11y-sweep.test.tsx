// @vitest-environment jsdom
//
// The a11y sweep (a11y-sweep-setup.ts) runs on every app test. This file
// shows each rule fires on a violation and stays quiet on the fixed form.
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { clearA11yProblems, flushA11ySweep } from "./a11y-sweep.js";
import { BUTTON_LABEL_EXEMPTIONS } from "./button-label.js";
import { CommandProvider } from "../keyboard/command-context.js";
import { KeyboardShortcutDispatcher } from "../keyboard/KeyboardShortcutDispatcher.js";
import { useCommand } from "../keyboard/use-command.js";
import { CommandPalette } from "../components/CommandPalette.js";

afterEach(cleanup);

/** Render, collect what the sweep found, and clear it so the global afterEach passes. */
function problemsOf(ui: React.ReactElement) {
  render(ui);
  const { problems } = flushA11ySweep();
  clearA11yProblems();
  return problems.map((p) => `${p.rule}: ${p.message}`);
}

describe("a11y sweep: roles (TPL-1399 item 2)", () => {
  it("reports a listitem outside a list", () => {
    expect(problemsOf(<div role="listitem">a</div>)).toEqual([
      'role: role "listitem" needs a parent of directory / list, found none',
    ]);
  });

  it("looks through generic wrappers for the parent role", () => {
    expect(
      problemsOf(
        <div role="list">
          <div>
            <div role="listitem">a</div>
          </div>
        </div>,
      ),
    ).toEqual([]);
  });

  it("reports a role the tag does not allow", () => {
    expect(
      problemsOf(
        <ul>
          <li>
            <button role="listitem">Open</button>
          </li>
        </ul>,
      ),
    ).toContain('role: role "listitem" is not allowed on <button>');
  });

  it("reports a menu owning a role it may not own", () => {
    expect(
      problemsOf(
        <div role="menu">
          <div role="option">a</div>
        </div>,
      ),
    ).toEqual(
      expect.arrayContaining([
        'role: role "menu" may not own role "option"',
        'role: role "option" needs a parent of group / listbox, found menu',
      ]),
    );
  });

  it("accepts a menu of menu items and a separator", () => {
    expect(
      problemsOf(
        <div role="menu">
          <div role="menuitem">Open</div>
          <div role="separator" />
          <div role="menuitemcheckbox" aria-checked="false">
            Wrap
          </div>
        </div>,
      ),
    ).toEqual([]);
  });
});

describe("a11y sweep: button labels (TPL-1399 item 3)", () => {
  it("reports an icon-only button, even with an aria-label", () => {
    expect(problemsOf(<button aria-label="Close">×</button>)).toEqual([
      "button-label: button has no visible text label (an icon or aria-label alone is not enough)",
    ]);
  });

  it("does not count aria-hidden text as visible", () => {
    expect(
      problemsOf(
        <div role="button" tabIndex={0}>
          <span aria-hidden="true">Close</span>
        </div>,
      ),
    ).toHaveLength(1);
  });

  it("accepts an icon plus a text label", () => {
    expect(
      problemsOf(
        <button>
          <span aria-hidden="true">×</span> Close
        </button>,
      ),
    ).toEqual([]);
  });

  it("checks a button whose text goes away after the first render", () => {
    const { rerender } = render(<button>Close</button>);
    rerender(<button>×</button>);
    const { problems } = flushA11ySweep();
    clearA11yProblems();
    expect(problems.map((p) => p.rule)).toEqual(["button-label"]);
  });
});

function PaletteCommand() {
  useCommand({ id: "view.toggleSidebar", title: "Toggle Sidebar", run: () => {} });
  return null;
}

describe("a11y sweep: the corpus has the shapes it checks", () => {
  // The sweep is a guard only because app tests render roled children that
  // need a parent role. The command palette's listbox of options is one: if
  // it stopped rendering, or the sweep stopped seeing it, this fails.
  it("checks the command palette's options against their listbox, and passes", () => {
    render(
      <CommandProvider>
        <KeyboardShortcutDispatcher />
        <CommandPalette />
        <PaletteCommand />
      </CommandProvider>,
    );
    fireEvent.keyDown(document, { key: "p", ctrlKey: true, shiftKey: true });
    expect(document.querySelector('[role="listbox"] [role="option"]')).not.toBeNull();
    const { problems, checked } = flushA11ySweep();
    expect(checked.role).toBeGreaterThan(0);
    expect(checked["button-label"]).toBeGreaterThan(0);
    expect(problems).toEqual([]);
  });
});

describe("button-label exemptions", () => {
  const roots = [join(__dirname, ".."), join(__dirname, "../../../core/src")];
  const sources: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (
        /\.(ts|tsx)$/.test(name) &&
        !/\.test\.tsx?$/.test(name) &&
        !path.includes("test-guards")
      ) {
        sources.push(readFileSync(path, "utf8"));
      }
    }
  };
  roots.forEach(walk);

  it.each(BUTTON_LABEL_EXEMPTIONS)(
    "$selector still names something the app renders",
    ({ selector, reason }) => {
      expect(reason.length).toBeGreaterThan(20);
      const classes = [...selector.matchAll(/\.([\w-]+)/g)].map((m) => m[1]!);
      expect(classes.length).toBeGreaterThan(0);
      for (const cls of classes) {
        expect(
          sources.some((src) => src.includes(cls)),
          `${cls} is not in app or core source`,
        ).toBe(true);
      }
    },
  );
});
