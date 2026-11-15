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
 * not enough: the declaration that wins the cascade must read the token. The
 * probe asks the cascade directly: it sets every token to a sentinel value on
 * the element, and the element passes only when its computed z-index follows
 * one of them. A library default that a token rule overrides passes; one left
 * in place, or a literal that beats a token rule, does not. Radix copies a
 * popper's z-index onto the inline style of the wrapper it positions
 * (`[data-radix-popper-content-wrapper]`); that wrapper passes when a token
 * gives its content the value.
 *
 * Monaco keeps its own stacking inside the editor (and in its context view);
 * those subtrees are skipped. SVG elements are skipped: the diagram does not
 * stack with z-index.
 *
 * Two ways in, one probe. `installZIndexProbe` adds an init script to a
 * context: a MutationObserver checks each element as it is added, and the
 * subtree of an element whose attributes change, so a menu a spec opens
 * and closes again is still seen. `scanZIndex` checks the whole document as it stands. `network.ts`
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
  const RADIX_WRAPPER = "[data-radix-popper-content-wrapper]";
  // Values no surface uses, one per token, set on an element while probing it.
  const SENTINEL_BASE = 7_654_300;

  const tokenValues = (): Map<string, string> => {
    const rootStyle = getComputedStyle(document.documentElement);
    const values = new Map<string, string>();
    for (const name of tokenNames) {
      const value = rootStyle.getPropertyValue(name).trim();
      if (value !== "") values.set(name, value);
    }
    return values;
  };

  /**
   * The token whose `var()` the winning z-index declaration reads, if any.
   * Asks the cascade itself: give every token a sentinel value on `el` and see
   * whether the computed z-index follows one of them. A literal (inline or in
   * a rule) that beats a `var()` rule keeps its own value, so it is not
   * mistaken for the token. The `style` attribute is restored exactly.
   */
  const tokenOf = (el: Element, zIndex: string, values: Map<string, string>): string | null => {
    if (!(el instanceof HTMLElement)) return null;
    const saved = el.getAttribute("style");
    // z-index is animatable: with a transition on the element (shadcn's dialog
    // has one), the sentinel would be interpolated toward, not read back.
    el.style.setProperty("transition", "none", "important");
    const bySentinel = new Map<string, string>();
    let i = 0;
    for (const name of values.keys()) {
      const sentinel = String(SENTINEL_BASE + i++);
      el.style.setProperty(name, sentinel);
      bySentinel.set(sentinel, name);
    }
    const probed = getComputedStyle(el).zIndex;
    // Put the tokens back while transitions are still off, so the return to
    // the real value does not animate either, then restore the attribute.
    for (const name of values.keys()) el.style.removeProperty(name);
    void getComputedStyle(el).zIndex;
    if (saved === null) el.removeAttribute("style");
    else el.setAttribute("style", saved);
    const name = bySentinel.get(probed);
    return name !== undefined && values.get(name) === zIndex ? name : null;
  };

  const describe = (el: Element) => {
    const cls = typeof el.className === "string" ? el.className.trim().split(/\s+/) : [];
    return [el.tagName.toLowerCase(), ...cls.filter(Boolean)].join(".").slice(0, 120);
  };

  const skipped = (el: Element) => el instanceof SVGElement || el.closest(SKIP) !== null;

  const inspect = (el: Element, values: Map<string, string>): ZIndexHit | null => {
    const zIndex = getComputedStyle(el).zIndex;
    if (zIndex === "auto") return null;
    let token = LOCAL_LITERALS.has(zIndex) ? null : tokenOf(el, zIndex, values);
    if (token === null && !LOCAL_LITERALS.has(zIndex) && el.matches(RADIX_WRAPPER)) {
      // Radix positions a portalled popper in this wrapper and copies the
      // content's computed z-index onto the wrapper's inline style. The
      // wrapper is on the scale when a token gives its content that value.
      const content = el.firstElementChild;
      if (content && getComputedStyle(content).zIndex === zIndex) {
        token = tokenOf(content, zIndex, values);
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
  /**
   * Check every element a batch of mutations may have moved onto or off the
   * scale: added subtrees, and the whole subtree of an element whose attributes
   * changed (a selector such as `.open .menu` or `[data-state=open] .menu`
   * reaches descendants).
   */
  const handle = (mutations: MutationRecord[]) => {
    const touched = new Set<Element>();
    for (const m of mutations) {
      const roots = m.type === "attributes" ? [m.target] : Array.from(m.addedNodes);
      for (const node of roots) {
        if (node instanceof Element && node.isConnected) {
          for (const el of elementsUnder(node)) touched.add(el);
        }
      }
    }
    if (touched.size === 0) return;
    const values = tokenValues();
    for (const el of touched) {
      const hit = inspect(el, values);
      if (hit) observed.set(`${hit.element} ${hit.zIndex} ${hit.token}`, hit);
    }
  };

  let observer: MutationObserver | null = null;
  /**
   * Handle what the app changed so far, then drop the records the probe's own
   * `style` writes queued (nothing else runs while the probe does).
   */
  const flush = () => {
    if (!observer) return;
    handle(observer.takeRecords());
    observer.takeRecords();
  };

  window.__karasuZIndexProbe = {
    scan: () => {
      flush();
      // A document with no <body> yet (a blank page between navigations).
      if (!document.body) return [];
      const values = tokenValues();
      const hits = elementsUnder(document.body).flatMap((el) => {
        const hit = inspect(el, values);
        return hit ? [hit] : [];
      });
      observer?.takeRecords();
      return hits;
    },
    observed: () => {
      flush();
      return [...observed.values()];
    },
  };

  const start = () => {
    observer = new MutationObserver((mutations) => {
      handle(mutations);
      observer?.takeRecords();
    });
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      // Every attribute, not only class and style: a surface can stay mounted
      // and take its z-index from `[data-state=open]`, `[open]` or `[hidden]`.
      attributes: true,
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
    } catch (error) {
      // The page closed or navigated while being read; anything else is a
      // bug in the probe and must not pass silently.
      if (page.isClosed() || /closed|context was destroyed|navigat/i.test(String(error))) {
        continue;
      }
      throw error;
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
