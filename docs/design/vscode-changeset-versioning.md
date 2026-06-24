# VS Code 拡張を changesets の版管理対象に含める

- **日付**: 2026-06-24
- **ステータス**: 決定済み（ADR 昇格予定 — [ADR-20260512-05](../adr/20260512-05-release-automation-changesets.md) を refine）
- **関連**:
  - [ADR-20260512-05](../adr/20260512-05-release-automation-changesets.md): changesets 採用時に `karasu-vscode` を `ignore` に入れ、版管理を #1316 に委ねた決定（本 Doc がこの一部を見直す）
  - [ADR-20260619-02](../adr/20260619-02-npm-trusted-publishing-oidc.md): npm OIDC publish
  - Issue #1316: VS Code 拡張の Marketplace 配布
  - `.github/workflows/vscode-release.yml`, `.changeset/config.json`

## 背景・課題

`karasu-vscode` も「リリースされる成果物」だが、現状は changesets の `ignore` に入っており版管理されていない。version は `packages/vscode/package.json` を**手動で書き換え**て bump している（例: #1692 で 0.1.1）。これは:

- bump 忘れ・CHANGELOG 不在のリスクがある（CLI と同じく機械化したい）
- 「何が変わったか」の記録が PR を辿らないと分からない

CLI / core と同じ changesets フローに載せ、version bump と `CHANGELOG.md` を自動化したい。

## 決定

1. **`.changeset/config.json` の `ignore` から `karasu-vscode` を外す。** `changeset version` が version bump + `packages/vscode/CHANGELOG.md` 生成を担う。independent versioning（`fixed`/`linked` なし）は維持 — vscode は CLI と独立した版・cadence のまま。
2. **npm publish は発生しない。** `karasu-vscode` は `private: true` なので `changeset publish` は対象外（自動スキップ）。`ignore` から外しても npm へ誤公開されない。
3. **Marketplace publish は手動のまま。** `vscode-release.yml` は `workflow_dispatch` を維持。changeset が bump した version を、リリース準備後に手動で publish する（拡張は独自 cadence で出す方針を維持）。
4. **core 変更は `@karasu-tools/core` + `karasu` の両方を名指しする運用にする。** 下記の cascade 非対称性のため。vscode は core 経由で自動 patch bump される。

## 検証で確定した cascade 挙動（実測）

`ignore` から外した状態で `@karasu-tools/core: minor` の changeset を作り `changeset version` を実行:

| パッケージ | core への依存種別 | 結果 |
| --- | --- | --- |
| `@karasu-tools/core` | — | `0.1.0` → `0.2.0`（明示 bump） |
| `karasu-vscode` | `dependencies`（`workspace:*`） | `0.1.1` → **`0.1.2`（patch cascade）** |
| `karasu`（CLI） | `devDependencies`（`workspace:*`） | **bump されない**（`0.1.0` のまま） |

→ changesets は `dependencies` の dependent は版 bump するが、**`devDependencies` は範囲更新のみで版 bump しない**。CLI は core を devDep（esbuild バンドルのため、ADR-20260512-05）にしているので core bump が CLI に波及しない。

### 運用ルールへの帰結

| 変更箇所 | changeset で名指すパッケージ | 自動 cascade |
| --- | --- | --- |
| core（CLI も拡張も使う利用者向け変更） | `karasu` **と** `@karasu-tools/core` の両方 | core → `karasu-vscode` に patch |
| 拡張固有（`packages/vscode`） | `karasu-vscode` | なし |
| CLI 固有（`packages/cli`） | `karasu` | なし |

> 従来の慣習（core 変更も `"karasu"` だけに付ける）は CLI しか released されず、拡張に core 変更が乗っても版が上がらない取りこぼしが起きる。今後は core 変更で `@karasu-tools/core` を必ず名指す。

## 却下した代替案

- **CHANGELOG 変更で Marketplace publish を自動発火**: `release.yml` と同様に `packages/vscode/CHANGELOG.md` の paths filter で `vscode-release.yml` を自動起動する案。Marketplace publish は重く、リリース PR マージのたびに走るのは過剰。拡張は独自 cadence の方針（#1316）に反するため却下。手動 `workflow_dispatch` を維持。
- **CLI の core 依存を実 dependency 化して cascade を揃える**: ADR-20260512-05 が「CLI は core をバンドルし公開 core に依存しない」と決めており、これを覆すと公開サーフェス・typecheck 設定に波及する。スコープ外として却下。

## 影響範囲

- `.changeset/config.json` — `ignore` から `karasu-vscode` 削除
- `docs/process.md` 「リリース運用」— 対象パッケージ・変更ルール・拡張のリリース手順を更新
- `.github/workflows/vscode-release.yml` — header コメントを「changeset 版管理 + 手動 publish」に更新
- `.claude/rules/changesets.md` — vscode と core 両名指しルールを追記

## 未解決の問い

- changeset-bot 導入時、vscode-only 変更にも changeset 有無コメントが付くか（`paths` で拡張も拾えるか）— bot 導入 Issue で扱う。
