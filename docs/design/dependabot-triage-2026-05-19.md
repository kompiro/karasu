# Dependabot 更新トリアージ 2026-05-19

- **日付**: 2026-05-19
- **ステータス**: 検討中
- **関連**:
  - 引き金 PR: [#1427](https://github.com/kompiro/karasu/pull/1427), [#1426](https://github.com/kompiro/karasu/pull/1426)
  - 関連 ADR: 採否確定後に本 Design Doc を昇格

## 背景・課題

Dependabot が GitHub Actions の更新 PR を 2 件オープンした。サプライチェーン攻撃の
リスクを踏まえ、bump 種別を問わず全 PR を upstream まで遡ってリスク分析し、採否の
判断材料を整理する。

## 現状（インベントリ）

| PR | 依存 | bump | エコシステム | direct/transitive | CI |
| --- | --- | --- | --- | --- | --- |
| [#1427](https://github.com/kompiro/karasu/pull/1427) | `cloudflare/wrangler-action` 3.15.0 → 4.0.0 | major | github_actions | direct | pass（deploy 系は skipping） |
| [#1426](https://github.com/kompiro/karasu/pull/1426) | `pnpm/action-setup` 6.0.5 → 6.0.8 | patch | github_actions | direct | pass |

リポジトリ内の利用箇所:

- `wrangler-action`: `.github/workflows/deploy.yml`, `preview.yml`（各 1 箇所、SHA ピン留め）
- `action-setup`: 13 ワークフローで利用（全箇所 SHA ピン留め `8912a91…` = v6.0.5）

両 PR とも commit SHA ピン + バージョンコメントの形式を維持している。

## 制約・前提

- karasu は GitHub Actions を SHA ピンで参照する方針。更新後も SHA ピンが維持されること。
- 公開からの経過時間: 両リリースとも 2026-05-12 公開。本トリアージ時点（2026-05-19）で
  7 日経過しており、サプライチェーン cooldown（全 semver レベル 7 日）を満たす。
- out of scope: ワークフロー自体のリファクタリングや wrangler バージョンの明示ピン追加。

## PR ごとのリスク分析

### #1427 cloudflare/wrangler-action 3.15.0 → 4.0.0（major）

- **リリースノート / CHANGELOG**: v4.0.0 の major change は 1 点のみ — デフォルト
  Wrangler バージョンを v4（`latest`）へ更新。`wranglerVersion` を明示すれば v3 に
  ピン留め可能。3.15.x までの差分は Node 24 ランタイム移行・`secret bulk` 移行・
  npm audit 修正など。
- **コード差分**: `v3.15.0...v4.0.0` の compare を確認。変更は `src/`・`dist/index.mjs`・
  テスト fixtures・CHANGELOG・CI ワークフロー。新規 postinstall / prepare 等の
  lifecycle スクリプト追加なし。
- **メンテナ・所有権**: `cloudflare` org 配下。配布主体の変化なし。コミットは
  changeset-release 自動コミットと既知コントリビュータによるもの。
- **SHA 整合性**: PR ピン `ebbaa158…` は upstream タグ `v4.0.0` と一致。
- **既知 advisory**: 該当なし。
- **影響評価**: karasu の `deploy.yml` / `preview.yml` は `wranglerVersion` を指定して
  おらず、更新後は wrangler v4 が使われる。利用コマンドは `pages deploy` のみで、
  v4 でも継続サポートされている。Cloudflare Pages デプロイは保護ブランチ環境で実行
  されるため CI（PR）では `skipping`。

**リスクレベル: low**（major だが変更は default wrangler バージョンのみ。供給主体・
コードに不審点なし）。**推奨アクション: マージ推奨**。
ただし、デプロイで wrangler v3 に固定したい場合は別途 `wranglerVersion: "3"` を
追加する選択肢がある（本トリアージでは out of scope）。

### #1426 pnpm/action-setup 6.0.5 → 6.0.8（patch）

- **リリースノート / CHANGELOG**: 6.0.6〜6.0.8 はいずれも fix。pnpm を 11.1.1 へ更新、
  Windows での standalone + self-update 修正、post ステップでの inputs 復元など。
- **コード差分**: `v6.0.5...v6.0.8` の compare を確認。変更は `src/`・`dist/index.js`・
  bootstrap lockfile・README・`action.yml`（説明文の文言修正のみ）。新規 lifecycle
  スクリプト追加なし。
- **メンテナ・所有権**: `pnpm` org 配下。コミットは pnpm メンテナ（zkochan ほか）。
  配布主体の変化なし。
- **SHA 整合性**: PR ピン `0e279bb…` は upstream 注釈付きタグ `v6.0.8` の指す
  commit と一致。
- **既知 advisory**: 該当なし。

**リスクレベル: low**（patch、供給主体・コードに不審点なし）。
**推奨アクション: マージ推奨**。

## 一覧（推奨アクション）

| PR | 依存 | bump | リスク | 推奨 |
| --- | --- | --- | --- | --- |
| #1427 | cloudflare/wrangler-action 4.0.0 | major | low | マージ推奨 |
| #1426 | pnpm/action-setup 6.0.8 | patch | low | マージ推奨 |

## 現時点の方針

**両 PR ともマージ推奨**。いずれも well-established な org（cloudflare / pnpm）の
配布で、SHA ピンは upstream タグと一致し、不審な lifecycle スクリプトや配布主体の
変化は確認されなかった。#1427 は major bump だが実体は default wrangler バージョン
変更のみで、karasu の利用方法（`pages deploy`）に破壊的影響はない。

### 影響範囲・マイグレーション

- 既存ユーザーへの影響: なし（CI / デプロイのみ）。
- ドキュメント更新: なし。
- テスト・examples への影響: なし。

## 未解決の問い / 決めないこと

- `wranglerVersion` の明示ピン追加は本トリアージのスコープ外。必要なら別 Issue で扱う。
