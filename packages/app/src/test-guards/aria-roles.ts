// Checks every element the app renders in a test against two closed sets from
// the ARIA specs (TPL-1399 item 2):
//
// - REQUIRED_CONTEXT: every ARIA 1.2 role that must sit inside a given parent
//   role (`listitem` in a `list`, `menuitem` in a `menu`, …), and
//   REQUIRED_OWNED: the container roles whose owned roles are fixed.
// - ALLOWED_ROLES: the explicit roles ARIA in HTML allows on the interactive
//   and list tags (`button` may be a `menuitem`, never a `listitem`).
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

/** ARIA 1.2 "Required Owned Elements": the roles a container may own (plus separators where allowed). */
const REQUIRED_OWNED: Readonly<Record<string, readonly string[]>> = {
  directory: ["listitem"],
  feed: ["article"],
  grid: ["row", "rowgroup"],
  list: ["listitem"],
  listbox: ["group", "option"],
  menu: ["group", "menuitem", "menuitemcheckbox", "menuitemradio", "separator"],
  menubar: ["group", "menuitem", "menuitemcheckbox", "menuitemradio", "separator"],
  row: ["cell", "columnheader", "gridcell", "rowheader"],
  rowgroup: ["row"],
  table: ["caption", "row", "rowgroup"],
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
    "link",
    "menuitem",
    "menuitemcheckbox",
    "menuitemradio",
    "option",
    "radio",
    "switch",
    "tab",
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
    case "li":
      return el.parentElement && ["ul", "ol", "menu"].includes(el.parentElement.localName)
        ? "listitem"
        : null;
    case "button":
      return "button";
    case "a":
      return el.hasAttribute("href") ? "link" : null;
    case "table":
      return "table";
    case "thead":
    case "tbody":
    case "tfoot":
      return "rowgroup";
    case "tr":
      return "row";
    case "td":
      return "cell";
    case "th":
      return "columnheader";
    case "nav":
      return "navigation";
    default:
      return null;
  }
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

/** The nearest descendants with a role that counts, looking through generic wrappers. */
function ownedRoles(el: Element): string[] {
  const out: string[] = [];
  const walk = (node: Element) => {
    for (const child of node.children) {
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
  const owned = REQUIRED_OWNED[role];
  if (owned) {
    for (const child of ownedRoles(el)) {
      if (!owned.includes(child)) problems.push(`role "${role}" may not own role "${child}"`);
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
