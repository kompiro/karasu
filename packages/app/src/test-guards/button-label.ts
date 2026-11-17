// Every button the app renders needs visible text, not only an icon or an
// `aria-label` (TPL-1399 item 3; ADR-9009 states the rule for the toolbar).
// "Visible text" is the text a sighted user reads: the button's text with
// `aria-hidden` parts (decorative icons) and `sr-only` parts (screen-reader
// text) taken out, holding at least one letter or digit, so a lone glyph such
// as "×" or "▾" does not pass.

const LETTER_OR_DIGIT = /[\p{L}\p{N}]/u;

export const BUTTON_SELECTOR = 'button, [role="button"]';

/** The text of `el` a reader sees: aria-hidden subtrees left out. */
function visibleText(el: Element): string {
  let text = "";
  for (const node of el.childNodes) {
    if (node.nodeType === 3) text += node.textContent ?? "";
    else if (node.nodeType === 1) {
      const child = node as Element;
      if (
        child.getAttribute("aria-hidden") === "true" ||
        child.hasAttribute("hidden") ||
        child.classList.contains("sr-only")
      ) {
        continue;
      }
      text += visibleText(child);
    }
  }
  return text;
}

/**
 * Buttons that were icon-only before this check existed, each with why. A new
 * button matching none of these selectors needs a text label. The guard's own
 * test checks that every selector still names a class or attribute the app or
 * the renderer emits, so an entry cannot outlive its button.
 */
export const BUTTON_LABEL_EXEMPTIONS: readonly { selector: string; reason: string }[] = [
  {
    selector: '.toolbar-btn-group > [aria-haspopup="menu"]',
    reason:
      "The caret half of a split button: its text label is the main half beside it (.claude/rules/app-ui.md, Split buttons).",
  },
  {
    selector: ".krs-expand-control",
    reason:
      "The ⊕/⊖ expand control the core renderer draws on a service card inside the diagram SVG; labelled by aria-label, no room for text on the card.",
  },
  {
    selector: ".node-detail-close",
    reason:
      "The × in the corner of the node and edge detail panels; labelled by aria-label. Whether corner close buttons need text is open (TPL-1399 item 3 is left unmarked until that is decided).",
  },
  {
    selector: ".facet-overview-close",
    reason:
      "The × in the corner of the facet overview panel; same open question as .node-detail-close.",
  },
];

/** Whether `el` is a button a user can see. */
function isShownButton(el: Element): boolean {
  if (el.closest('[hidden], [aria-hidden="true"]')) return false;
  if (el.localName === "button") {
    const role = el.getAttribute("role");
    return !role || role === "button";
  }
  return el.getAttribute("role") === "button";
}

/** A problem with this button's label, or null when it reads fine. */
export function buttonLabelProblem(el: Element): string | null {
  if (!isShownButton(el)) return null;
  if (BUTTON_LABEL_EXEMPTIONS.some((x) => el.matches(x.selector))) return null;
  if (LETTER_OR_DIGIT.test(visibleText(el))) return null;
  return "button has no visible text label (an icon or aria-label alone is not enough)";
}
