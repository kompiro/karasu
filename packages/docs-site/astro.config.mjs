// @ts-check
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig, passthroughImageService } from "astro/config";
import starlight from "@astrojs/starlight";

// Reuse the VS Code TextMate grammars for `krs` / `krs.style` fence highlighting
// (Shiki). The grammars are named "karasu"/"karasu style"; re-key them to the
// fence languages used in docs/ (```krs and ```krs.style).
function loadGrammar(relPath, name, aliases) {
  const grammar = JSON.parse(
    fs.readFileSync(fileURLToPath(new URL(relPath, import.meta.url)), "utf8"),
  );
  return { ...grammar, name, aliases };
}

const krs = loadGrammar("../vscode/syntaxes/krs.tmLanguage.json", "krs", ["karasu"]);
const krsStyle = loadGrammar("../vscode/syntaxes/krs-style.tmLanguage.json", "krs.style", [
  "krs-style",
  "karasu-style",
]);

// GitHub Pages project site: https://kompiro.github.io/karasu/
export default defineConfig({
  site: "https://kompiro.github.io",
  base: "/karasu/",
  // The docs site processes no images at build time; passthrough avoids the
  // optional `sharp` native dependency (its build script is not approved here).
  image: { service: passthroughImageService() },
  integrations: [
    starlight({
      title: "karasu",
      // The 鴉 brand mark, kept alongside the "karasu" title text.
      logo: { src: "./src/assets/logo.svg", alt: "karasu" },
      favicon: "/favicon.svg",
      defaultLocale: "root",
      locales: {
        root: { label: "English", lang: "en" },
        ja: { label: "日本語", lang: "ja" },
      },
      social: [{ icon: "github", label: "GitHub", href: "https://github.com/kompiro/karasu" }],
      expressiveCode: {
        shiki: { langs: [krs, krsStyle] },
      },
      sidebar: [
        { label: "Guides", items: [{ autogenerate: { directory: "guide" } }] },
        { label: "Reference", items: [{ autogenerate: { directory: "spec" } }] },
        { label: "Concepts", link: "/concepts/" },
        {
          label: "Examples",
          items: [
            { label: "Overview", link: "/examples/" },
            { autogenerate: { directory: "examples" } },
          ],
        },
      ],
    }),
  ],
});
