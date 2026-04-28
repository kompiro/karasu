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

let _cachedSheet: StyleSheet | null = null;

export function getIconThemeStyleSheet(): StyleSheet {
  if (!_cachedSheet) {
    const result = StyleParser.parse(ICON_THEME_STYLE_SOURCE);
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
