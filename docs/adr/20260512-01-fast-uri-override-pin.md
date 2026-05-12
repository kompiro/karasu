---
id: ADR-20260512-01
title: "`fast-uri` を `pnpm.overrides` で `^3.1.2` に固定（GHSA セキュリティ修正）"
status: accepted
date: 2026-05-12
topic: build
scope:
  concerns:
    - security
    - dependencies
related_to:
  - ADR-20260329-01
  - ADR-20260416-01
  - ADR-20260429-08
assumptions:
  - "grep: package.json :: \"fast-uri\":\\s*\"\\^3\\.1\\.2\""
  - "grep: pnpm-lock.yaml :: fast-uri: 3\\.1\\.2"
---

# ADR-20260512-01: `fast-uri` を `pnpm.overrides` で `^3.1.2` に固定（GHSA セキュリティ修正）

- **日付**: 2026-05-12
- **ステータス**: 決定済み
- **関連**:
  - Dependabot alert [#15](https://github.com/kompiro/karasu/security/dependabot/15) — `fast-uri <= 3.1.0`：percent-encoded dot segments による path traversal（patched in 3.1.1, high）
  - Dependabot alert [#16](https://github.com/kompiro/karasu/security/dependabot/16) — `fast-uri <= 3.1.1`：percent-encoded authority delimiters による host confusion（patched in 3.1.2, high）
  - 実装 PR: [#1331](https://github.com/kompiro/karasu/pull/1331)
  - 既存 override の前例: ADR-20260416-01（`dompurify`）、`serialize-javascript` / `diff` / `uuid`（`package.json` の `pnpm.overrides`）
  - 依存運用 ADR: [ADR-20260329-01](./20260329-01-dependabot.md)（Dependabot 採用）、[ADR-20260429-08](./20260429-08-dependabot-security-2026-04-29.md)（直近の security update 整理）

## 背景

Dependabot が `fast-uri` に high severity の advisory を 2 件報告した。`fast-uri` は karasu の直接依存ではなく、`ajv`（`fast-uri: ^3.0.1` を要求）経由の transitive dependency で、lockfile では `fast-uri@3.1.0` に解決されていた。

transitive dep は `pnpm update fast-uri` では狙ったバージョンに上げられない（package.json に出てこないため、`--depth` 指定でも resolution が更新されないことを確認済み）。karasu には既に同種の security/compat 固定を `package.json` の `pnpm.overrides` で行う前例があった（`dompurify` ← ADR-20260416-01、`serialize-javascript`、`diff`、`uuid`）。

## 決定

`package.json` の `pnpm.overrides` に `"fast-uri": "^3.1.2"` を追加し、lockfile を再生成して依存ツリー全体（現状は `ajv` 配下のみ）を patched バージョンに固定する。

```jsonc
"pnpm": {
  "overrides": {
    "diff": "^8.0.3",
    "dompurify": "^3.3.2",
    "fast-uri": "^3.1.2",       // ← 追加（GHSA-* 修正、alert #15 / #16）
    "serialize-javascript": "^7.0.5",
    "uuid": "^14.0.0"
  }
}
```

caret（`^3.1.2`）で指定し、3.x の範囲内のパッチ／マイナーは引き続き受け入れる。`ajv` の要求レンジ `^3.0.1` を満たすため、追加の peer 解決問題は発生しない。

## 理由

- **transitive dep を確実に上げる手段は override 一択** — 直接 bump も `pnpm update` も効かない。`pnpm.overrides` は pnpm が公式に推奨する transitive のピン留め手段
- **既存パターンに合わせる** — `dompurify` 等で同じ運用を既に採用しており、レビュアの認知負荷が低く、`package.json` 1 か所に security pin が集約される
- **exact pin ではなく caret** — 後述のリスク評価により patch/minor の自動受け入れは安全と判断。exact（`3.1.2`）にすると次の advisory のたびに手作業更新が必要になる
- **upstream が範囲を吸収したら override を外せる** — `ajv` 側が `fast-uri` の要求レンジを patched 以降に引き上げたら、この override は不要になる（その時点で削除する。下記スコープ外参照）

## override でバージョンを固定することのリスク

`pnpm.overrides` は依存解決を強制的に書き換えるため、以下のリスクを持つ。本件についての評価を併記する。

| リスク | 説明 | 本件での評価 |
| --- | --- | --- |
| **後方互換性の破壊** | override 先のバージョンが、それを要求しているパッケージ（`ajv`）の想定する API と非互換だと、`ajv` の機能が壊れる | **低**。`3.1.0 → 3.1.2` は同一 major・同一 minor のパッチ更新で、semver 上は破壊的変更なし。`ajv` の要求レンジ `^3.0.1` も満たす。両 advisory の修正は URI パース時のセキュリティ境界の厳格化であり、正当な URI の挙動は変わらない |
| **要求レンジ外への固定** | override 先が依存元の要求レンジ（`^3.0.1`）を逸脱すると、ビルドは通っても実行時に壊れうる | **該当なし**。`^3.1.2` は `^3.0.1` の部分集合 |
| **将来の自動更新の抑制** | caret なら範囲内更新は通るが、`fast-uri` が 4.x を出した場合、override が `^3.1.2` のままだと依存元が 4.x を要求しても 3.x に張り付く | **要監視**。`ajv` が将来 `fast-uri@^4` を要求し始めたら override がブロッカーになる。その時点で override のレンジを広げるか削除する。Dependabot は override 値そのものも追跡対象にしうるが、確実ではないので「不要になった override は消す」を運用ルールとする |
| **複数 consumer 間の競合** | 別パッケージが `fast-uri` の非互換バージョンを要求している場合、override で全員を 1 つに揃えると一部が壊れる | **該当なし**。現状 `fast-uri` の consumer は `ajv` のみ。将来 consumer が増えたら lockfile diff で確認する |
| **lockfile / install の検証漏れ** | override 反映後に install・型チェック・テストを通していないと、解決崩れに気付けない | **対応済み**。PR #1331 で `pnpm install` がクリーンに解決し、lockfile が全箇所 `fast-uri@3.1.2` になることを確認 |

要約: **本件はパッチバージョン指定（`^3.1.2`、同一 major.minor）であり、semver に従う限り後方互換性は保たれる。リスクとして残るのは「将来 major が出たときに override が更新ブロッカーになりうる」点のみで、これは「不要になった override は削除する」運用で吸収する。**

## 却下した案

### 案: override せず `ajv` を直接アップグレードする
`ajv` の新しいメジャー／マイナーが `fast-uri` の patched レンジを要求していれば、それで transitive も上がる。

- 却下理由: `ajv@8.20.0` の要求は既に `^3.0.1` で patched バージョンを許容しており、`ajv` 側のバージョン問題ではない。`ajv` を上げても lockfile の `fast-uri` は再解決されない限り 3.1.0 のまま。`ajv` メジャーアップは無関係なリスクを持ち込む

### 案: `fast-uri` を exact（`3.1.2`）でピン留めする
将来の予期せぬ自動更新を完全に排除する保守的選択。

- 却下理由: パッチ更新（`3.1.3` 等）は通常安全で、次の advisory が出るたびに手作業更新が必要になる。`dompurify` 等の既存 override も caret 運用で、揃える方が一貫する

### 案: 何もせず Dependabot の自動 PR を待つ
Dependabot が transitive の security update PR を出すのを待つ。

- 却下理由: high severity であり、Dependabot が transitive-only の advisory に対して必ず PR を出すとは限らない。明示的に override で固定して状態を確定させるほうが速くて確実

## スコープ外（フォローアップ）

- **override の削除タイミング**: `ajv`（または将来の別 consumer）が `fast-uri` の要求レンジを patched 以降に引き上げたら、この override は冗長になる。依存更新バッチのレビュー時に `pnpm why fast-uri` で consumer のレンジを確認し、不要になっていれば削除する
- **override 全般の棚卸し**: `diff` / `dompurify` / `serialize-javascript` / `uuid` も同様に「まだ必要か」を定期的に見直す（本 ADR では扱わない）
- **`fast-uri` が major を出した場合の対応**: その時点で override のレンジ更新 or 削除を判断する（本 ADR では将来の major の中身を予見しない）
