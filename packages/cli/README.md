# karasu

Command-line interface for [karasu](https://github.com/kompiro/karasu) — a text-based architecture modeling tool. Inspired by the C4 model but with its own vocabulary, separating logical, physical, and organizational structure.

## Install

```sh
npm install -g karasu
# or run without installing
npx karasu --help
```

## Usage

```sh
# Serve a directory of .krs files with live preview
karasu serve ./docs/architecture

# Render a .krs file to SVG or draw.io (mxGraph XML)
karasu render system.krs > system.svg
karasu render system.krs --format drawio > system.drawio

# Translate an infra config or API spec into a .krs scaffold
karasu translate k8s-deployment.yaml

# Apply / append / insert / remove nodes in a .krs file (stdin-driven editing)
cat fragment.krs | karasu apply system.krs

# Format, lint styles, diff, or build a coverage matrix
karasu fmt system.krs
karasu lint-style system.krs.style
```

Run `karasu --help` for the full command list and options.

## Documentation

- [`.krs` syntax reference](https://github.com/kompiro/karasu/blob/main/docs/spec/syntax.md)
- [`.krs.style` syntax reference](https://github.com/kompiro/karasu/blob/main/docs/spec/style.md)
- [Core concepts](https://github.com/kompiro/karasu/blob/main/docs/concepts.md)

## License

[Apache-2.0](./LICENSE)
