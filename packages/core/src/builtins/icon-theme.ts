import type { StyleSheet } from "../types/style.js";
import { StyleParser } from "../parser/style-parser.js";
import { formatDiagnostic } from "../parser/diagnostic-legacy-format.js";

/**
 * Recognised `client` form-factor subtype tags. The icon theme below maps
 * each one to a `client-<tag>` SVG. The resolver also imports this list to
 * implement first-match-wins on node.tags order for multi-tag clients (see
 * `applyClientSubtypeFirstMatch` in `resolver/style-resolver.ts`). Adding a
 * new subtype is a single-file change: extend this array and add the
 * matching `client[<tag>]` rule + SVG.
 */
export const CLIENT_SUBTYPE_TAGS = [
  "mobile",
  "web",
  "desktop",
  "cli",
  "device",
  "extension",
  "embed",
] as const;
export type ClientSubtypeTag = (typeof CLIENT_SUBTYPE_TAGS)[number];

/**
 * Icon theme style source for icon display mode.
 * When active, all node types render as SVG icon cards (160x100 / 160x56)
 * instead of geometric shapes.
 *
 * Injected by the app layer when displayMode === "icon".
 * Applied before user stylesheets so users can still override individual entries.
 */
export const ICON_THEME_STYLE_SOURCE: string = `/* karasu icon theme */

/* ── Logical nodes ── */
service  { shape: url("service");  }
client   { shape: url("client");   }
user     { shape: url("user-card");     }
domain   { shape: url("domain");   }
usecase  { shape: url("usecase");  }
resource { shape: url("resource"); }
team     { shape: url("team");     }
member   { shape: url("member");   }

/* ── Infra nodes ── */
database { shape: url("database"); }
queue    { shape: url("queue-node"); }
storage  { shape: url("cloud-node"); }

/* ── Resource tag variants ── */
resource[table]   { shape: url("table");      }
resource[queue]   { shape: url("queue-card"); }
resource[api]     { shape: url("api");        }
resource[storage] { shape: url("cloud-card"); }

/* ── Client subtype variants ── */
/* When a client node has multiple recognised subtype tags, the resolver
 * applies first-match-wins on node.tags order (see
 * applyClientSubtypeFirstMatch in resolver/style-resolver.ts, which reads
 * the CLIENT_SUBTYPE_TAGS constant exported above) rather than CSS-cascade
 * last-wins. The selector list and the constant must stay in sync. */
client[mobile]    { shape: url("client-mobile");    }
client[web]       { shape: url("client-web");       }
client[desktop]   { shape: url("client-desktop");   }
client[cli]       { shape: url("client-cli");       }
client[device]    { shape: url("client-device");    }
client[extension] { shape: url("client-extension"); }
client[embed]     { shape: url("client-embed");     }

/* ── Deploy nodes ── */
oci      { shape: url("oci");      }
lambda   { shape: url("lambda");   }
jar      { shape: url("jar");      }
war      { shape: url("war");      }
function { shape: url("function"); }
assets   { shape: url("assets");   }
job      { shape: url("job");      }
artifact { shape: url("artifact"); }
`;

/**
 * Base node kind → Icon Mode icon name. Mirrors the base-kind rules of
 * {@link ICON_THEME_STYLE_SOURCE}. Kinds absent here (`system`, deploy /
 * org kinds, infra item kinds) have no Icon Mode pictogram.
 *
 * NOTE: this map and `ICON_THEME_STYLE_SOURCE` are two representations of
 * the same vocabulary — adding a kind to one requires adding it to the
 * other. See TPL-20260519-02.
 */
const BASE_KIND_ICON: Record<string, string> = {
  service: "service",
  client: "client",
  user: "user-card",
  domain: "domain",
  usecase: "usecase",
  resource: "resource",
  team: "team",
  member: "member",
  database: "database",
  queue: "queue-node",
  storage: "cloud-node",
};

/**
 * `resource` tag variant → icon name. Mirrors the `resource[<tag>]` rules
 * of {@link ICON_THEME_STYLE_SOURCE}.
 */
const RESOURCE_TAG_ICON: Record<string, string> = {
  table: "table",
  queue: "queue-card",
  api: "api",
  storage: "cloud-card",
};

/**
 * `client` subtype tag → icon name. Mirrors the `client[<tag>]` rules of
 * {@link ICON_THEME_STYLE_SOURCE}. Keyed by every {@link CLIENT_SUBTYPE_TAGS}
 * entry.
 */
const CLIENT_SUBTYPE_ICON: Record<ClientSubtypeTag, string> = {
  mobile: "client-mobile",
  web: "client-web",
  desktop: "client-desktop",
  cli: "client-cli",
  device: "client-device",
  extension: "client-extension",
  embed: "client-embed",
};

/**
 * Resolves a node's `(kind, tags)` to the Icon Mode icon name the preview
 * draws for it — the same vocabulary {@link ICON_THEME_STYLE_SOURCE}
 * encodes as CSS. Surfaces other than the renderer (e.g. the app's Outline
 * view) call this so they show the same pictogram for a given node.
 *
 * Tag-driven variants take precedence over the base kind:
 * - a `client` with a recognised subtype tag → `client-<tag>`, using
 *   first-match-wins on `tags` order (matching `applyClientSubtypeFirstMatch`
 *   in `resolver/style-resolver.ts`);
 * - a `resource` with a recognised variant tag → the variant icon,
 *   first-match-wins on `tags` order.
 *
 * Returns `undefined` for kinds with no Icon Mode pictogram (`system`,
 * deploy / org kinds, infra item kinds).
 */
export function iconNameForNode(kind: string, tags: readonly string[]): string | undefined {
  if (kind === "client") {
    for (const tag of tags) {
      if (tag in CLIENT_SUBTYPE_ICON) {
        return CLIENT_SUBTYPE_ICON[tag as ClientSubtypeTag];
      }
    }
  } else if (kind === "resource") {
    for (const tag of tags) {
      if (tag in RESOURCE_TAG_ICON) {
        return RESOURCE_TAG_ICON[tag];
      }
    }
  }
  return BASE_KIND_ICON[kind];
}

let _cachedSheet: StyleSheet | null = null;

export function getIconThemeStyleSheet(): StyleSheet {
  if (!_cachedSheet) {
    const result = StyleParser.parse(ICON_THEME_STYLE_SOURCE, "<icon-theme>");
    /* c8 ignore next 4 */
    if (result.diagnostics.length > 0) {
      throw new Error(
        `Icon theme stylesheet has parse errors: ${result.diagnostics.map((d) => formatDiagnostic(d)).join(", ")}`,
      );
    }
    _cachedSheet = result.value;
  }
  return _cachedSheet;
}
