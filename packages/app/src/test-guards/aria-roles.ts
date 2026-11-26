// Checks every element the app renders in a test against two closed sets from
// the ARIA specs (TPL-1399 item 2):
//
// - REQUIRED_CONTEXT: every ARIA 1.2 role that must sit inside a given parent
//   role (`listitem` in a `list`, `menuitem` in a `menu`, …), and
//   REQUIRED_OWNED: the container roles that must own at least one of the
//   listed roles (a `listbox` owns an `option`). As in ARIA 1.2, the list is
//   what must be present, not the only children allowed: a `caption` in a
//   `grid` or a heading beside the tabs of a `tablist` passes.
// - ALLOWED_ROLES: the explicit roles ARIA in HTML allows on the interactive
//   and list tags (`button` may be a `menuitem`, never a `listitem`).
//
// Native elements count by their implicit role (ARIA in HTML): lists, table
// parts, buttons, links, nav, inputs by type, select, textarea, img, headings
// and hr. So an explicit `menu` whose only child is a native checkbox is
// reported. Native `<option>` / `<optgroup>` belong to their `<select>` and
// are left out, as are tags whose implicit role no container rule names.
//
// The tables are the spec, not a list of the app's components, so a new
// component is checked as soon as a test renders it. `a11y-sweep-setup.ts`
// runs the check on every DOM change of every app test.

/** Roles that do not count as a parent or child: generic containers and presentational wrappers. */
const TRANSPARENT = new Set(["generic", "none", "presentation"]);

/** ARIA 1.2 "Required Context Role", for every role that has one. */
const REQUIRED_CONTEXT: Readonly<Record<string, readonly string[]>> = {
  caption: ["figure", "grid", "table", "treegrid"],
  cell: ["row"],
  columnheader: ["row"],
  gridcell: ["row"],
  listitem: ["directory", "list"],
  menuitem: ["group", "menu", "menubar"],
  menuitemcheckbox: ["group", "menu", "menubar"],
  menuitemradio: ["group", "menu", "menubar"],
  option: ["group", "listbox"],
  row: ["grid", "rowgroup", "table", "treegrid"],
  rowgroup: ["grid", "table", "treegrid"],
  rowheader: ["row"],
  tab: ["tablist"],
  treeitem: ["group", "tree"],
};

/**
 * ARIA 1.2 "Required Owned Elements": a container with one of these roles owns
 * at least one element with a listed role (`group` stands for the spec's
 * "group → menuitem" and the like). It is a presence requirement, not a list
 * of the only children allowed. Checked on explicit roles only (HTML allows
 * an empty `<ul>` or `<table>`), and only on a container that owns some
 * roled child: an empty one is left for review (axe-core's
 * aria-required-children does the same for most of these roles), because the
 * app's empty states ("No matching commands") render an empty listbox. ARIA 1.2's loading exception,
 * `aria-busy="true"` on the container or around it, also passes.
 */
const REQUIRED_OWNED: Readonly<Record<string, readonly string[]>> = {
  feed: ["article"],
  grid: ["row", "rowgroup"],
  list: ["listitem"],
  listbox: ["group", "option"],
  menu: ["group", "menuitem", "menuitemcheckbox", "menuitemradio"],
  menubar: ["group", "menuitem", "menuitemcheckbox", "menuitemradio"],
  radiogroup: ["radio"],
  row: ["cell", "columnheader", "gridcell", "rowheader"],
  rowgroup: ["row"],
  table: ["row", "rowgroup"],
  tablist: ["tab"],
  tree: ["group", "treeitem"],
  treegrid: ["row", "rowgroup"],
};

const LIST_ROLES = [
  "directory",
  "group",
  "listbox",
  "menu",
  "menubar",
  "none",
  "presentation",
  "radiogroup",
  "tablist",
  "toolbar",
  "tree",
];

/** ARIA in HTML: explicit roles allowed on these tags. Other tags are not checked. */
const ALLOWED_ROLES: Readonly<Record<string, readonly string[]>> = {
  button: [
    "checkbox",
    "combobox",
    "gridcell",
    "link",
    "menuitem",
    "menuitemcheckbox",
    "menuitemradio",
    "option",
    "radio",
    "separator",
    "slider",
    "switch",
    "tab",
    "treeitem",
  ],
  a: [
    "button",
    "checkbox",
    "menuitem",
    "menuitemcheckbox",
    "menuitemradio",
    "option",
    "radio",
    "switch",
    "tab",
    "treeitem",
  ],
  li: [
    "menuitem",
    "menuitemcheckbox",
    "menuitemradio",
    "none",
    "option",
    "presentation",
    "radio",
    "separator",
    "tab",
    "treeitem",
  ],
  ul: LIST_ROLES,
  ol: LIST_ROLES,
  menu: LIST_ROLES,
  nav: ["menu", "menubar", "none", "presentation", "tablist"],
};

