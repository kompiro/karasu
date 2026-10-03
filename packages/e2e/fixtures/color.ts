import type { Locator } from "@playwright/test";

/**
 * WCAG relative luminance of a computed `rgb()` / `rgba()` colour string.
 *
 * Returns `NaN` when the string does not parse **or has alpha 0**.
 * `getComputedStyle` reports an unpainted background as `rgba(0, 0, 0, 0)`,
 * never as the keyword `transparent`, and a regex that only reads the three
 * channels turns that into opaque black (luminance 0), which
 * `toBeLessThan(0.5)` happily accepts. `NaN` fails every `toBeLessThan` /
 * `toBeGreaterThan` the theme specs use, so "never painted" is a failure, not
 * a silently dark reading. The older per-spec copy in AT-1470 returned `-1` on
 * a parse miss, which the same assertion also accepted (#3040).
 *
 * A non-zero alpha is still ignored: the specs compare fully painted
 * surfaces, and compositing against an unknown backdrop is out of scope.
 */
export function luminance(rgb: string): number {
  const m = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/);
  if (!m) return Number.NaN;
  if (m[4] !== undefined && Number(m[4]) === 0) return Number.NaN;
  const [r, g, b] = [Number(m[1]), Number(m[2]), Number(m[3])].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two computed colours (order does not matter). */
export function contrastRatio(fg: string, bg: string): number {
  const [l1, l2] = [luminance(fg), luminance(bg)].sort((a, b) => b - a);
  return (l1 + 0.05) / (l2 + 0.05);
}

/**
 * Contrast ratio of an element's text against its *effective* background:
 * the first ancestor (inclusive) whose `background-color` is not transparent.
 * Text over a transparent box inherits the panel colour behind it, which is
 * what a reader sees and what AA is measured against.
 *
 * If no ancestor paints at all, the background stays `rgba(0, 0, 0, 0)` and
 * `luminance` returns `NaN`, so the ratio is `NaN` and the AA assertion
 * fails. That is deliberate: every surface the specs measure sits on a
 * painted panel, so an unpainted chain is a selector pointing at the wrong
 * element, not a 21:1 contrast.
 */
export async function contrastOf(target: Locator): Promise<number> {
  const pair = await target.first().evaluate((el) => {
    const cs = getComputedStyle(el);
    let node: Element | null = el;
    let bg = cs.backgroundColor;
    while (node && (bg === "rgba(0, 0, 0, 0)" || bg === "transparent")) {
      node = node.parentElement;
      if (node) bg = getComputedStyle(node).backgroundColor;
    }
    return { fg: cs.color, bg };
  });
  return contrastRatio(pair.fg, pair.bg);
}
