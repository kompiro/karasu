import type { StyleSheet } from "../types/style.js";
import { StyleParser } from "../parser/style-parser.js";

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
user     { shape: url("user-card");     }
domain   { shape: url("domain");   }
usecase  { shape: url("domain");   }
resource { shape: url("resource"); }
team     { shape: url("team");     }
member   { shape: url("member");   }

/* ── Resource tag variants ── */
resource[table]   { shape: url("database"); }
resource[queue]   { shape: url("queue-card");    }
resource[api]     { shape: url("api");      }
resource[storage] { shape: url("cloud-card");    }

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
        `Icon theme stylesheet has parse errors: ${result.diagnostics.map((d) => d.message).join(", ")}`,
      );
    }
    _cachedSheet = result.value;
  }
  return _cachedSheet;
}
