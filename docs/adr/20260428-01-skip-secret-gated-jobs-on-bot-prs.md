---
id: ADR-20260428-01
title: Secret 必須の CI ジョブは bot 作者の PR で skip する
status: accepted
date: 2026-04-28
topic: build
scope:
  concerns:
    - ci
    - security
    - dependencies
related_to:
  - ADR-20260329-01
  - ADR-20260413-01
---

# ADR-20260428-01: Secret 必須の CI ジョブは bot 作者の PR で skip する

- **日付**: 2026-04-28
- **ステータス**: 決定済み
- **関連**:
  - Issue #903
  - PR #904（`.github/workflows/preview.yml` への初回適用）
  - ADR-20260329-01（Dependabot による依存更新の自動化）
  - ADR-20260413-01（Preview workflow はラベル駆動をやめ path filter で制御する）

## 背景

GitHub Actions では、Dependabot などの bot 作者による PR から起動された
ワークフローには Repository / Environment Secrets が渡されない。これは
GitHub 側のサプライチェーン保護のための仕様であり、PR 経由で third-party
コードが secret を盗むのを防いでいる。

karasu の `Preview` ワークフロー（`.github/workflows/preview.yml`）は
`CLOUDFLARE_API_TOKEN` と `CLOUDFLARE_ACCOUNT_ID` を必要とする。これらは
bot の PR では空になり、`Deploy Preview to Cloudflare Pages` ステップが
必ず失敗する。今週の Dependabot 群（#898, #900, #902 など）でも全件で
赤チェックが付き、レビュー時のノイズになっていた。

同じ問題は将来 Renovate や Snyk、その他 GitHub App 由来の自動 PR でも
再発しうる。secret を渡せないこと自体は妥当な前提なので、ジョブ側で
「この PR では走らせない」と宣言する方が筋がよい。

## 決定

Secret に依存する CI ジョブは、PR の作者が bot のとき skip する。
判定条件は `github.event.pull_request.user.type != 'Bot'` を job-level の
`if:` に追加する。

最初の適用先は `.github/workflows/preview.yml` の `preview` job（Cloudflare
Pages デプロイ）。今後 secret を必要とする新規ジョブを追加する際にも同じ
条件を入れる。

## 理由

- **GitHub の仕様に合わせる。** bot PR に secret が渡らないのは設計上の
  保護機能であり、無理に通そうとすると `pull_request_target` を使って
  third-party diff に secret を露出させる方向に倒れる。skip を選ぶ方が
  サプライチェーン的に正しい。
- **誤検知ノイズを消すと bot PR のレビューが速くなる。** Dependabot 週次
  バンドルでは赤チェックが恒常的に並び、人間が「無関係な失敗」を毎回
  読み飛ばす必要があった。skip にすればチェック一覧が綺麗になり、
  本当に見るべき `Check` / `Validate` だけが残る。
- **`user.type == 'Bot'` は GitHub が一次情報として持っている。** 自前で
  actor 名を列挙する（`dependabot[bot]` だけ書く等）のは将来 Renovate
  などを足したときに漏れるが、`user.type` なら GitHub App ベースの bot を
  網羅できる。
- **opt-out の責務はジョブ側に閉じる。** ラベル（例: `dependencies`）に
  依存させると、ラベル付与のタイミングと job 起動の race が起きうる
  （ADR-20260413-01 で同種の問題を回避済み）。job-level の static な
  条件にしておけば常に決定的に動く。

## 適用方針

- 新しい secret を必要とするジョブを追加するとき、レビュー時に bot 作者で
  動かせるかを確認する。動かせない（= secret 必須）なら同じ `if:` を入れる。
- Secret に依存しないジョブ（lint, typecheck, unit test, validate 系）は
  bot PR でも走らせる。これらは Dependabot の更新が壊れていないことを
  検証する第一の手段なので止めてはいけない。
- 「bot に書き込み権限がある」操作を伴うジョブ（PR コメント投稿、ラベル
  付与など）については本 ADR の対象外。必要に応じて別途 `permissions:`
  と `if:` を組み合わせて判断する。

## 却下した案

### ラベル `dependencies` の有無で skip する

Dependabot は自動的に `dependencies` ラベルを付けるので一見動きそうだが、

- ラベル付与は PR 作成直後にイベントで行われるため、`opened` トリガで
  起動した workflow は付与前のスナップショットで実行されることがある。
- 人間が手動でラベル操作したときの挙動が不明瞭になる（剥がしたら走り
  始める、付け直したら止まる、のような race を許してしまう）。
- ADR-20260413-01 で同様のラベル駆動を撤去した経緯があり、再導入する
  動機が弱い。

### Actor 名（`dependabot[bot]`）の列挙

短期的には動くが、Renovate / Snyk / 将来の自前 GitHub App などを
追加するたびに workflow を書き換える必要が出る。`user.type` 比較なら
列挙のメンテナンスが要らない。

### `pull_request_target` で secret を渡す

Bot PR でも preview を焼けるようになるが、third-party の diff を持つ
ブランチを base 環境の secret 付きで走らせるのは典型的なサプライチェーン
攻撃面。preview を焼くために負うリスクとして見合わない。