/** The implicit role of the tags the tables above talk about; `null` for the rest. */
function implicitRole(el: Element): string | null {
  switch (el.localName) {
    case "ul":
    case "ol":
    case "menu":
      return "list";
    case "li": {
      const list = el.parentElement;
      if (!list || !["ul", "ol", "menu"].includes(list.localName)) return null;
      // A presentational list makes its items presentational too (ARIA 1.2).
      return isPresentational(list) ? null : "listitem";
    }
    case "button":
      return "button";
    case "a":
      return el.hasAttribute("href") ? "link" : null;
    case "table":
      return "table";
    case "thead":
    case "tbody":
    case "tfoot":
      return inPresentationalTable(el) ? null : "rowgroup";
    case "tr":
      return inPresentationalTable(el) ? null : "row";
    case "td":
      return inPresentationalTable(el) ? null : "cell";
    case "th":
      return inPresentationalTable(el) ? null : "columnheader";
    case "nav":
      return "navigation";
    case "input":
      return inputRole(el);
    case "select":
      return el.hasAttribute("multiple") || Number(el.getAttribute("size") ?? "0") > 1
        ? "listbox"
        : "combobox";
    case "textarea":
      return "textbox";
    case "img":
      return el.getAttribute("alt") === "" ? "presentation" : "img";
    case "h1":
    case "h2":
    case "h3":
    case "h4":
    case "h5":
    case "h6":
      return "heading";
    case "hr":
      return "separator";
    // A native <option> / <optgroup> belongs to its <select>; it is not
    // checked against the ARIA listbox rules.
    default:
      return null;
  }
}

/** ARIA in HTML's implicit role of an `<input>`, by its type. */
function inputRole(el: Element): string | null {
  const type = (el.getAttribute("type") ?? "text").toLowerCase();
  const withList = el.hasAttribute("list");
  switch (type) {
    case "hidden":
      return null;
    case "checkbox":
      return "checkbox";
    case "radio":
      return "radio";
    case "range":
      return "slider";
    case "number":
      return "spinbutton";
    case "button":
    case "submit":
    case "reset":
    case "image":
      return "button";
    case "search":
      return withList ? "combobox" : "searchbox";
    case "text":
    case "email":
    case "tel":
    case "url":
      return withList ? "combobox" : "textbox";
    default:
      // date, color, file, password, …: no ARIA role a container could own.
      return null;
  }
}

function isPresentational(el: Element): boolean {
  const role = el.getAttribute("role")?.trim().split(/\s+/)[0];
  return role === "none" || role === "presentation";
}

/** Table parts inherit presentation from a presentational `<table>` (ARIA 1.2). */
function inPresentationalTable(el: Element): boolean {
  const table = el.closest("table");
  return table !== null && isPresentational(table);
}

function roleOf(el: Element): string | null {
  const explicit = el.getAttribute("role")?.trim().split(/\s+/)[0];
  return explicit || implicitRole(el);
}

/** The nearest ancestor with a role that counts (skips generic and presentational ones). */
function contextRole(el: Element): string | null {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const r = roleOf(p);
    if (r && !TRANSPARENT.has(r)) return r;
  }
  return null;
}

/**
 * The nearest descendants with a role that counts, looking through generic
 * wrappers. Hidden subtrees are not in the accessibility tree, so they own nothing.
 */
function ownedRoles(el: Element): string[] {
  const out: string[] = [];
  const walk = (node: Element) => {
    for (const child of node.children) {
      if (child.hasAttribute("hidden") || child.getAttribute("aria-hidden") === "true") continue;
      const r = roleOf(child);
      if (r && !TRANSPARENT.has(r)) out.push(r);
      else walk(child);
    }
  };
  walk(el);
  return out;
}

function hiddenFromUser(el: Element): boolean {
  return el.closest('[hidden], [aria-hidden="true"]') !== null;
}

export function describeElement(el: Element): string {
  const role = el.getAttribute("role");
  const cls = el.getAttribute("class");
  const text = (el.textContent ?? "").trim().slice(0, 30);
  return `<${el.localName}${role ? ` role="${role}"` : ""}${cls ? ` class="${cls}"` : ""}>${text}`;
}

/** Problems with one element's own role (not its descendants). */
export function roleProblems(el: Element): string[] {
  if (hiddenFromUser(el)) return [];
  const problems: string[] = [];
  const explicit = el.getAttribute("role")?.trim().split(/\s+/)[0];
  // An `<a>` without `href` is a generic element: ARIA in HTML allows any role on it.
  const allowed =
    el.localName === "a" && !el.hasAttribute("href") ? undefined : ALLOWED_ROLES[el.localName];
  if (explicit && allowed && explicit !== implicitRole(el) && !allowed.includes(explicit)) {
    problems.push(`role "${explicit}" is not allowed on <${el.localName}>`);
  }
  const role = roleOf(el);
  if (!role) return problems;
  const context = REQUIRED_CONTEXT[role];
  if (context) {
    const parent = contextRole(el);
    if (!parent || !context.includes(parent)) {
      problems.push(
        `role "${role}" needs a parent of ${context.join(" / ")}, found ${parent ?? "none"}`,
      );
    }
  }
  const required = explicit === role ? REQUIRED_OWNED[role] : undefined;
  if (required && !el.closest('[aria-busy="true"]')) {
    const owned = ownedRoles(el);
    if (owned.length > 0 && !owned.some((child) => required.includes(child))) {
      problems.push(`role "${role}" owns no ${required.join(" / ")}, only ${owned.join(", ")}`);
    }
  }
  return problems;
}

/** Selector for every element `roleProblems` can say something about. */
export const ROLE_CHECK_SELECTOR = [
  "[role]",
  ...Object.keys(ALLOWED_ROLES),
  "table",
  "thead",
  "tbody",
  "tfoot",
  "tr",
  "td",
  "th",
].join(", ");
