---
id: ADR-20260520-02
title: translate を core に移設し App でクライアントサイド変換として提供する
status: accepted
date: 2026-05-20
topic: app-ui
related_to: [ADR-20260409-02, ADR-20260506-05]
scope:
  packages: [core, cli, app, i18n]
assumptions:
  - "file: packages/core/src/translate/translate.ts"
  - "symbol: packages/core/src/translate/translate.ts :: translateInfraConfig"
  - "file: packages/app/src/components/TranslateDialog.tsx"
  - "symbol: packages/app/src/components/TranslateProvider.tsx :: useOpenTranslateDialog"
---

# ADR-20260520-02: translate を core に移設し App でクライアントサイド変換として提供する

- **日付**: 2026-05-20
- **ステータス**: 決定済み
- **関連**:
  - Issue [#1463](https://github.com/kompiro/karasu/issues/1463)
  - PR [#1467](https://github.com/kompiro/karasu/pull/1467)
  - 関連 ADR: [ADR-20260409-02](20260409-02-cli-translate-command.md)（translate CLI の導入）, [ADR-20260506-05](20260506-05-translate-crud-bindings.md)
  - 関連 TPL: TPL-20260510-11（CLI と App の translate output 一致）
  - 昇格元 Design Doc: `docs/design/app-translate.md`（本 PR で削除）

## 背景

`karasu translate` は infra 設定や API spec（docker-compose / k8s マニフェスト / OpenAPI / DB スキーマ）を `.krs` の足場に変換する CLI サブコマンドで、既存システムの棚卸し・オンボーディングの主要な入口になっている。しかし CLI 専用のため、プレビュー UI（App）を主な作業場にしているユーザーは「ターミナルで変換 → 出力を App に取り込む」という往復を強いられていた。

変換ロジック本体（`packages/cli/src/translate/`）はほぼ純粋な TypeScript だが、入力ファイル読み込み・`karasu.map.yaml` 解決・警告の `process.stderr` 出力という 3 点で Node に結合しており、ブラウザでそのまま動かせなかった。

## 決定

translate のロジックを `packages/cli` から `packages/core` に移設して Node 依存を除去し、CLI と App が共有する純粋関数 `translateInfraConfig` を通じて、App からもクライアントサイドで変換できるようにする。

## 理由

- **単一実装**: CLI と App が同じ `translateInfraConfig` を呼ぶため、同一入力から同一 `.krs` が出ることが構造的に保証される（CLI/App の output 乖離を防ぐ — TPL-20260510-11）。
- **全モード対応**: クライアントサイド変換なので App の 3 モード（Project / Memory / Serve）すべてでサーバーなしに動く。
- **置き場の整合**: `core` はもともと純粋な TS ロジック（パーサー・レンダラー）の置き場であり、純粋な変換ロジックはそこに収まる。
- **CLI 後方互換**: `karasu translate` の挙動・出力は不変。CLI 側にはファイル I/O のラッパーだけが残る。
- **ポータブル化の具体**: `TranslatorContext` を `inputName` / `mapFile`（読み込み済みコンテンツ）/ `onWarning` で受ける形にし、警告は `process.stderr` ではなくデータとして返す。

## 却下した案

- **`karasu serve` に `/api/translate` エンドポイントを追加**: 変更量は小さいが ServeMode 限定で、Project / Memory モードのユーザーが恩恵を受けられない。信頼境界を越える POST ハンドラも増える。
- **core 移設とエンドポイントの両方**: core 移設だけで App の全モードをカバーできるため、エンドポイントは現時点で需要がなく作業量が増えるだけ。サーバー連携ユースケースが具体化した時点で別途再検討する。

## 補足: 初版のスコープ

App 側の変換結果アクションは初版ではコピー / ダウンロード（CLI の stdout / `--output` 相当）に絞る。生成した `.krs` を ProjectMode のプロジェクトファイルとして書き戻す機能は、ファイルツリー連携を要するため意図的に後続課題とする。
