---
id: ADR-20260624-03
title: "VS Code 拡張を changesets の版管理対象に含める"
status: accepted
date: 2026-06-24
topic: build
related_to:
  - ADR-20260512-05
  - ADR-20260619-02
scope:
  packages:
    - vscode
    - core
    - cli
  concerns:
    - ci
    - deployment
assumptions:
  - "file: .changeset/config.json"
  - "file: .github/workflows/vscode-release.yml"
  - "file: packages/vscode/package.json"
---

# ADR-20260624-03: VS Code 拡張を changesets の版管理対象に含める

- **日付**: 2026-06-24
- **ステータス**: 決定済み
- **関連**:
  - [ADR-20260512-05](20260512-05-release-automation-changesets.md): changesets 採用時に `karasu-vscode` を `ignore` に入れ、版管理を #1316 に委ねた決定（本 ADR がこの一部を見直す）
  - [ADR-20260619-02](20260619-02-npm-trusted-publishing-oidc.md): npm OIDC publish
  - Issue [#1316](https://github.com/kompiro/karasu/issues/1316): VS Code 拡張の Marketplace 配布
  - 実装 PR: [#1757](https://github.com/kompiro/karasu/pull/1757)（vscode を `ignore` から除外）/ [#1754](https://github.com/kompiro/karasu/pull/1754)（backfill + core 両名指し + i18n ignore + rule）
  - 昇格元 Design Doc: 旧 `docs/design/vscode-changeset-versioning.md`（本 ADR に集約して削除）

## 背景

`karasu-vscode`（VS Code 拡張）も「リリースされる成果物」だが、ADR-20260512-05 では changesets の `ignore` に入れ、版管理を #1316 に委ねていた。実態として version は `packages/vscode/package.json` を**手動で書き換え**て bump しており（例: #1692 で 0.1.1）、bump 忘れ・CHANGELOG 不在・変更履歴が追いにくいというリスクがあった。CLI / core と同じ changesets フローに載せ、version bump と `CHANGELOG.md` を自動化したい。

## 決定

1. **`.changeset/config.json` の `ignore` から `karasu-vscode` を外す。** `changeset version` が version bump + `packages/vscode/CHANGELOG.md` 生成を担う。independent versioning（`fixed`/`linked` なし）は維持し、拡張は CLI と独立した版・cadence のまま。
2. **npm publish は発生させない。** `karasu-vscode` は `private: true` なので `changeset publish` の対象外（自動スキップ）。`ignore` から外しても npm へ誤公開されない。
3. **Marketplace publish は手動のまま。** `vscode-release.yml` は `workflow_dispatch` を維持し、changeset が bump した version をリリース準備後に手動 publish する（拡張は独自 cadence の方針を維持）。
4. **`packages/core` の利用者向け変更は `@karasu-tools/core` と `karasu` の両方を名指す。** 下記の cascade 非対称性のため。vscode は core 経由で自動 patch bump される。
5. **`@karasu-tools/i18n` を `ignore` に追加する。** private（非公開）かつ core を実 dependency に持つため、core bump のたびに余計な patch が cascade する。公開しないパッケージなので、同じく private の `@karasu-tools/lsp` と同様 `ignore` に入れて版 churn を抑える。

## 理由

### 依存種別による cascade 非対称性（実測で確定）

`ignore` から外した状態で `@karasu-tools/core: minor` の changeset を作り `changeset version` を実行した結果:

| パッケージ | core への依存種別 | 結果 |
| --- | --- | --- |
| `@karasu-tools/core` | — | `0.1.0` → `0.2.0`（明示 bump） |
| `karasu-vscode` | `dependencies`（`workspace:*`） | `0.1.1` → **`0.1.2`（patch cascade）** |
| `karasu`（CLI） | `devDependencies`（`workspace:*`） | **bump されない**（`0.1.0` のまま） |

changesets は `dependencies` の dependent は版 bump するが、**`devDependencies` は範囲更新のみで版 bump しない**。CLI は core を devDep（esbuild バンドルのため、ADR-20260512-05）にしているので core bump が CLI に波及しない。よって運用ルールは:

| 変更箇所 | changeset で名指すパッケージ | 自動 cascade |
| --- | --- | --- |
| `packages/core`（利用者向け） | `@karasu-tools/core` **と** `karasu` の両方 | core → `karasu-vscode` に patch |
| `packages/cli` 固有 | `karasu` | なし |
| `packages/vscode` 固有 | `karasu-vscode` | なし |

従来の慣習（core 変更も `"karasu"` だけに付ける）では CLI しか released されず、拡張に core 変更が乗っても版が上がらない取りこぼしが起きる。今後は core 変更で `@karasu-tools/core` を必ず名指す。

## 却下した案

- **CHANGELOG 変更で Marketplace publish を自動発火**: `release.yml` と同様に `packages/vscode/CHANGELOG.md` の paths filter で `vscode-release.yml` を自動起動する案。Marketplace publish は重く、リリース PR マージのたびに走るのは過剰。拡張を独自 cadence で出す方針（#1316）に反するため却下し、手動 `workflow_dispatch` を維持。
- **CLI の core 依存を実 dependency 化して cascade を揃える**: ADR-20260512-05 が「CLI は core をバンドルし公開 core に依存しない」と決めており、これを覆すと公開サーフェス・typecheck 設定に波及する。スコープ外として却下。

## 影響

- `.changeset/config.json` — `ignore` から `karasu-vscode` を削除、`@karasu-tools/i18n` を追加（版管理対象は `karasu` / `@karasu-tools/core` / `karasu-vscode` の 3 つ）
- `.github/workflows/vscode-release.yml` — header コメントを「changeset 版管理 + 手動 publish」に更新
- `docs/process.md` 「リリース運用」— 対象パッケージ・名指しルール・「VS Code 拡張のリリース」節を追加
- `.claude/rules/changesets.md` — 名指しルールと cascade 非対称性を反映

## 未解決の問い

- changeset-bot 導入時、vscode-only 変更にも changeset 有無コメントが付くか（`paths` で拡張も拾えるか）— bot 導入 Issue で扱う。
