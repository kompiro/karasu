/**
 * Built-in icon registration.
 *
 * core fills the shape registry with its own built-in icon set on import,
 * the same way `renderer/shapes.ts` registers the geometric shapes. Nothing a
 * host does (or forgets to do) changes what `url("database")` or icon display
 * mode resolves to: the browser app, `karasu render`, the VS Code extension
 * host, the LSP and the Cloudflare Workers all read one registry with the
 * same contents (Issue #2802, TPL-2802).
 *
 * The icon bodies come from the generated module beside this file; the
 * editable originals stay in `packages/core/icons/` (ADR-9005). Hosts that
 * ship their own icons still use `resolveIconManifest` /
 * `loadAndRegisterIcon` — those calls add to (or override) this set.
 */

import { loadAndRegisterIcon } from "../renderer/svg-icon-loader.js";
import { BUILTIN_ICON_SOURCES } from "./builtin-icons.generated.js";

/**
 * (Re)register every built-in icon with `builtIn: true`, so the
 * `{{color}}` / `{{fill}}` / `{{stroke}}` placeholders in their bodies are
 * injected at render time. Runs once on import; tests that `clearRegistry()`
 * call it again (next to `registerBuiltinShapes()`) to restore the default
 * registry contents.
 */
export function registerBuiltinIcons(): void {
  for (const { name, svg } of BUILTIN_ICON_SOURCES) {
    loadAndRegisterIcon(name, svg, true);
  }
}

// Auto-register on import
registerBuiltinIcons();
