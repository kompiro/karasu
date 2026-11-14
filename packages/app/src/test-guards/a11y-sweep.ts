// Watches the DOM of every app test and records the role and button-label
// problems of each element as it is rendered (TPL-1399 items 2 and 3).
//
// A MutationObserver sees every subtree React inserts and every role change,
// so states a test only passes through (an open menu, a dialog) are checked
// too, not only what is left at the end. Elements are checked while they are
// in the document: their parent role decides the result.
//
// Only app UI is checked: an element React rendered, or one inside it (the
// diagram SVG a pane injects, a node a component appends imperatively).
// Elements a test builds by hand (`document.createElement` on `body`) are not.

import { ROLE_CHECK_SELECTOR, describeElement, roleProblems } from "./aria-roles.js";
import { BUTTON_SELECTOR, buttonLabelProblem } from "./button-label.js";

export interface A11yProblem {
  rule: "role" | "button-label";
  element: string;
  message: string;
}

const problems = new Map<string, A11yProblem>();
let observer: MutationObserver | null = null;
/** How many elements each rule has looked at in this test (for the guard's own test). */
const checked = { role: 0, "button-label": 0 };

function record(rule: A11yProblem["rule"], el: Element, message: string) {
  const element = describeElement(el);
  problems.set(`${rule}|${element}|${message}`, { rule, element, message });
}

/** Whether `el` is React-rendered or sits inside something React rendered. */
function inReactTree(el: Element): boolean {
  for (let p: Element | null = el; p; p = p.parentElement) {
    if (
      Object.keys(p).some((k) => k.startsWith("__reactFiber$") || k.startsWith("__reactContainer$"))
    ) {
      return true;
    }
  }
  return false;
}

function checkOne(el: Element) {
  if (!el.isConnected || !inReactTree(el)) return;
  if (el.matches(ROLE_CHECK_SELECTOR)) {
    checked.role++;
    for (const m of roleProblems(el)) record("role", el, m);
  }
  if (el.matches(BUTTON_SELECTOR)) {
    checked["button-label"]++;
    const m = buttonLabelProblem(el);
    if (m) record("button-label", el, m);
  }
}

function checkSubtree(root: Element) {
  checkOne(root);
  for (const el of root.querySelectorAll(`${ROLE_CHECK_SELECTOR}, ${BUTTON_SELECTOR}`))
    checkOne(el);
}

function checkAround(node: Node) {
  const el = node.nodeType === 1 ? (node as Element) : node.parentElement;
  if (!el?.isConnected) return;
  // A change inside a button can take its text away; a change inside a
  // container can give it a child it may not own.
  const button = el.closest(BUTTON_SELECTOR);
  if (button) checkOne(button);
  const owner = el.closest("[role], ul, ol, menu, table, thead, tbody, tfoot, tr");
  if (owner) checkOne(owner);
}

function processRecords(records: MutationRecord[]) {
  for (const r of records) {
    if (r.type === "childList") {
      for (const n of r.addedNodes) if (n.nodeType === 1) checkSubtree(n as Element);
      checkAround(r.target);
    } else if (r.type === "attributes") {
      if (r.target.nodeType === 1) checkSubtree(r.target as Element);
    } else {
      checkAround(r.target);
    }
  }
}

/** Start watching `document` (a no-op outside a DOM environment). */
export function startA11ySweep(): void {
  if (typeof MutationObserver === "undefined" || typeof document === "undefined") return;
  problems.clear();
  checked.role = 0;
  checked["button-label"] = 0;
  observer?.disconnect();
  observer = new MutationObserver(processRecords);
  observer.observe(document, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ["role", "aria-hidden", "hidden", "href"],
  });
  // What is already in the document when the test starts.
  if (document.body) checkSubtree(document.body);
}

/** Process pending records, stop watching, and return what was found. */
export function stopA11ySweep(): A11yProblem[] {
  if (observer) {
    processRecords(observer.takeRecords());
    observer.disconnect();
    observer = null;
  }
  return [...problems.values()];
}

/** Process pending records now (for the guard's own test). */
export function flushA11ySweep(): { problems: A11yProblem[]; checked: typeof checked } {
  if (observer) processRecords(observer.takeRecords());
  return { problems: [...problems.values()], checked: { ...checked } };
}

/** Drop what was found so far (for the guard's own test). */
export function clearA11yProblems(): void {
  problems.clear();
}
