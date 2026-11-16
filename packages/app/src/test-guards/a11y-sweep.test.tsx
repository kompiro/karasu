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

/** Render, collect what the sweep found, unmount, and clear it so the global afterEach passes. */
function problemsOf(ui: React.ReactElement) {
  render(ui);
  const { problems } = flushA11ySweep();
  // Unmount first: removal checks the subtree again.
  cleanup();
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

  it("reports an option outside a listbox", () => {
    expect(
      problemsOf(
        <div role="dialog" aria-label="Pick">
          <div role="option" aria-selected="false">
            a
          </div>
        </div>,
      ),
    ).toEqual(['role: role "option" needs a parent of group / listbox, found dialog']);
  });

  it("reports a menu that owns no menu item", () => {
    expect(
      problemsOf(
        <div role="menu">
          <div role="option">a</div>
        </div>,
      ),
    ).toEqual(
      expect.arrayContaining([
        'role: role "menu" owns no group / menuitem / menuitemcheckbox / menuitemradio, only option',
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
    // Unmount first: removal checks the subtree again.
    cleanup();
    clearA11yProblems();
    expect(problems.map((p) => p.rule)).toEqual(["button-label"]);
  });
});

function PaletteCommand() {
  useCommand({ id: "view.toggleSidebar", title: "Toggle Sidebar", run: () => {} });
  return null;
}

describe("a11y sweep: native elements and allowed roles", () => {
  it("accepts a button as a treeitem", () => {
    expect(
      problemsOf(
        <div role="tree">
          <button role="treeitem">Node</button>
        </div>,
      ),
    ).toEqual([]);
  });

  it("reports a menu whose only child is a native checkbox", () => {
    expect(
      problemsOf(
        <div role="menu">
          <input type="checkbox" aria-label="Wrap" />
        </div>,
      ),
    ).toContain(
      'role: role "menu" owns no group / menuitem / menuitemcheckbox / menuitemradio, only checkbox',
    );
  });

  it("accepts a heading beside the tabs of a tablist (required owned roles are not the only ones allowed)", () => {
    expect(
      problemsOf(
        <div role="tablist">
          <h3>Views</h3>
          <button role="tab">System</button>
        </div>,
      ),
    ).toEqual([]);
  });

  it("leaves a native select and its options alone", () => {
    expect(
      problemsOf(
        <select aria-label="Theme">
          <option>Dark</option>
        </select>,
      ),
    ).toEqual([]);
  });
});

describe("a11y sweep: timing and inheritance", () => {
  it("checks a button rendered and unmounted in one synchronous run", () => {
    const { unmount } = render(<button aria-label="Close">×</button>);
    unmount();
    const { problems } = flushA11ySweep();
    // Unmount first: removal checks the subtree again.
    cleanup();
    clearA11yProblems();
    expect(problems.map((p) => p.rule)).toEqual(["button-label"]);
  });

  it("rechecks a button when its only label is hidden", () => {
    const { container } = render(
      <button>
        <span>Save</span>
      </button>,
    );
    container.querySelector("span")!.setAttribute("hidden", "");
    const { problems } = flushA11ySweep();
    // Unmount first: removal checks the subtree again.
    cleanup();
    clearA11yProblems();
    expect(problems.map((p) => p.rule)).toEqual(["button-label"]);
  });

  it("treats items of a presentational list as presentational", () => {
    expect(
      problemsOf(
        <ul role="none">
          <li>Item</li>
        </ul>,
      ),
    ).toEqual([]);
  });

  it("accepts an empty listbox, as an empty state renders it", () => {
    expect(
      problemsOf(
        <div role="listbox" aria-label="Commands">
          <div>No matching commands</div>
        </div>,
      ),
    ).toEqual([]);
  });

  it("accepts a listbox that owns no option yet while it is aria-busy, and reports it otherwise", () => {
    expect(
      problemsOf(
        <div role="listbox" aria-label="Projects" aria-busy="true">
          <div role="status">Loading</div>
        </div>,
      ),
    ).toEqual([]);
    expect(
      problemsOf(
        <div role="listbox" aria-label="Projects">
          <div role="status">Loading</div>
        </div>,
      ),
    ).toEqual(['role: role "listbox" owns no group / option, only status']);
  });

  it("accepts a listbox inside an aria-busy region", () => {
    expect(
      problemsOf(
        <section aria-busy="true">
          <div role="listbox" aria-label="Projects">
            <div role="status">Loading</div>
          </div>
        </section>,
      ),
    ).toEqual([]);
  });

  it("reports a listbox once its aria-busy is removed", () => {
    const { container } = render(
      <div role="listbox" aria-label="Projects" aria-busy="true">
        <div role="status">Loading</div>
      </div>,
    );
    flushA11ySweep();
    container.querySelector('[role="listbox"]')!.removeAttribute("aria-busy");
    const { problems } = flushA11ySweep();
    // Unmount first: removal checks the subtree again.
    cleanup();
    clearA11yProblems();
    expect(problems.map((p) => p.message)).toEqual([
      'role "listbox" owns no group / option, only status',
    ]);
  });

  it("reports a listbox whose last option, inside a role=none wrapper, is replaced", () => {
    const view = (option: boolean) => (
      <ul role="listbox" aria-label="Commands">
        <li role="none">
          {option ? (
            <div role="option" aria-selected="false">
              Open
            </div>
          ) : (
            <a href="#open">Open</a>
          )}
        </li>
      </ul>
    );
    const { rerender } = render(view(true));
    expect(flushA11ySweep().problems).toEqual([]);
    rerender(view(false));
    const { problems } = flushA11ySweep();
    // Unmount first: removal checks the subtree again.
    cleanup();
    clearA11yProblems();
    expect(problems.map((p) => p.message)).toContain(
      'role "listbox" owns no group / option, only link',
    );
  });

  it("does not count hidden children as owned", () => {
    expect(
      problemsOf(
        <div role="listbox" aria-label="Commands">
          <div>No results</div>
          <button hidden>Clear</button>
        </div>,
      ),
    ).toEqual([]);
    expect(
      problemsOf(
        <div role="listbox" aria-label="Commands">
          <div role="option" aria-selected="false" hidden>
            Old
          </div>
          <a href="#x">x</a>
        </div>,
      ),
    ).toContain('role: role "listbox" owns no group / option, only link');
  });

  it("checks the owned roles of explicit roles only, not of a native list", () => {
    expect(
      problemsOf(
        <ul>
          <div>
            <button>Go</button>
          </div>
        </ul>,
      ),
    ).toEqual([]);
  });

  it("allows a caption in a grid", () => {
    expect(
      problemsOf(
        <div role="grid">
          <div role="caption">Grid</div>
          <div role="row">
            <div role="gridcell">a</div>
          </div>
        </div>,
      ),
    ).toEqual([]);
  });
});

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
    expect(checked["button-label"]).toBeGreaterThan(0);

    // And the sweep reports that real option once it leaves its listbox.
    const option = document.querySelector('[role="listbox"] [role="option"]')!;
    const dialog = document.querySelector('[role="dialog"]')!;
    dialog.appendChild(option);
    const after = flushA11ySweep().problems.map((p) => p.message);
    // Unmount first: removal checks the subtree again.
    cleanup();
    clearA11yProblems();
    expect(after).toContain('role "option" needs a parent of group / listbox, found dialog');
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
        // Code only: a class named in a comment does not keep an exemption alive.
        sources.push(
          readFileSync(path, "utf8")
            .replace(/\/\*[\s\S]*?\*\//g, "")
            .replace(/^\s*\/\/.*$/gm, ""),
        );
      }
    }
  };
  roots.forEach(walk);

  it.each(BUTTON_LABEL_EXEMPTIONS)(
    "$selector still names something the app renders",
    ({ selector, reason }) => {
      expect(reason.length).toBeGreaterThan(20);
      // The class part must still be written somewhere in the code. An
      // attribute part such as `[aria-haspopup="menu"]` is set by a library
      // (Radix), so it is not looked up in our source.
      const classes = [...selector.matchAll(/\.([\w-]+)/g)].map((m) => m[1]!);
      expect(classes.length).toBeGreaterThan(0);
      for (const cls of classes) {
        const written = new RegExp(`["'\\s:]${cls}["'\\s]`);
        expect(
          sources.some((src) => written.test(src)),
          `${cls} is not in app or core code`,
        ).toBe(true);
      }
    },
  );
});
