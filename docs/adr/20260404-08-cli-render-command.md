---
id: ADR-20260404-08
title: "CLI `karasu render` コマンド"
status: accepted
date: 2026-04-04
topic: cli
depends_on:
  - ADR-20260401-02
scope:
  packages:
    - cli
  domains:
    - cli
    - export
---

# ADR-20260404-08: CLI `karasu render` コマンド

- **日付**: 2026-04-04
- **ステータス**: 決定済み
- **関連**: Issue #121, Issue #122, [ADR-20260401-02](20260401-02-all-diagrams-bundled-svg.md)

## 背景

karasu はブラウザ上でのインタラクティブ編集・プレビューを提供していたが、CI/CD パイプラインでの自動図生成やブラウザ不要のローカルワークフローには対応していなかった。以下のニーズがあった：

- `.krs` の変更をトリガーに GitHub Actions で SVG を自動生成・コミットしたい
- ドキュメントリポジトリの `docs/` に最新のアーキテクチャ図を継続的に反映したい
- ブラウザを開かずにコマンドラインで図を確認・加工したい

`karasu serve` がリアルタイムプレビュー（ブラウザ表示）を担うのに対し、`karasu render` は **SVG ファイルの生成** を担うコマンドとして位置づける。

## 決定

### 1. コマンド仕様

```
karasu render <file> [options]

Options:
  -o, --output <path>   Write SVG to file (default: stdout)
  --view <type>         Diagram view to render: system | deploy | org
                        (default: all views bundled with CSS tab navigation)
```

- `--view` 未指定時は `buildAllViewsSvgProject()`（全ビューバンドル、ADR-20260401-02）
- `--view system|deploy|org` 指定時は `compileProject()`

### 2. `buildAllViewsSvgProject` を `core` に追加

`compileProject` と同じパターンで `index.ts` に追加する：

```typescript
export async function buildAllViewsSvgProject(
  entryPath: string,
  fs: FileSystemProvider,
  styleSource?: string,
  displayMode?: DisplayMode,
): Promise<SvgResult>
```

内部で `ImportResolver.resolve(entryPath)` → `_buildAllViewsSvg(krsFile, ...)` を呼ぶ。

### 3. `NodeFileSystemProvider`

`packages/cli/src/render.ts` に `FileSystemProvider` インターフェースを Node.js `fs/promises` で満たす実装を置く。`watch` は `render` コマンドでは使わないため throw とする。

### 4. stdout 出力 + Unix パイプ統合

`--output` を省略すると SVG を stdout に出力し、`svgo` / `base64` / `inkscape` 等と pipe で連結できる。ヘルプの Examples セクションに主要パターンを明示する：

```
$ karasu render index.krs > docs/arch.svg
$ karasu render index.krs | svgo - -o docs/arch.svg
$ karasu render index.krs --view deploy --output deploy.svg
```

### 5. エラーハンドリング

| 状況 | stderr | exit code |
|---|---|---|
| ファイル未存在 | `Error: File not found: <path>` | 1 |
| parse error（diagnostics あり） | `Error: <file>:<line>:<col>: <message>` | 1 |
| warnings のみ | `Warning: <message>` | 0 |
| 正常 | なし | 0 |

diagnostics と warnings は stderr、SVG 本体は stdout に出力する。これにより pipe でも warnings を確認しながら SVG を通過させられる。

## 理由

- **`compileProject` との対称性**: `buildAllViewsSvgProject` を `core` に置くことで、API として一貫性があり CLI 側が import 解決の詳細を知る必要がない。将来 app / VSCode 拡張からも再利用できる
- **stdout デフォルト + パイプ親和性**: Unix の慣例に従い、stdout と pipe の組み合わせで `svgo` 等の既存ツールと連携できる
- **stderr への分離**: warnings / errors を stderr に出すことで、pipe の stdout は純粋な SVG だけになり後続ツールが壊れない
- **`NodeFileSystemProvider` の `watch` を throw**: `render` は単発実行なので `watch` は不要。throw にすることで誤用を防ぐ

## 却下した案

### 案B: CLI 側で `ImportResolver` を直接呼ぶ

`core` の内部 API（`_buildAllViewsSvg`）を CLI が直接参照することになり、パッケージ境界が崩れる。`_buildAllViewsSvg` は現在 export されておらず、追加も必要。

## 残課題

- warnings が多数出る場合の出力制御（`--quiet` フラグは将来課題）
