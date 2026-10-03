import type { Locator } from "@playwright/test";

/**
 * WCAG relative luminance of a computed `rgb()` / `rgba()` colour string.
 *
 * Returns `NaN` when the string does not parse. `NaN` fails every `toBeLessThan`
 * / `toBeGreaterThan` the theme specs use, so an unparsable colour (an element
 * that never painted, a `transparent` that slipped through) is a failure, not a
 * silently "dark enough" reading. The older per-spec copy in AT-1470 returned
 * `-1`, which `toBeLessThan(0.5)` accepted (#3040).
 */
export function luminance(rgb: string): number {
  const m = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!m) return Number.NaN;
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
