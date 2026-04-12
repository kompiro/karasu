# ADR-20260405-01: npm パッケージスコープを @karasu-tools/* に変更

- **日付**: 2026-04-05
- **ステータス**: 決定済み
- **Issue**: #308

## 背景

npmjs.com において `@karasu` スコープは別の組織が取得済みであることが判明した。
パッケージ公開に向けて、利用可能なスコープへの移行が必要になった。

## 決定

| パッケージ | 変更前 | 変更後 |
|---|---|---|
| `packages/core` | `@karasu/core` | `@karasu-tools/core` |
| `packages/lsp` | `@karasu/lsp` | `@karasu-tools/lsp` |
| `packages/app` | `@karasu/app` | `@karasu-tools/app` |
| `packages/cli` | `@karasu/cli` | `karasu`（スコープなし） |
| `packages/vscode` | `karasu-vscode` | `karasu-vscode`（変更なし） |

## 理由

### @karasu-tools スコープの採用

- `@karasu-tools` org は npmjs.com で取得済み
- ツールの補助的な性格を表す名前として適切

### CLI をスコープなし `karasu` にした理由

- CLI はエンドユーザーが `npm install -g karasu` でインストールするもの
- スコープなしの方がコマンド名と一致しており直感的
- `karasu` パッケージ名は npmjs.com で取得済み

### VS Code 拡張を `karasu-vscode` のままにした理由

- `vsce`（VS Code Extension 公開ツール）はスコープ付きパッケージ名（`@` 始まり）を拒否する
- VS Code Marketplace の識別子は `publisher.name`（`karasu.karasu`）の組み合わせで決まるため、
  `package.json` の `name` フィールドは Marketplace 上の識別子に影響しない
- スコープなし名称を維持することで vsce との互換性を確保する

### CLI フィルターをパス指定に変更した理由

- root `package.json` の `name` が `"karasu"` であるため、`--filter karasu` は root と CLI の
  両方にマッチし曖昧になる
- `--filter ./packages/cli`（パス指定）を使用することで明示的かつ安全に CLI のみを対象にできる
- CI workflow も同様にパス指定に統一する

## 却下した案

### VS Code 拡張を @karasu-tools/vscode に変更する

`vsce` がスコープ付き名称を拒否するため採用しない。
将来的に `vsce` を使わない代替ツールに移行する場合は再検討の余地がある。

### CLI を @karasu-tools/cli にする

CLI のユーザー体験を優先してスコープなしを維持する。
