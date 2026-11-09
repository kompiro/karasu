// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { en, type Translations } from "@karasu-tools/i18n";

/** A message whose English text is a plain string (a control label). */
type MessageKey = { [K in keyof Translations]: Translations[K] extends string ? K : never }[keyof Translations];
import { DiagramTabBar } from "./DiagramTabBar.js";
import { PreviewToolbar } from "./PreviewToolbar.js";
import { PreviewProvider, type PreviewContextValue } from "../state/preview-context.js";
import { LocaleProvider } from "../i18n/index.js";
import { ACTIVE_VIEWS } from "../state/app-reducer.js";

// The preview's views and toolbar controls are on docs/tools/app.md and
// app.ja.md (TPL-1716). Both are read off what the components render, not off a
// list kept beside them, so a tab or a control added to the JSX fails here until
// it is documented in both locales.
//
// - Views: every tab `DiagramTabBar` draws is a bold row label in the Diagram
//   views table, and there is one tab per `ACTIVE_VIEWS` member.
// - Toolbar: every control and menu item `PreviewToolbar` draws must be named in
//   `TOOLBAR_TERMS` (matched by its English label), and each entry's terms must
//   appear in the Toolbar section of the page in its locale.

afterEach(cleanup);

const repoRoot = resolve(import.meta.dirname, "../../../..");
const DOCS = { en: "docs/tools/app.md", ja: "docs/tools/app.ja.md" } as const;
type Locale = keyof typeof DOCS;

/** Lines under the first heading `heading` matches, up to the next heading of the same or a higher level. */
function section(locale: Locale, heading: RegExp): string {
  const lines = readFileSync(resolve(repoRoot, DOCS[locale]), "utf8").split("\n");
  const start = lines.findIndex((l) => heading.test(l));
  if (start < 0) throw new Error(`${DOCS[locale]}: no heading ${heading}`);
  const level = /^#+/.exec(lines[start])![0].length;
  const end = lines.findIndex(
    (l, i) => i > start && /^#+\s/.test(l) && /^#+/.exec(l)![0].length <= level,
  );
  return lines.slice(start + 1, end < 0 ? undefined : end).join("\n");
}

const VIEWS_HEADING: Record<Locale, RegExp> = { en: /^### Diagram views/, ja: /^### 図のビュー/ };
const TOOLBAR_HEADING: Record<Locale, RegExp> = { en: /^#### Toolbar/, ja: /^#### ツールバー/ };

/**
 * What the Toolbar section calls each control the toolbar renders, keyed by the
 * message that labels the control.
 */
const TOOLBAR_TERMS: Partial<Record<MessageKey, Record<Locale, string>>> = {
  "preview.export.svg.label": { en: "**Export**", ja: "**エクスポート**" },
  "preview.export.drillDown.label": { en: "drill-down tree", ja: "ドリルダウンツリー" },
  "preview.export.allDiagrams.label": { en: "bundling **all** views", ja: "全ビューを束ねた" },
  "preview.export.drawio.label": { en: "**draw.io**", ja: "**draw.io**" },
  "preview.openAllViews.label": { en: "**Open All Views**", ja: "**全ビューを開く**" },
  "preview.share.label": { en: "**Share**", ja: "**Share**" },
  "preview.docs.label": { en: "**Docs**", ja: "**Docs**" },
  "preview.docs.reference.label": { en: "**Reference**", ja: "**リファレンス**" },
  "preview.docs.site.label": { en: "documentation site", ja: "ドキュメントサイト" },
  "preview.focus.label": { en: "**Focus**", ja: "**フォーカス**" },
};

const PREVIEW = {
  activeView: "system",
  previewFocused: false,
  onPreviewFocusToggle: () => {},
  onExportDrawio: () => {},
} as unknown as PreviewContextValue;

const noop = () => {};

function renderedTabs(): string[] {
  render(
    <LocaleProvider initialLocale="en">
      <DiagramTabBar active="system" onChange={noop} />
    </LocaleProvider>,
  );
  return screen.getAllByRole("tab").map((t) => (t.textContent ?? "").replace(/^\W+/u, "").trim());
}

describe("docs/tools/app covers the preview's views (TPL-1716)", () => {
  it("draws one tab per ACTIVE_VIEWS member", () => {
    expect(renderedTabs()).toHaveLength(ACTIVE_VIEWS.length);
  });

  it.each(Object.keys(DOCS) as Locale[])(
    "%s: every tab is a row of the Diagram views table",
    (locale) => {
      const table = section(locale, VIEWS_HEADING[locale]);
      expect(renderedTabs().filter((label) => !table.includes(`| **${label}**`))).toEqual([]);
    },
  );
});

describe("docs/tools/app covers the preview toolbar (TPL-1716)", () => {
  async function renderedLabels(): Promise<string[]> {
    const user = userEvent.setup();
    render(
      <LocaleProvider initialLocale="en">
        <PreviewProvider value={PREVIEW}>
          <PreviewToolbar
            exportAvailable
            drillDownAvailable
            allViewsAvailable
            shareAvailable
            onExport={noop}
            onExportDrillDown={noop}
            onExportAllDiagrams={noop}
            onExportDrawio={noop}
            onOpenAllViews={noop}
            onShare={noop}
          />
        </PreviewProvider>
      </LocaleProvider>,
    );
    const controls = screen.getAllByRole("button");
    const labels = controls.map((b) => b.textContent ?? "");
    // Open every menu: its items are actions too, and only exist while open.
    for (const trigger of controls.filter((b) => b.getAttribute("aria-haspopup") === "menu")) {
      await user.click(trigger);
      labels.push(...screen.getAllByRole("menuitem").map((m) => m.textContent ?? ""));
      await user.keyboard("{Escape}");
    }
    // The split button's "▾" half only opens the export menu checked above.
    return labels.filter((l) => l.trim() !== "▾");
  }

  it("names every control and menu item the toolbar draws", async () => {
    const labels = await renderedLabels();
    expect(labels.length).toBeGreaterThan(5);
    const termKeys = Object.keys(TOOLBAR_TERMS) as MessageKey[];
    const unnamed = labels.filter((label) => !termKeys.some((k) => label.includes(en[k])));
    expect(unnamed).toEqual([]);
    const unrendered = termKeys.filter((k) => !labels.some((label) => label.includes(en[k])));
    expect(unrendered).toEqual([]);
  });

  it.each(Object.keys(DOCS) as Locale[])(
    "%s: the Toolbar section names every control",
    (locale) => {
      const text = section(locale, TOOLBAR_HEADING[locale]);
      const missing = Object.entries(TOOLBAR_TERMS)
        .filter(([, terms]) => !text.includes(terms![locale]))
        .map(([key]) => key);
      expect(missing).toEqual([]);
    },
  );
});
