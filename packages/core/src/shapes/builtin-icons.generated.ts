// GENERATED FILE — do not edit by hand.
//
// Source of truth: `packages/core/icons/icons.json` and the `.svg` files
// beside it. Regenerate with `pnpm gen:icons`; `pnpm gen:icons --check`
// and `builtin-icons.generated.test.ts` fail when this file is stale.
//
// Why a generated module exists at all: core registers the built-in icon
// set on import (`builtin-icons.ts`), so every drawing surface resolves
// `shape: url("<name>")` and icon display mode identically without a
// host-side registration call (Issue #2802, TPL-2802). ADR-9005 keeps the
// `.svg` files as the editable originals; this file is a build product.

export interface BuiltinIconSource {
  /** Icon name — the `url("<name>")` argument and the manifest `name`. */
  readonly name: string;
  /** The full `.svg` file content, as `svg-icon-loader` parses it. */
  readonly svg: string;
}

export const BUILTIN_ICON_SOURCES: readonly BuiltinIconSource[] = [
  {
    name: "service",
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 100">\n  <g class="krs-pictogram" transform="translate(6, 4)">\n    <path d="M10 6a4 4 0 1 1 0 8 4 4 0 0 1 0-8zm0 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4z" fill="{{color}}" fill-rule="evenodd"/>\n    <path d="M10 0a10 10 0 0 1 4.5 1.1l-.9 1.8A8 8 0 1 0 18 10h2A10 10 0 1 1 10 0z" fill="{{color}}"/>\n  </g>\n  <text class="krs-label" x="30" y="19" text-anchor="start"/>\n  <text class="krs-description" x="8" y="44" text-anchor="start"/>\n</svg>\n',
  },
  {
    name: "client",
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 100">\n  <g class="krs-pictogram" transform="translate(6, 4)">\n    <rect x="2" y="2" width="16" height="20" rx="2" fill="none" stroke="{{color}}" stroke-width="1.5"/>\n    <line x1="2" y1="6" x2="18" y2="6" stroke="{{color}}" stroke-width="1.5"/>\n    <rect x="5" y="9" width="3" height="3" fill="{{color}}"/>\n    <rect x="12" y="9" width="3" height="3" fill="{{color}}"/>\n    <rect x="5" y="15" width="3" height="3" fill="{{color}}"/>\n    <rect x="12" y="15" width="3" height="3" fill="{{color}}"/>\n  </g>\n  <text class="krs-label" x="30" y="19" text-anchor="start"/>\n  <text class="krs-description" x="8" y="44" text-anchor="start"/>\n</svg>\n',
  },
  {
    name: "client-mobile",
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 100">\n  <g class="krs-pictogram" transform="translate(6, 4)">\n    <!-- phone body -->\n    <rect x="5" y="1" width="10" height="18" rx="2" fill="none" stroke="{{color}}" stroke-width="1.5"/>\n    <!-- speaker notch -->\n    <line x1="8" y1="3.5" x2="12" y2="3.5" stroke="{{color}}" stroke-width="1.2" stroke-linecap="round"/>\n    <!-- single app icon centered -->\n    <rect x="8.5" y="8" width="3" height="3" rx="0.5" fill="{{color}}"/>\n    <!-- home button -->\n    <circle cx="10" cy="16.5" r="0.9" fill="none" stroke="{{color}}" stroke-width="1"/>\n  </g>\n  <text class="krs-label" x="30" y="19" text-anchor="start"/>\n  <text class="krs-description" x="8" y="44" text-anchor="start"/>\n</svg>\n',
  },
  {
    name: "client-web",
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 100">\n  <g class="krs-pictogram" transform="translate(6, 4)">\n    <!-- browser window -->\n    <rect x="1" y="3" width="18" height="16" rx="1.5" fill="none" stroke="{{color}}" stroke-width="1.5"/>\n    <!-- tab strip separator -->\n    <line x1="1" y1="8" x2="19" y2="8" stroke="{{color}}" stroke-width="1.2"/>\n    <!-- traffic-light dots -->\n    <circle cx="3" cy="5.5" r="0.7" fill="{{color}}"/>\n    <circle cx="5" cy="5.5" r="0.7" fill="{{color}}"/>\n    <circle cx="7" cy="5.5" r="0.7" fill="{{color}}"/>\n    <!-- address bar -->\n    <rect x="3" y="10" width="14" height="2" rx="0.6" fill="{{color}}" opacity="0.4"/>\n    <!-- content lines -->\n    <line x1="3" y1="14.5" x2="13" y2="14.5" stroke="{{color}}" stroke-width="1" stroke-linecap="round" opacity="0.7"/>\n    <line x1="3" y1="16.5" x2="11" y2="16.5" stroke="{{color}}" stroke-width="1" stroke-linecap="round" opacity="0.7"/>\n  </g>\n  <text class="krs-label" x="30" y="19" text-anchor="start"/>\n  <text class="krs-description" x="8" y="44" text-anchor="start"/>\n</svg>\n',
  },
  {
    name: "client-desktop",
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 100">\n  <g class="krs-pictogram" transform="translate(6, 4)">\n    <!-- monitor frame -->\n    <rect x="1" y="3" width="18" height="12" rx="1" fill="none" stroke="{{color}}" stroke-width="1.5"/>\n    <!-- title bar -->\n    <line x1="1" y1="6.5" x2="19" y2="6.5" stroke="{{color}}" stroke-width="1.2"/>\n    <!-- window controls -->\n    <circle cx="3" cy="4.8" r="0.6" fill="{{color}}"/>\n    <circle cx="5" cy="4.8" r="0.6" fill="{{color}}"/>\n    <circle cx="7" cy="4.8" r="0.6" fill="{{color}}"/>\n    <!-- content placeholders -->\n    <line x1="3" y1="9" x2="13" y2="9" stroke="{{color}}" stroke-width="1" stroke-linecap="round" opacity="0.7"/>\n    <line x1="3" y1="11.5" x2="11" y2="11.5" stroke="{{color}}" stroke-width="1" stroke-linecap="round" opacity="0.7"/>\n    <!-- stand -->\n    <line x1="6" y1="15" x2="14" y2="15" stroke="{{color}}" stroke-width="1.5"/>\n    <line x1="10" y1="15" x2="10" y2="18" stroke="{{color}}" stroke-width="1.2"/>\n    <line x1="6.5" y1="18.5" x2="13.5" y2="18.5" stroke="{{color}}" stroke-width="1.2" stroke-linecap="round"/>\n  </g>\n  <text class="krs-label" x="30" y="19" text-anchor="start"/>\n  <text class="krs-description" x="8" y="44" text-anchor="start"/>\n</svg>\n',
  },
  {
    name: "client-cli",
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 100">\n  <g class="krs-pictogram" transform="translate(6, 4)">\n    <!-- terminal frame -->\n    <rect x="1" y="2" width="18" height="16" rx="1.5" fill="none" stroke="{{color}}" stroke-width="1.5"/>\n    <!-- title bar separator -->\n    <line x1="1" y1="5.5" x2="19" y2="5.5" stroke="{{color}}" stroke-width="1.2"/>\n    <!-- traffic-light dots -->\n    <circle cx="3" cy="3.8" r="0.6" fill="{{color}}"/>\n    <circle cx="4.8" cy="3.8" r="0.6" fill="{{color}}"/>\n    <circle cx="6.6" cy="3.8" r="0.6" fill="{{color}}"/>\n    <!-- chevron prompt -->\n    <polyline points="3.5,9 5.5,11 3.5,13" fill="none" stroke="{{color}}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>\n    <!-- blinking cursor -->\n    <rect x="7.5" y="10" width="3.5" height="2" fill="{{color}}"/>\n    <!-- second-line input dots -->\n    <line x1="3.5" y1="15.5" x2="14" y2="15.5" stroke="{{color}}" stroke-width="1" stroke-linecap="round" opacity="0.6"/>\n  </g>\n  <text class="krs-label" x="30" y="19" text-anchor="start"/>\n  <text class="krs-description" x="8" y="44" text-anchor="start"/>\n</svg>\n',
  },
  {
    name: "client-device",
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 100">\n  <g class="krs-pictogram" transform="translate(6, 4)">\n    <!-- antenna -->\n    <line x1="10" y1="0" x2="10" y2="4" stroke="{{color}}" stroke-width="1.5" stroke-linecap="round"/>\n    <circle cx="10" cy="0" r="1" fill="{{color}}"/>\n    <!-- IoT box body -->\n    <rect x="2" y="4" width="16" height="14" rx="1.5" fill="none" stroke="{{color}}" stroke-width="1.5"/>\n    <!-- LED indicator -->\n    <circle cx="5" cy="7.5" r="1.1" fill="{{color}}"/>\n    <!-- vent slats -->\n    <line x1="9" y1="7" x2="16" y2="7" stroke="{{color}}" stroke-width="0.9" opacity="0.7"/>\n    <line x1="9" y1="9" x2="16" y2="9" stroke="{{color}}" stroke-width="0.9" opacity="0.7"/>\n    <!-- screen / dial -->\n    <rect x="5" y="11.5" width="10" height="4.5" rx="0.6" fill="none" stroke="{{color}}" stroke-width="1.2"/>\n    <line x1="6.5" y1="14" x2="13.5" y2="14" stroke="{{color}}" stroke-width="0.9" opacity="0.7"/>\n  </g>\n  <text class="krs-label" x="30" y="19" text-anchor="start"/>\n  <text class="krs-description" x="8" y="44" text-anchor="start"/>\n</svg>\n',
  },
  {
    name: "client-extension",
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 100">\n  <g class="krs-pictogram" transform="translate(6, 4)">\n    <!-- puzzle piece: square body with one tab on top and one slot on right -->\n    <path d="\n      M2 5\n      L7 5\n      Q7 2 9 2\n      Q11 2 11 5\n      L16 5\n      L16 9\n      Q19 9 19 11\n      Q19 13 16 13\n      L16 17\n      L2 17\n      Z"\n      fill="none" stroke="{{color}}" stroke-width="1.5" stroke-linejoin="round"/>\n    <!-- inner accent dot — sized to read against the puzzle silhouette -->\n    <circle cx="9" cy="11" r="1.8" fill="{{color}}"/>\n  </g>\n  <text class="krs-label" x="30" y="19" text-anchor="start"/>\n  <text class="krs-description" x="8" y="44" text-anchor="start"/>\n</svg>\n',
  },
  {
    name: "client-embed",
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 100">\n  <g class="krs-pictogram" transform="translate(6, 4)">\n    <!-- outer frame -->\n    <rect x="1" y="2" width="18" height="16" rx="1.5" fill="none" stroke="{{color}}" stroke-width="1.5" opacity="0.6"/>\n    <!-- inner embedded widget -->\n    <rect x="5" y="6" width="10" height="8" rx="1" fill="{{color}}" opacity="0.85"/>\n    <!-- corner brackets to convey "embedded" -->\n    <polyline points="2,4 2,3 3,3" fill="none" stroke="{{color}}" stroke-width="1.2" stroke-linecap="round"/>\n    <polyline points="18,3 17,3 17,4" fill="none" stroke="{{color}}" stroke-width="1.2" stroke-linecap="round"/>\n    <polyline points="17,16 17,17 18,17" fill="none" stroke="{{color}}" stroke-width="1.2" stroke-linecap="round"/>\n    <polyline points="3,17 2,17 2,16" fill="none" stroke="{{color}}" stroke-width="1.2" stroke-linecap="round"/>\n  </g>\n  <text class="krs-label" x="30" y="19" text-anchor="start"/>\n  <text class="krs-description" x="8" y="44" text-anchor="start"/>\n</svg>\n',
  },
  {
    name: "user-card",
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 100">\n  <g class="krs-pictogram" transform="translate(6, 4)">\n    <circle cx="10" cy="6" r="4.5" fill="{{color}}"/>\n    <path d="M2 18.5c0-4 3.6-7 8-7s8 3 8 7" fill="{{color}}" stroke="none"/>\n  </g>\n  <text class="krs-label" x="30" y="19" text-anchor="start"/>\n  <text class="krs-description" x="8" y="44" text-anchor="start"/>\n</svg>\n',
  },
  {
    name: "domain",
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 100">\n  <g class="krs-pictogram" transform="translate(6, 4)">\n    <rect x="1" y="8" width="18" height="11" rx="1.5" fill="{{color}}" opacity="0.9"/>\n    <rect x="3" y="4" width="14" height="10" rx="1.5" fill="{{color}}" opacity="0.6"/>\n    <rect x="5" y="0" width="10" height="8" rx="1.5" fill="{{color}}" opacity="0.35"/>\n  </g>\n  <text class="krs-label" x="30" y="19" text-anchor="start"/>\n  <text class="krs-description" x="8" y="44" text-anchor="start"/>\n</svg>\n',
  },
  {
    name: "resource",
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 100">\n  <g class="krs-pictogram" transform="translate(6, 4)">\n    <path d="M10 1l8 5v8l-8 5-8-5V6z" fill="{{color}}" opacity="0.8"/>\n    <path d="M10 1l8 5-8 5-8-5z" fill="{{color}}"/>\n  </g>\n  <text class="krs-label" x="30" y="19" text-anchor="start"/>\n  <text class="krs-description" x="8" y="44" text-anchor="start"/>\n</svg>\n',
  },
  {
    name: "team",
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 100">\n  <g class="krs-pictogram" transform="translate(6, 4)">\n    <circle cx="6.5" cy="5.5" r="3.5" fill="{{color}}"/>\n    <path d="M0 16c0-3 2.9-5.5 6.5-5.5S13 13 13 16" fill="{{color}}"/>\n    <circle cx="14" cy="6" r="3" fill="{{color}}" opacity="0.7"/>\n    <path d="M9 17c0-2.8 2.2-5 5-5s5 2.2 5 5" fill="{{color}}" opacity="0.7"/>\n  </g>\n  <text class="krs-label" x="30" y="19" text-anchor="start"/>\n  <text class="krs-description" x="8" y="44" text-anchor="start"/>\n</svg>\n',
  },
  {
    name: "member",
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 100">\n  <g class="krs-pictogram" transform="translate(6, 4)">\n    <rect x="1" y="0" width="18" height="20" rx="2" fill="none" stroke="{{color}}" stroke-width="1.5"/>\n    <circle cx="10" cy="7" r="3" fill="{{color}}"/>\n    <path d="M5 16c0-2.5 2.2-4.5 5-4.5s5 2 5 4.5" fill="{{color}}"/>\n  </g>\n  <text class="krs-label" x="30" y="19" text-anchor="start"/>\n  <text class="krs-description" x="8" y="44" text-anchor="start"/>\n</svg>\n',
  },
  {
    name: "database",
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 100">\n  <g class="krs-pictogram" transform="translate(6, 4)">\n    <ellipse cx="10" cy="4" rx="8" ry="3" fill="{{color}}"/>\n    <path d="M2 4v12c0 1.7 3.6 3 8 3s8-1.3 8-3V4" fill="none" stroke="{{color}}" stroke-width="1.5"/>\n    <ellipse cx="10" cy="16" rx="8" ry="3" fill="none" stroke="{{color}}" stroke-width="0.5"/>\n  </g>\n  <text class="krs-label" x="30" y="19" text-anchor="start"/>\n  <text class="krs-description" x="8" y="44" text-anchor="start"/>\n</svg>\n',
  },
  {
    name: "queue-node",
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 100">\n  <g class="krs-pictogram" transform="translate(6, 4)">\n    <rect x="0" y="1" width="20" height="4" rx="1" fill="{{color}}" opacity="0.4"/>\n    <rect x="0" y="8" width="20" height="4" rx="1" fill="{{color}}" opacity="0.7"/>\n    <rect x="0" y="15" width="20" height="4" rx="1" fill="{{color}}"/>\n  </g>\n  <text class="krs-label" x="30" y="19" text-anchor="start"/>\n  <text class="krs-description" x="8" y="44" text-anchor="start"/>\n</svg>\n',
  },
  {
    name: "queue-card",
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 100">\n  <g class="krs-pictogram" transform="translate(6, 4)">\n    <!-- envelope body -->\n    <rect x="0" y="2" width="20" height="14" rx="1" fill="{{color}}" opacity="0.7"/>\n    <!-- envelope flap (filled triangle) -->\n    <path d="M0 2 L10 11 L20 2 Z" fill="{{color}}"/>\n  </g>\n  <text class="krs-label" x="30" y="19" text-anchor="start"/>\n  <text class="krs-description" x="8" y="44" text-anchor="start"/>\n</svg>\n',
  },
  {
    name: "cloud-node",
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 100">\n  <g class="krs-pictogram" transform="translate(6, 4)">\n    <path d="M16 18H5a5 5 0 0 1-.5-10A6.5 6.5 0 0 1 17 9a4 4 0 0 1-1 9z" fill="{{color}}"/>\n  </g>\n  <text class="krs-label" x="30" y="19" text-anchor="start"/>\n  <text class="krs-description" x="8" y="44" text-anchor="start"/>\n</svg>\n',
  },
  {
    name: "cloud-card",
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 100">\n  <g class="krs-pictogram" transform="translate(6, 4)">\n    <!-- document body with cut corner -->\n    <path d="M0 0 L12 0 L18 6 L18 20 L0 20 Z" fill="{{color}}" opacity="0.8"/>\n    <!-- folded corner -->\n    <path d="M12 0 L18 6 L12 6 Z" fill="{{color}}"/>\n  </g>\n  <text class="krs-label" x="30" y="19" text-anchor="start"/>\n  <text class="krs-description" x="8" y="44" text-anchor="start"/>\n</svg>\n',
  },
  {
    name: "usecase",
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 100">\n  <g class="krs-pictogram" transform="translate(6, 4)">\n    <!-- filled circle -->\n    <circle cx="10" cy="10" r="9" fill="{{color}}"/>\n    <!-- U shape in background color -->\n    <path d="M5 3 L5 10 Q5 17 10 17 Q15 17 15 10 L15 3" fill="none" stroke="{{fill}}" stroke-width="2.5" stroke-linecap="round"/>\n  </g>\n  <text class="krs-label" x="30" y="19" text-anchor="start"/>\n  <text class="krs-description" x="8" y="44" text-anchor="start"/>\n</svg>\n',
  },
  {
    name: "table",
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 100">\n  <g class="krs-pictogram" transform="translate(6, 4)">\n    <!-- header row -->\n    <rect x="0" y="0" width="20" height="5" rx="1" fill="{{color}}"/>\n    <!-- data rows -->\n    <rect x="0" y="7" width="20" height="3" rx="0.5" fill="{{color}}" opacity="0.5"/>\n    <rect x="0" y="12" width="20" height="3" rx="0.5" fill="{{color}}" opacity="0.5"/>\n    <rect x="0" y="17" width="20" height="3" rx="0.5" fill="{{color}}" opacity="0.5"/>\n    <!-- column dividers -->\n    <line x1="7" y1="0" x2="7" y2="20" stroke="{{color}}" stroke-width="0.5" opacity="0.4"/>\n    <line x1="14" y1="0" x2="14" y2="20" stroke="{{color}}" stroke-width="0.5" opacity="0.4"/>\n  </g>\n  <text class="krs-label" x="30" y="19" text-anchor="start"/>\n  <text class="krs-description" x="8" y="44" text-anchor="start"/>\n</svg>\n',
  },
  {
    name: "api",
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 100">\n  <g class="krs-pictogram" transform="translate(6, 4)">\n    <path d="M6 1L1 10l5 9h8l5-9-5-9z" fill="none" stroke="{{color}}" stroke-width="1.5"/>\n    <circle cx="10" cy="10" r="3" fill="{{color}}"/>\n  </g>\n  <text class="krs-label" x="30" y="19" text-anchor="start"/>\n  <text class="krs-description" x="8" y="44" text-anchor="start"/>\n</svg>\n',
  },
  {
    name: "oci",
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 100">\n  <g class="krs-pictogram" transform="translate(6, 4)">\n    <rect x="1" y="3" width="18" height="14" rx="2" fill="none" stroke="{{color}}" stroke-width="1.5"/>\n    <line x1="1" y1="7" x2="19" y2="7" stroke="{{color}}" stroke-width="1"/>\n    <circle cx="4" cy="5" r="1" fill="{{color}}"/>\n    <circle cx="7.5" cy="5" r="1" fill="{{color}}"/>\n  </g>\n  <text class="krs-label" x="30" y="19" text-anchor="start"/>\n  <text class="krs-description" x="8" y="44" text-anchor="start"/>\n</svg>\n',
  },
  {
    name: "lambda",
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 100">\n  <g class="krs-pictogram" transform="translate(6, 4)">\n    <path d="M4 2h3l3.5 8L14 2h3l-5.5 16h-3z" fill="{{color}}"/>\n  </g>\n  <text class="krs-label" x="30" y="19" text-anchor="start"/>\n  <text class="krs-description" x="8" y="44" text-anchor="start"/>\n</svg>\n',
  },
  {
    name: "jar",
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 100">\n  <g class="krs-pictogram" transform="translate(6, 4)">\n    <rect x="3" y="4" width="14" height="15" rx="2" fill="none" stroke="{{color}}" stroke-width="1.5"/>\n    <rect x="6" y="1" width="8" height="3" rx="1" fill="{{color}}"/>\n    <line x1="6" y1="10" x2="14" y2="10" stroke="{{color}}" stroke-width="1"/>\n  </g>\n  <text class="krs-label" x="30" y="19" text-anchor="start"/>\n  <text class="krs-description" x="8" y="44" text-anchor="start"/>\n</svg>\n',
  },
  {
    name: "war",
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 100">\n  <g class="krs-pictogram" transform="translate(6, 4)">\n    <rect x="2" y="3" width="16" height="14" rx="1.5" fill="none" stroke="{{color}}" stroke-width="1.5"/>\n    <path d="M2 7h16" stroke="{{color}}" stroke-width="1"/>\n    <path d="M7 10l3 3 3-3" fill="none" stroke="{{color}}" stroke-width="1.5"/>\n  </g>\n  <text class="krs-label" x="30" y="19" text-anchor="start"/>\n  <text class="krs-description" x="8" y="44" text-anchor="start"/>\n</svg>\n',
  },
  {
    name: "function",
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 100">\n  <g class="krs-pictogram" transform="translate(6, 4)">\n    <path d="M5 3c0-1.5 1.2-2 2.5-2S10 1.5 10 3v5h4" fill="none" stroke="{{color}}" stroke-width="1.8" stroke-linecap="round"/>\n    <path d="M4 10h8" stroke="{{color}}" stroke-width="1.8" stroke-linecap="round"/>\n    <path d="M10 10v5c0 1.5-1 3-2.5 3" fill="none" stroke="{{color}}" stroke-width="1.8" stroke-linecap="round"/>\n  </g>\n  <text class="krs-label" x="30" y="19" text-anchor="start"/>\n  <text class="krs-description" x="8" y="44" text-anchor="start"/>\n</svg>\n',
  },
  {
    name: "assets",
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 100">\n  <g class="krs-pictogram" transform="translate(6, 4)">\n    <path d="M3 1h9l5 5v12a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V3a2 2 0 0 1 2-2z" fill="none" stroke="{{color}}" stroke-width="1.5"/>\n    <path d="M12 1v5h5" fill="none" stroke="{{color}}" stroke-width="1.5"/>\n  </g>\n  <text class="krs-label" x="30" y="19" text-anchor="start"/>\n  <text class="krs-description" x="8" y="44" text-anchor="start"/>\n</svg>\n',
  },
  {
    name: "job",
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 100">\n  <g class="krs-pictogram" transform="translate(6, 4)">\n    <circle cx="10" cy="11" r="8" fill="none" stroke="{{color}}" stroke-width="1.5"/>\n    <path d="M10 5v6l4 3" fill="none" stroke="{{color}}" stroke-width="1.8" stroke-linecap="round"/>\n  </g>\n  <text class="krs-label" x="30" y="19" text-anchor="start"/>\n  <text class="krs-description" x="8" y="44" text-anchor="start"/>\n</svg>\n',
  },
  {
    name: "artifact",
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 100">\n  <g class="krs-pictogram" transform="translate(6, 4)">\n    <rect x="1" y="1" width="18" height="18" rx="2" fill="none" stroke="{{color}}" stroke-width="1.5"/>\n    <path d="M6 7h8M6 10h8M6 13h5" stroke="{{color}}" stroke-width="1.2" stroke-linecap="round"/>\n  </g>\n  <text class="krs-label" x="30" y="19" text-anchor="start"/>\n  <text class="krs-description" x="8" y="44" text-anchor="start"/>\n</svg>\n',
  },
];
