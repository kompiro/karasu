# @karasu-tools/core

The core engine behind [karasu](https://github.com/kompiro/karasu) — a text-based architecture modeling tool inspired by the C4 model but with its own vocabulary, separating logical, physical, and organizational structure. This package is the pure-TypeScript parser, style resolver, SVG renderer, and `translate` library that the karasu CLI and app are built on.

> **Stability — v0.x (no stability promise).** The `.krs` / `.krs.style` _language_ spec is committed to v1.0 (see [ADR-20260616-06](https://github.com/kompiro/karasu/blob/main/docs/adr/20260616-06-krs-spec-v1-freeze.md)), but this **TypeScript API is v0.x**: breaking changes may land in minor releases. Pin a version if you depend on it.

## Install

```sh
npm install @karasu-tools/core
```

## Usage

```ts
import { compile, buildAllViewsSvg } from "@karasu-tools/core";

const result = compile(`
system Shop {
  user Customer [human]
  service Checkout
  Customer -> Checkout "places an order"
}
`);

if (result.kind === "system") {
  console.log(result.diagnostics); // structured, language-neutral diagnostics
  const svg = buildAllViewsSvg(result); // render to SVG
}
```

`compile(source)` parses and resolves a single `.krs` document; `compileProject(...)` resolves a multi-file project through a `FileSystemProvider`. Diagnostics are returned as structured, language-neutral data — render them to text with `@karasu-tools/i18n` (`renderDiagnostic` / `renderWarning`).

## Documentation

- [`.krs` syntax reference](https://github.com/kompiro/karasu/blob/main/docs/spec/syntax.md)
- [`.krs.style` syntax reference](https://github.com/kompiro/karasu/blob/main/docs/spec/style.md)
- [Diagnostics & rules reference](https://github.com/kompiro/karasu/blob/main/docs/spec/diagnostics.md)
- [Core concepts](https://github.com/kompiro/karasu/blob/main/docs/concepts.md)

## License

[Apache-2.0](./LICENSE)
