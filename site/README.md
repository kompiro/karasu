# Landing page

Static landing page for karasu, deployed to GitHub Pages by
[`.github/workflows/pages.yml`](../.github/workflows/pages.yml) on every push to
`main` that touches `site/**`.

No build step — the workflow uploads this directory as-is.

## Structure

| Path                 | Purpose                                          |
| -------------------- | ------------------------------------------------ |
| `index.html`         | Page markup                                      |
| `styles.css`         | Styles                                           |
| `assets/logo.svg`    | Brand mark (copied from `packages/app/public/`)  |
| `assets/example.svg` | Pre-rendered diagram for the "See it in action" section |
| `example/landing.krs`| Source `.krs` for `assets/example.svg`           |

## Regenerating the example diagram

`assets/example.svg` is committed as a static artifact. If `example/landing.krs`
or the renderer changes, regenerate it from the repository root:

```sh
pnpm --filter karasu run build
node packages/cli/dist/index.js render site/example/landing.krs --view system -o site/assets/example.svg
```

The `.krs` snippet shown in `index.html` is kept in sync with `example/landing.krs` by hand.
