---
id: ADR-20260419-02
title: "`KarasuPreviewColumn` を `PreviewColumn` にリネーム"
status: accepted
date: 2026-04-19
topic: app-ui
related_to:
  - ADR-20260326-02
  - ADR-20260329-02
  - ADR-20260405-04
scope:
  packages:
    - app
  domains:
    - ui
    - refactor
---

# ADR-20260419-02: `KarasuPreviewColumn` を `PreviewColumn` にリネーム

- **日付**: 2026-04-19
- **ステータス**: 決定済み
- **関連**:
  - Issue #706, PR #707
  - 名前の出自: [ADR-20260326-02](20260326-02-memory-project-mode-unification.md)
  - 関連 ADR: [ADR-20260329-02](20260329-02-preview-column-svg-export-refactor.md) / [ADR-20260405-04](20260405-04-reference-panel-diagram-context.md) / [ADR-20260409-08](20260409-08-chat-ui-panel.md)

## 背景

`KarasuPreviewColumn` は `packages/app/src/components/` に置かれたコンポーネントのうち、唯一 `Karasu` プレフィックスを持っていた。ADR-20260326-02 で MemoryMode と ProjectMode を統一する際、「アプリケーション全体のプレビュー列」という位置付けを強調する意図で `Karasu` を付けたが、実際には:

- 同ディレクトリの他のコンポーネント（`AppShell` / `EditArea` / `PreviewPane` / `FileTree` など）はすべて無印
- パッケージ自体が `@karasu-tools/app` にスコープされているため、コンポーネント名に再度 `Karasu` を冠する意味は薄い
- 読み手からは「なぜこれだけ？」という違和感が残る命名

となっていた。

## 決定

以下の 3 ファイルをリネームする:

- `packages/app/src/components/KarasuPreviewColumn.tsx` → `PreviewColumn.tsx`
- `packages/app/src/components/KarasuPreviewColumn.test.tsx` → `PreviewColumn.test.tsx`
- `packages/app/src/components/AppShell.tsx` 内の import / JSX 参照を更新

同時に、エクスポートされる React コンポーネントおよび内部の `KarasuPreviewColumnProps` インターフェースもリネームする。振る舞いの変更はない — 名前のみの変更。

## 理由

- **命名の一貫性**: `components/` 配下が統一的に無印になる。
- **冗長性の排除**: パッケージ名 `@karasu-tools/app` がすでに `karasu` を含んでおり、個別コンポーネントに再度付ける必要がない。
- **可読性**: `AppShell` → `PreviewColumn` / `EditArea` と並んだときに視覚的ノイズが減る。

## 却下した案

### 案A: すべてのコンポーネントに `Karasu` プレフィックスを付ける

ブランド一貫性はあるが、package scope で既に表現されているため冗長。既存 10 数個のコンポーネントすべてのリネームが必要で、割に合わない。

### 案B: 現状維持

違和感を放置することになる。1 箇所だけ異なる命名は後続のコード読み手にも「なぜ？」を強いる。

## 既存ドキュメントの扱い

旧名 `KarasuPreviewColumn` は以下の ADR / acceptance doc / design doc に登場するが、これらは**当時の実装と決定の記録**であり本文は変更しない:

- ADR: `20260326-02` / `20260329-02` / `20260404-10` / `20260405-04` / `20260409-08`
- Acceptance: `0014-memory-project-mode-unification.md` / `0040-panel-focus-mode.md`
- Design: `docs/design/implicit-edge-detail-panel.md`

現行コードの名前を追跡したい場合は、本 ADR または PR #707 を起点とする。

## 影響範囲

- 振る舞いの変更なし — 435 件の既存 app テストがそのまま pass
- 外部 API 変更なし — パッケージは `@karasu-tools/app` として単一のアプリケーションビルドでのみ使われており、再エクスポートされていない
- アクセプタンステストは不要（ユーザ可視の変更がないため）
