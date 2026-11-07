# ADR

karasu の設計判断の経緯 (Architecture Decision Record) を記録する。
個々の ADR は `<n>-<slug>.md` の形式で置く（`<n>` は起点の GitHub Issue 番号、無ければ PR 番号。[#2083](https://github.com/kompiro/karasu/issues/2083)）。

## 一覧の場所

ADR の状態・topic・関係の正本は各 ADR の frontmatter で、一覧はそこから生成する（[ADR-788](788-adr-knowledge-graph.md)）。
生成物は毎日の再生成 PR が更新する（[ADR-3416](3416-regenerate-adr-index-daily-pr.md)）ので、ADR を足したときにこの README へ書き足すものは無い。

- [effective.md](effective.md): 現役の ADR（`status: accepted` で `superseded_by` が無いもの）を topic 別に並べる
- [graph.md](graph.md): topic をまたぐ依存図。topic ごとの図は `graph/<topic>.md`

現役でない ADR は frontmatter の `status:` で探す。

```sh
grep -l '^status: not_adopted' docs/adr/*.md   # 意識的に「採用しない」と結論づけたもの
grep -l '^status: superseded' docs/adr/*.md    # 後継に置き換えられたもの（後継は superseded_by）
```

採用しなかった ADR は、同じ議論が再燃したときに過去の検討経緯を辿れるように残している。
判断の経緯を辿る際は、まず該当するトピックを探し、関連する複数の ADR を時系列で読むと意図が掴みやすい。

---

## トピック別

各見出しは frontmatter の `topic:` に書く語彙で、正本は `adr.config.json` の `topics` である。
どの topic に入れるかは見出しの説明で判断する。

### コア概念 — 論理・物理・組織の三面構造

> Derives from (`core-concepts`): [concepts.md → Three-dimensional structure](../concepts.md#three-dimensional-structure)

現役の ADR: [effective.md#core-concepts](effective.md#core-concepts)、依存図: [graph/core-concepts.md](graph/core-concepts.md)

karasu が何を表現するか、その根幹の設計判断。

### パーサー / 構文 / AST / フォーマッター

> Derives from (`parser`): [concepts.md → Three-dimensional structure](../concepts.md#three-dimensional-structure)

現役の ADR: [effective.md#parser](effective.md#parser)、依存図: [graph/parser.md](graph/parser.md)

`.krs` テキストから AST を構築し、コメントを保ったまま書き換えるまでの層。

### リゾルバ / 警告 / 検証

> Derives from (`resolver`): [concepts.md → Domain dispersal detection](../concepts.md#domain-dispersal-detection)

現役の ADR: [effective.md#resolver](effective.md#resolver)、依存図: [graph/resolver.md](graph/resolver.md)

AST を意味論レベルで解釈し、モデルの健全性を検査する層。

### レンダラー / レイアウト / SVG / アイコン

> Derives from (`renderer`): [concepts.md → Drill-down as the way to understand architecture](../concepts.md#drill-down)

現役の ADR: [effective.md#renderer](effective.md#renderer)、依存図: [graph/renderer.md](graph/renderer.md)

モデルから SVG を生成する層。レイアウトエンジン、アイコン表現、エクスポート戦略を含む。

### エッジ

> Derives from (`edges`): [concepts.md → Edges](../concepts.md#edges)

現役の ADR: [effective.md#edges](effective.md#edges)、依存図: [graph/edges.md](graph/edges.md)

ノード間の関係を表現するエッジの意味論・視覚表現・自動推論。

### スタイリング / タグ / アノテーション

> Derives from (`styling`): [concepts.md → What karasu visualizes vs. what it doesn't prescribe](../concepts.md#visualizes-vs-prescribes)

現役の ADR: [effective.md#styling](effective.md#styling)、依存図: [graph/styling.md](graph/styling.md)

`.krs.style` とビルトインスタイル、タグ / アノテーションの伝播ルール。

### ドリルダウン / ナビゲーション

> Derives from (`navigation`): [concepts.md → Drill-down as the way to understand architecture](../concepts.md#drill-down)

現役の ADR: [effective.md#navigation](effective.md#navigation)、依存図: [graph/navigation.md](graph/navigation.md)

URL hash・ブラウザ履歴・マルチファイル間のナビゲーションと、ハイライト復元の仕組み。

### App UI — Editor / Toolbar / Panels

> Derives from (`app-ui`): N/A — implementation topic, no originating concept section

現役の ADR: [effective.md#app-ui](effective.md#app-ui)、依存図: [graph/app-ui.md](graph/app-ui.md)

`packages/app` のレイアウト、ツールバー、Editor 診断、パネル配置に関する判断。

### プロジェクト / マルチファイル / Import-Export

> Derives from (`project`): [concepts.md → Three-dimensional structure](../concepts.md#three-dimensional-structure)

現役の ADR: [effective.md#project](effective.md#project)、依存図: [graph/project.md](graph/project.md)

ファイルシステム抽象、OPFS、プロジェクトの ZIP Import/Export。

### Chat / AI

> Derives from (`chat-ai`): [concepts.md → karasu and AI](../concepts.md#karasu-and-ai)

現役の ADR: [effective.md#chat-ai](effective.md#chat-ai)、依存図: [graph/chat-ai.md](graph/chat-ai.md)

Chat パネル、BYOK、構造化インタビュー、AI アシスト機能の設計。

### CLI

> Derives from (`cli`): N/A — implementation topic, no originating concept section

現役の ADR: [effective.md#cli](effective.md#cli)、依存図: [graph/cli.md](graph/cli.md)

`karasu` CLI のサブコマンド設計。

### VS Code / LSP

> Derives from (`vscode`): N/A — implementation topic, no originating concept section

現役の ADR: [effective.md#vscode](effective.md#vscode)、依存図: [graph/vscode.md](graph/vscode.md)

VS Code 拡張と LSP の段階的実装。

### テスト戦略

> Derives from (`testing`): N/A — process topic, no originating concept section

現役の ADR: [effective.md#testing](effective.md#testing)、依存図: [graph/testing.md](graph/testing.md)

### ビルド / CI / インフラ / 依存関係

> Derives from (`build`): N/A — infrastructure topic, no originating concept section

現役の ADR: [effective.md#build](effective.md#build)、依存図: [graph/build.md](graph/build.md)

モノレポ構成、依存更新、デプロイ、CI ワークフローに関する判断。

### ADR 運用・ツール — `adr-tooling`

> Derives from (`adr-tooling`): N/A — tooling topic, no originating concept section

現役の ADR: [effective.md#adr-tooling](effective.md#adr-tooling)、依存図: [graph/adr-tooling.md](graph/adr-tooling.md)

ADR 自体のスキーマ、フロントマター、バリデータ、extractor など、ADR を支える
ツール層に関する判断。将来的には karasu 本体から独立したツールとして切り出す
可能性があるため、コア機能トピックとは別枠で管理する。
