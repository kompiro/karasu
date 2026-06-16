// Single source of truth for which examples/ projects can be opened in the app
// from the docs gallery (#1646). Shared by the app (to validate `?example=` and
// fetch the files from the fixed karasu raw origin) and by docs-site (to render
// each gallery page's "Open in the app" button). Listing an example here is what
// makes it openable — there is no arbitrary-URL path.

export type ExampleLang = "en" | "ja";

export interface OpenableExample {
  /** URL slug, matching examples/<lang>/<slug>/ and the gallery page slug. */
  slug: string;
  /** Languages available under examples/<lang>/<slug>/. */
  langs: readonly ExampleLang[];
  /** Entry `.krs` filename within the example dir; imports are followed from it. */
  entry: string;
}

export const OPENABLE_EXAMPLES: readonly OpenableExample[] = [
  { slug: "getting-started", langs: ["en", "ja"], entry: "index.krs" },
  { slug: "payment-platform", langs: ["en", "ja"], entry: "system.krs" },
  { slug: "org", langs: ["en", "ja"], entry: "system.krs" },
  { slug: "hr-tool", langs: ["en", "ja"], entry: "system.krs" },
  { slug: "deploy", langs: ["en", "ja"], entry: "system.krs" },
  { slug: "migration", langs: ["en", "ja"], entry: "system.krs" },
  { slug: "org-only", langs: ["en", "ja"], entry: "index.krs" },
  { slug: "deploy-only", langs: ["en", "ja"], entry: "index.krs" },
  { slug: "multi-file-system", langs: ["en", "ja"], entry: "editor.krs" },
  { slug: "deploy-org", langs: ["en", "ja"], entry: "index.krs" },
  // English-authored, no Japanese counterpart (examples/en/ only).
  { slug: "client-mcp", langs: ["en"], entry: "index.krs" },
];

/** A slug must be a bare kebab token — never a path, so it can't escape the template. */
const SLUG_RE = /^[a-z0-9-]+$/;

/**
 * Resolve an `(slug, lang)` request to its manifest entry, or `undefined` if the
 * slug is malformed, unknown, or unavailable in that language. Callers MUST treat
 * `undefined` as "do not fetch".
 */
export function findOpenableExample(slug: string, lang: string): OpenableExample | undefined {
  if (!SLUG_RE.test(slug)) return undefined;
  if (lang !== "en" && lang !== "ja") return undefined;
  const example = OPENABLE_EXAMPLES.find((e) => e.slug === slug);
  if (!example || !example.langs.includes(lang)) return undefined;
  return example;
}
