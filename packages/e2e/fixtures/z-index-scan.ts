import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { BrowserContext, Page } from "@playwright/test";

/**
 * Computed z-index scan (TPL-1468).
 *
 * Every element the app shows with a z-index other than `auto` must sit on the
 * documented scale: either the value is a local stacking literal (`0` or `1`,
 * which `tokens.css` allows for intra-component contexts), or it comes from a
 * `var(--z-*)` token declared in `packages/app/src/styles/tokens.css`.
 *
 * The check reads the page, not the source. The computed value covers a CSS
 * literal, an inline `zIndex`, a Tailwind class and a library's own default
 * alike. Because a magic number can coincide with a token's value (shadcn's
 * `z-50` equals `--z-handle`, and many libraries use `1000`), the value alone is
 * not enough: the element also needs a matching declaration, inline or in a
 * stylesheet rule that applies to it, whose text is `var(--z-<token>)` for a
 * token with that value. A library default that a token rule overrides passes;
 * one left in place does not. Radix copies a popper's z-index onto the inline
 * style of the wrapper it positions; a wrapper whose value is the one a token
 * gives its child passes too.
 *
 * Monaco keeps its own stacking inside the editor (and in its context view);
 * those subtrees are skipped. SVG elements are skipped: the diagram does not
 * stack with z-index.
 *
 * Two ways in, one probe. `installZIndexProbe` adds an init script to a
 * context: a MutationObserver checks each element as it is added or its
 * `class` / `style` changes, so a menu a spec opens and closes again is still
 * seen. `scanZIndex` checks the whole document as it stands. `network.ts`
 * installs the probe for every test and, after a passing test, fails it on
 * anything either found. `tests/z-index-scale.spec.ts` checks that the probe
 * sees each layer of the scale.
 */

const TOKENS_CSS = fileURLToPath(new URL("../../app/src/styles/tokens.css", import.meta.url));

/** The `--z-*` token names declared in tokens.css, in source order. */
export function zTokenNames(css = readFileSync(TOKENS_CSS, "utf8")): string[] {
  return [...css.matchAll(/^\s*(--z-[\w-]+)\s*:/gm)].map((m) => m[1]);
}

/** One element with a z-index other than `auto`. */
export interface ZIndexHit {
  /** Short description: tag and class list. */
  element: string;
  /** Computed `z-index`. */
  zIndex: string;
  /** The token whose `var()` declaration supplies the value, if any. */
  token: string | null;
  /** True when the value is off the scale or no token declaration supplies it. */
  violation: boolean;
}

/** What the probe holds on `window`. */
interface ZIndexProbe {
  /** Check the whole document now. */
  scan: () => ZIndexHit[];
  /** Every hit the observer recorded since the document loaded, de-duplicated. */
  observed: () => ZIndexHit[];
}

declare global {
  interface Window {
    __karasuZIndexProbe?: ZIndexProbe;
  }
}

/**
 * Runs in the page (as an init script): defines `window.__karasuZIndexProbe`
 * and starts the observer. Self-contained, since Playwright serialises it.
 */
