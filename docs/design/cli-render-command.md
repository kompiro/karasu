# CLI render コマンド

- **日付**: 2026-04-04
- **ステータス**: 検討中
- **関連**:
  - [CLI serve モード](cli-serve-mode.md)
  - [全ビュー統合バンドル SVG](all-diagrams-bundled-svg.md)
  - [Issue #121: CLI render command](https://github.com/kompiro/karasu/issues/121)
  - [Issue #122: GitHub Actions workflow template](https://github.com/kompiro/karasu/issues/122)

## 背景・課題

現状の karasu はブラウザ上でのインタラクティブな編集・プレビューを提供するが、
CI/CD パイプラインでの自動図生成やブラウザ不要のローカルワークフローには対応していない。

具体的なニーズ:

- `.krs` ファイルの変更をトリガーに GitHub Actions で SVG を自動生成・コミットしたい
- ドキュメントリポジトリの `docs/` に最新のアーキテクチャ図を継続的に反映したい
- ブラウザを開かずにコマンドラインで図を確認・加工したい

`karasu serve` がリアルタイムプレビュー（ブラウザ表示）を担うのに対し、
`karasu render` は**SVG ファイルの生成**を担うコマンドとして位置づける。

## 制約・前提

- `packages/core` は Pure TypeScript で環境依存なし。CLI から直接利用できる
- `buildAllViewsSvg`（#241 で実装済み）は `krsSource: string` を受け取るため、import 解決には対応していない
- `@import` を含むプロジェクトは `ImportResolver` 経由で解決する必要がある（`compileProject` と同パターン）
- `FileSystemProvider` インターフェースを実装した `NodeFileSystemProvider` を CLI 側で用意する

## コマンド仕様

```
karasu render <file> [options]

Arguments:
  file                  Entry .krs file to render

Options:
  -o, --output <path>   Write SVG to file (default: stdout)
  --view <type>         Diagram view to render: system | deploy | org
                        (default: all views bundled with CSS tab navigation)
  -h, --help            Display help for command

Examples:
  # Pipe to stdout and redirect to file
  $ karasu render index.krs > docs/arch.svg

  # Optimize with svgo via pipe (no temp file needed)
  $ karasu render index.krs | svgo - -o docs/arch.svg

  # Write directly to file
  $ karasu render index.krs --output docs/arch.svg

  # Render a specific view
  $ karasu render index.krs --view deploy --output deploy.svg
  $ karasu render index.krs --view org --output org.svg
```

### stdout 出力について

`--output` を省略すると SVG を stdout に出力する。これにより Unix パイプラインとの統合が可能になる。

主なユースケース:

| コマンド例 | 用途 |
|---|---|
| `karasu render index.krs \| svgo - -o docs/arch.svg` | svgo で最適化して保存 |
| `karasu render index.krs \| base64` | HTML の `<img src="data:image/svg+xml;base64,...">` 用に encode |
| `karasu render index.krs \| inkscape --pipe --export-png=arch.png` | PNG に変換 |
| `$(karasu render index.krs --view system)` | シェルスクリプト内で変数に代入 |

stdout への出力はヘルプの Examples セクションに明示し、利用意図を伝える。

## 設計

### デフォルト出力: buildAllViewsSvgProject

`--view` 未指定時は `buildAllViewsSvgProject(entryPath, fs)` を呼び出す。
この関数は `packages/core` に新規追加し、`compileProject` パターンに倣って実装する。

```
karasu render index.krs
  └─ NodeFileSystemProvider（Node.js fs ラッパー）
  └─ ImportResolver.resolve(entryPath) → ResolvedProject
  └─ buildAllViewsSvg(resolved.krsFile, styleSource, displayMode)  ← 内部版（KrsFile受け取り）
  └─ SVG 出力
```

#### core への追加: buildAllViewsSvgProject

`buildAllViewsSvg` の内部実装（`KrsFile` を受け取るバージョン）はすでに `drill-down-svg.ts` に存在する。
`index.ts` にプロジェクト解決版のラッパーを追加する。

```typescript
// packages/core/src/index.ts
export async function buildAllViewsSvgProject(
  entryPath: string,
  fs: FileSystemProvider,
  styleSource?: string,
  displayMode?: DisplayMode,
): Promise<SvgResult> {
  const resolver = new ImportResolver(fs);
  const resolved = await resolver.resolve(entryPath);
  const result = _buildAllViewsSvg(resolved.krsFile, styleSource, displayMode);
  return {
    svg: result.svg,
    diagnostics: [...resolved.diagnostics, ...result.diagnostics],
  };
}
```

### --view 指定時: compileProject

`--view system|deploy|org` 指定時は既存の `compileProject` を使用する。

```
karasu render index.krs --view deploy
  └─ NodeFileSystemProvider
  └─ compileProject(entryPath, fs, { diagramType: "deploy" })
  └─ result.svg 出力
```

### NodeFileSystemProvider

`packages/cli/src/render.ts` 内に実装する。`FileSystemProvider` インターフェースを Node.js の `fs/promises` で満たす。

```typescript
import { readFile, readdir, stat } from "node:fs/promises";
import type { FileSystemProvider, DirEntry } from "@karasu/core";

class NodeFileSystemProvider implements FileSystemProvider {
  async readFile(path: string): Promise<string> {
    return readFile(path, "utf-8");
  }

  async readdir(path: string): Promise<DirEntry[]> {
    const entries = await readdir(path, { withFileTypes: true });
    return entries.map((e) => ({
      name: e.name,
      isDirectory: e.isDirectory(),
    }));
  }

  // watch 不要（render は単発実行）
  watch(): never {
    throw new Error("watch not supported in render mode");
  }
}
```

### エラーハンドリング

| 状況 | stderr 出力 | exit code |
|---|---|---|
| ファイル未存在 | `Error: File not found: <path>` | 1 |
| parse error（diagnostics あり） | `Error: <file>:<line>:<col>: <message>` x N 件 | 1 |
| warnings のみ | `Warning: <message>` x N 件 | 0 |
| 正常 | (なし) | 0 |

diagnostics と warnings は stderr に出力し、SVG 本体は stdout（または `--output` ファイル）に出力する。
これにより `karasu render ... | svgo ...` のようなパイプでも warnings を確認しながら SVG を通過させられる。

## 検討した選択肢

### 案A: buildAllViewsSvgProject を core に追加（本案）

`compileProject` と同じパターンで `buildAllViewsSvgProject` を core に追加する。

**メリット**:
- `compileProject` と対称的な API で一貫性がある
- CLI 側が import 解決の詳細を知る必要がない
- 将来 app 側や vscode 拡張からも再利用しやすい

**デメリット**:
- core に関数を1つ追加する必要がある（小さなコスト）

### 案B: CLI 側で ImportResolver を直接呼び、内部版 buildAllViewsSvg に渡す

CLI が `ImportResolver` → `KrsFile` を取得し、`buildAllViewsSvg(krsFile, ...)` の内部版を呼ぶ。

**メリット**:
- core を変更しなくて済む

**デメリット**:
- core の内部 API（`_buildAllViewsSvg`）を CLI が直接参照することになり、境界が崩れる
- `_buildAllViewsSvg` は現在 export されておらず、追加が必要

### 採用: 案A

`compileProject` との対称性と、core が公開 API として責務を持つべきという観点から案Aを採用する。

## 現時点の方針

以下の順で実装する:

1. `packages/core/src/index.ts` に `buildAllViewsSvgProject` を追加
2. `packages/cli/src/render.ts` に `NodeFileSystemProvider` と render ロジックを実装
3. `packages/cli/src/index.ts` に `render` コマンドを登録（Examples セクション付き）
4. `packages/cli/package.json` に `@karasu/core` 依存を追加
5. テストと acceptance test を追加

## 未解決の問い

- `watch` メソッドが `FileSystemProvider` インターフェースに含まれる場合、`render` 用の `NodeFileSystemProvider` でどう扱うか（throw vs no-op vs optional）→ インターフェース定義を確認して判断する
- warnings が多数出る場合の出力制御（`--quiet` フラグは将来課題）
