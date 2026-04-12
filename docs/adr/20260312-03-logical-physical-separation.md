# ADR-20260312-03: 論理構造と物理構造の分離

- **日付**: 2026-03-12
- **ステータス**: 決定済み

## 背景

C4 Model では Context / Container / Component / Code の4階層で表現するが、
物理的なデプロイ構造（どのWARファイルがどのサーバーで動くか）を表現する語彙がない。

## 決定

論理構造（何を・なぜ）と物理構造（どのように）を明確に分離し、別々の `.krs` ファイルで表現する。

### 論理構造のキーワード

`system` → `service` → `domain` → `usecase`

### 物理構造のキーワード

`deploy` ブロック内に `war` / `jar` / `oci` / `lambda` / `function` / `assets` / `job` / `artifact`

### 対応付け

`realizes` キーワードで物理→論理の対応を宣言する（UML Realization に対応）。

## 理由

- 「何をするシステムか」と「どう動いているか」は関心事が異なる
- 物理構造は変わりやすく、論理構造とライフサイクルが異なる
- 両者を混在させると図が複雑になる

## C4 Model との語彙の対応

| C4 Model | karasu | 変更理由 |
|----------|--------|---------|
| Context | `system` | "context" は意味が曖昧 |
| Container | `service` | ビジネス機能の単位を明示 |
| Component | `domain` | ドメイン境界を明示 |
| Code | `usecase` | 業務・操作の単位を表現 |
| （なし） | `deploy` / `realizes` | 物理構造の表現 |