function probeScript(tokenNames: string[]): void {
  const LOCAL_LITERALS = new Set(["0", "1"]);
  const SKIP = ".monaco-editor, .context-view";

  const tokenValues = (): Map<string, string> => {
    const rootStyle = getComputedStyle(document.documentElement);
    const values = new Map<string, string>();
    for (const name of tokenNames) {
      const value = rootStyle.getPropertyValue(name).trim();
      if (value !== "") values.set(name, value);
    }
    return values;
  };

  // Every style rule that declares z-index, flattened out of @media,
  // @supports, @layer and @container blocks. Read again whenever the set of
  // style sheets changes (dev mode injects them as modules load).
  let cachedSheets: CSSStyleSheet[] = [];
  let cachedRules: CSSStyleRule[] = [];
  const zRules = (): CSSStyleRule[] => {
    const sheets = Array.from(document.styleSheets);
    if (sheets.length === cachedSheets.length && sheets.every((s, i) => s === cachedSheets[i])) {
      return cachedRules;
    }
    const rules: CSSStyleRule[] = [];
    const visit = (list: CSSRuleList) => {
      for (const rule of Array.from(list)) {
        if (rule instanceof CSSStyleRule) {
          if (rule.style.getPropertyValue("z-index") !== "") rules.push(rule);
        } else if (rule instanceof CSSMediaRule) {
          if (matchMedia(rule.conditionText).matches) visit(rule.cssRules);
        } else if ("cssRules" in rule) {
          visit((rule as CSSGroupingRule).cssRules);
        }
      }
    };
    for (const sheet of sheets) {
      try {
        visit(sheet.cssRules);
      } catch {
        // A cross-origin sheet (the stubbed web fonts) has no readable rules.
      }
    }
    cachedSheets = sheets;
    cachedRules = rules;
    return rules;
  };

  const declarations = (el: Element): string[] => {
    const out: string[] = [];
    const inline = (el as HTMLElement).style?.getPropertyValue("z-index");
    if (inline) out.push(inline.trim());
    for (const rule of zRules()) {
      let matches = false;
      try {
        matches = el.matches(rule.selectorText);
      } catch {
        // A selector `matches` cannot take (a pseudo-element) never applies here.
      }
      if (matches) out.push(rule.style.getPropertyValue("z-index").trim());
    }
    return out;
  };

  const describe = (el: Element) => {
    const cls = typeof el.className === "string" ? el.className.trim().split(/\s+/) : [];
    return [el.tagName.toLowerCase(), ...cls.filter(Boolean)].join(".").slice(0, 120);
  };

  const skipped = (el: Element) => el instanceof SVGElement || el.closest(SKIP) !== null;

  /** The token a matching `var()` declaration gives `el` its value from, if any. */
  const tokenOf = (el: Element, zIndex: string, values: Map<string, string>): string | null => {
    for (const declared of declarations(el)) {
      const m = /^var\(\s*(--z-[\w-]+)\s*\)$/.exec(declared);
      if (m && values.get(m[1]) === zIndex) return m[1];
    }
    return null;
  };

  const inspect = (el: Element, values: Map<string, string>): ZIndexHit | null => {
    const zIndex = getComputedStyle(el).zIndex;
    if (zIndex === "auto") return null;
    let token = tokenOf(el, zIndex, values);
    if (token === null && !LOCAL_LITERALS.has(zIndex)) {
      // Radix's popper wrapper carries its content's value inline.
      for (const child of Array.from(el.children)) {
        if (skipped(child) || getComputedStyle(child).zIndex !== zIndex) continue;
        token = tokenOf(child, zIndex, values);
        if (token !== null) break;
      }
    }
    const violation = token === null && !LOCAL_LITERALS.has(zIndex);
    return { element: describe(el), zIndex, token, violation };
  };

  /** `root` and its descendants, without skipped subtrees. */
  const elementsUnder = (root: Element): Element[] => {
    if (skipped(root)) return [];
    const out: Element[] = [root];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, {
      acceptNode: (node) =>
        skipped(node as Element) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
    });
    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
      out.push(node as Element);
    }
    return out;
  };

  const observed = new Map<string, ZIndexHit>();
  const record = (elements: Iterable<Element>) => {
    const values = tokenValues();
    for (const el of elements) {
      if (!el.isConnected) continue;
      const hit = inspect(el, values);
      if (hit) observed.set(`${hit.element} ${hit.zIndex} ${hit.token}`, hit);
    }
  };

  window.__karasuZIndexProbe = {
    scan: () => {
      const values = tokenValues();
      return elementsUnder(document.body).flatMap((el) => {
        const hit = inspect(el, values);
        return hit ? [hit] : [];
      });
    },
    observed: () => [...observed.values()],
  };

  const start = () => {
    new MutationObserver((mutations) => {
      const touched = new Set<Element>();
      for (const m of mutations) {
        if (m.type === "attributes") {
          if (m.target instanceof Element && !skipped(m.target)) touched.add(m.target);
          continue;
        }
        for (const node of Array.from(m.addedNodes)) {
          if (node instanceof Element) for (const el of elementsUnder(node)) touched.add(el);
        }
      }
      record(touched);
    }).observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "style"],
    });
  };
  if (document.documentElement) start();
  else document.addEventListener("DOMContentLoaded", start, { once: true });
}

/** Install the probe on every page the context opens from now on. */
export async function installZIndexProbe(context: BrowserContext): Promise<void> {
  await context.addInitScript(probeScript, zTokenNames());
}

/** Check the page's whole document now. Empty when the probe is not installed. */
export async function scanZIndex(page: Page): Promise<ZIndexHit[]> {
  return page.evaluate(() => window.__karasuZIndexProbe?.scan() ?? []);
}

/** Every hit the probe's observer recorded on the page's current document. */
export async function observedZIndex(page: Page): Promise<ZIndexHit[]> {
  return page.evaluate(() => window.__karasuZIndexProbe?.observed() ?? []);
}

/** The hits that are off the scale, formatted one per line for an assertion message. */
export function formatViolations(hits: readonly ZIndexHit[]): string[] {
  return hits.filter((h) => h.violation).map((h) => `${h.element} has z-index ${h.zIndex}`);
}

/**
 * Fail when any page the test leaves open shows, or showed on its current
 * document, a z-index off the scale. The probe starts again with each document,
 * so a surface shown before a reload or a navigation is not checked. A page
 * that closed or navigated mid-read is skipped.
 */
export async function assertZIndexScaleOnPages(pages: readonly Page[]): Promise<void> {
  const violations = new Set<string>();
  for (const page of pages) {
    if (page.isClosed()) continue;
    let hits: ZIndexHit[];
    try {
      hits = [...(await observedZIndex(page)), ...(await scanZIndex(page))];
    } catch {
      continue;
    }
    for (const v of formatViolations(hits)) violations.add(`${page.url()}: ${v}`);
  }
  if (violations.size > 0) {
    throw new Error(
      "z-index off the scale in packages/app/src/styles/tokens.css (TPL-1468). " +
        "Use a var(--z-*) token, or 0/1 for a local stacking context:\n" +
        [...violations].join("\n"),
    );
  }
}
