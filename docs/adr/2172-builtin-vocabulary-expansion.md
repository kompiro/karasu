---
id: ADR-2172
title: "builtin 語彙の拡張 — `[cache]` / `[analytics]` / `@planned` を採用し、却下 7 件と停止規則を記録する"
status: accepted
date: 2026-08-10
topic: styling
refines: [ADR-1718]
related_to: [ADR-316, ADR-1314, ADR-1508, ADR-1820, ADR-1935, ADR-2065]
scope:
  packages:
    - core
assumptions:
  - "grep: packages/core/src/builtins/reference-data.ts :: name: \"cache\""
  - "grep: packages/core/src/builtins/reference-data.ts :: name: \"analytics\""
  - "grep: packages/core/src/builtins/reference-data.ts :: name: \"planned\""
  - "symbol: packages/core/src/resolver/warnings.ts :: NON_SOR_ROLE_TAGS"
  - "symbol: packages/core/src/resolver/warnings.ts :: hasNonSorRole"
  - "grep: packages/core/src/builtins/default-style.ts :: database\\[cache\\], storage\\[cache\\]"
  - "file: docs/spec/tags-annotations.md"
  - "file: docs/test-perspectives/TPL-2172-builtin-vocabulary-addition-gate.md"
---

# ADR-2172: builtin 語彙の拡張 — `[cache]` / `[analytics]` / `@planned` を採用し、却下 7 件と停止規則を記録する

- **日付**: 2026-08-10
- **ステータス**: 決定済み
- **関連**:
  - Issue [#2172](https://github.com/kompiro/karasu/issues/2172), PR [#2414](https://github.com/kompiro/karasu/pull/2414)（実装）, PR [#2215](https://github.com/kompiro/karasu/pull/2215)（Design Doc）
  - 前提 Issue: [#2159](https://github.com/kompiro/karasu/issues/2159)（`tag-not-builtin` / `annotation-not-builtin`）, [#2225](https://github.com/kompiro/karasu/issues/2225)（`tag-not-applicable`）, [#2065](https://github.com/kompiro/karasu/issues/2065)（tags and facets）, [#1816](https://github.com/kompiro/karasu/issues/1816)（notation watch round 2）
  - [ADR-1718](1718-vector-store-vs-database.md)（役割はタグ・技術は物理層。本 ADR はその判断基準を軸として一般化する）, [ADR-316](316-database-as-first-class-node.md), [ADR-1314](1314-krs-spec-v1-freeze.md)（追加は後方互換）, [ADR-1508](1508-annotation-badge-label-i18n.md)（badge label の i18n）, [ADR-1820](1820-notation-promotion-gate.md)（promotion gate）, [ADR-1935](1935-wrangler-translate-adapter.md)（KV の degrade — 本決定で閉じた）, [ADR-2065](2065-tags-and-facets.md)（register の確定）
  - [TPL-2172](../test-perspectives/TPL-2172-builtin-vocabulary-addition-gate.md)（3 問 gate）, [TPL-1503](../test-perspectives/TPL-1503-accepted-vocabulary-must-have-effect.md)（受理する語彙は効果を持つ）
  - `docs/spec/tags-annotations.md` §*Store role tags — one axis, four states* / §*`@planned` — designed, not yet built*, `docs/acceptance/2172-builtin-vocabulary-expansion.md`

## 背景

[#2159](https://github.com/kompiro/karasu/issues/2159) 以降、非 builtin の tag / annotation はすべて警告対象になり、spec は移行先として「足りないアーキタイプ / lifecycle 状態は **builtin 追加要望**へ」という経路を案内している。つまり **builtin 集合の大きさが、ユーザーが警告なしに書ける表現力の上限**を決めるようになった。#2172 はその経路の最初の行使である。

当初の候補は `[cache]` と `@canary` の 2 件だったが、レビューの過程で「1 件ずつ可否を出しても判断基準が蓄積しない」という問題が見えた。そこで対象を、2 件の可否ではなく **語彙の棚卸しと、追加を止める規則**に広げた。

痛みは推測ではなく repo 内の事実として 2 つ観測できていた:

1. `--from wrangler` adapter が Cloudflare KV を素の `database` に degrade し、cache という役割が出力から失われていた（[ADR-1935](1935-wrangler-translate-adapter.md) が記録した gap）。
2. 記法クックブックが、同じ表の中で `database SEARCH [index]` と正規のタグを使いながら KV には `database CACHE { }` と**識別子に役割を埋め込んで**回避していた。語彙が無いために命名規約へ逃がしていた実例である。

## 決定

ストアの役割を `[index]` / `[cache]` / `[analytics]`（タグ無し = 正本）の 1 軸で閉じ、lifecycle に `@planned` を足す。同時に候補 7 件を却下し、役割タグの停止規則を spec に明文化する。

## 理由

### 採用 (1) `[cache]` — `database` / `storage`

*正本ではなく、失っても再構築（再計算・再取得・再ログイン）で回復できるストア。TTL を持つのが典型。*

判定は「消えたら**業務データが失われる**か」の一点に畳まれる。失われるならそれは正本なのでタグを付けない。定義が kind に依存しない以上 `database` に限る理由が無く、`storage` にも適用する（CDN のオリジンキャッシュ、生成済みサムネイル、エクスポートの一時置き場）。

軸を「正本からの導出コピー」に取る案（`[index]` と同じ定義軸）は採らなかった。セッションストアは**そのセッションの正本**であって導出ではないため、導出厳格にすると最も典型的な用途が漏れる。揮発性を軸に取れば `[index]`（導出 ∧ 検索用）が部分集合として矛盾なく収まる。

証拠は強い — wrangler adapter の degrade、クックブックの命名回避、セッションストアという頻出用途。

### 採用 (2) `[analytics]` — `database` / `storage`

*分析・集計のために正本から取り込んだ派生ストア（DWH / データレイク）。*

データレイクは object store（S3 / GCS 上の Parquet 等）で実現されるのが典型なので、適用範囲は `[cache]` と揃える。他システムから取り込んだ、社内に正本を持たないデータを含む場合も「この system の正本ではない」ことに変わりはなく付与してよい。

`[warehouse]` ではなく `[analytics]` を採った。tag = アーキタイプ（その要素が**何であるか**）であるとき、`warehouse` は製品カテゴリ（Snowflake / BigQuery という**物**）の言い換えに寄り、`analytics` は「何のための派生か」という役割を名指す。`[index]` と同じ語形になる。

単体の証拠は弱い（repo 内に直接の痛みの記録は無い）。採用理由は体系の側にある — この 1 件を足すことで役割軸が閉じ、ユーザーが個別の名前ではなく軸を理解して選べるようになる。

### 採用 (3) `@planned`

*設計上そこに置くが、まだ実在しない要素。*

既存 5 種はいずれも実在を前提にしている（`@new` = 実在する新規追加、`@experimental` = 実在するが不安定、`@deprecated` = 実在して廃止に向かう、`@migration_target` = 実在する移行先、`@draft` = 記述の確度）。「まだ無い」を言う語彙が無かった。図を描く瞬間はたいてい判断の瞬間であり、判断が描くのは to-be の姿である以上、そこに実在しない要素が混ざるのは通常の状態である。

`@draft` とは register が違うので併用できる — `@planned` は**実在**の話（何であるかは確信している）、`@draft` は**確度**の話（それが正しいか確信がない）。

### 役割軸が閉じたこと

| タグ | 何のための非正本か | 適用 kind |
| --- | --- | --- |
| *(タグ無し)* | 正本（system of record） | すべてのストア |
| `[index]` | 検索のための導出 | `database` |
| `[cache]` | 速度・可用性のための揮発コピー（またはセッション等の揮発正本） | `database` / `storage` |
| `[analytics]` | 分析のための導出 | `database` / `storage` |

`[index]` だけ `database` 限定なのは現状維持である（検索インデックスを `storage` で実現する形は観測していない）。**適用範囲の拡大は後方互換だが縮小は破壊的**なので、実例が出た時点で広げる。

### 停止規則（境界クリープ対策）

[ADR-1718](1718-vector-store-vs-database.md) は新 infra kind に対して「固有の**相互作用の形**を持つときに限る」という基準を置き、その理由に「index を kind にすると cache / graph DB / time-series が連鎖する」ことを挙げていた。タグは kind 集合を増やさないので同じ連鎖は起きないが、タグ側にも歯止めが要る。本 ADR は次を置く:

> **役割タグは「同一 kind 内で、正本かどうかの違い」だけを表す。** 技術の違い（graph / time-series / column-oriented）は物理層 `store { type }`、運用配置の違い（read replica / シャード）は物理層かモデル化しない。

判定が「正本かどうかの話か」の一問に畳まれているので、将来の要望も同じ問いで裁ける。本 ADR が [ADR-1718](1718-vector-store-vs-database.md) を `refines` するのは、ADR-1718 の「役割はタグ・技術は物理層」という個別判断を、役割タグ一般に効く軸と停止規則として具体化しているためである。

### 共有ストア診断の扱い（実装時に決めた）

`shared-infra-fan-in` / `cross-domain-store-access` は `[external]` と `[index]` を除外していた（[#1733](https://github.com/kompiro/karasu/issues/1733)）。この除外を**役割タグ 3 種すべて**に広げる。これらの smell が述べているのは共有された**正本**についてであり、キャッシュは用途が複数あり（アセット / セッション / データ）、分析ストアも複数の軸で置かれうる。どちらも複数サービスから読まれるのが通常の形であって Database-per-Service ではない。

ただし除外が効くのは**そのタグの `appliesTo` の内側だけ**とする。`queue Events [cache]` は `tag-not-applicable` で「ここでは効果を持たない」と警告される対象であり、その状態で診断だけ黙らせると「効果が無いと言っておきながら効果がある」ことになる。

### `appliesTo` の内側を機械で縛る

[#2225](https://github.com/kompiro/karasu/issues/2225) の `tag-not-applicable` は `appliesTo` の**外側**を縛るが、内側 — 宣言した kind で本当に効果が出るか — は誰も見ていなかった。`[cache]` を 2 kind に広げる判断はこの穴を踏みうるので、`default-style.test.ts` に「`appliesTo` に挙げた全 kind が light / dark 両シートで効果を持つ」フェンスを同 PR で入れた。効果を持たないと宣言したタグ（`[human]` / `[ai]` / `[sync]` / client form-factor 7 種）だけが明示の allowlist に載る。

## 却下した案

### 語彙の候補

| 候補 | 落ちた問い（[TPL-2172](../test-perspectives/TPL-2172-builtin-vocabulary-addition-gate.md) の 3 問） | 理由 |
| --- | --- | --- |
| `@canary` | 1（register）+ 既存表現との重複 | canary rollout は通常 数時間〜数日の **runtime 状態**で、`@deprecated`（数ヶ月〜）と時間スケールが 2 桁違う。`docs/concepts.md` の slowly-changing な構造という範囲の外側に落ちる。`@experimental` の典型用途（`docs/guide/03-evolution.md`「feature flag 越しの試験サービス」）とも意味領域が重なる。長期併存する canary は `@new` + `@experimental`、新旧併存は `@migration_target` で既に描ける |
| `@sunset` | 2（既存表現） | `@deprecated`（廃止予定）と重複。廃止時期は `@deprecated(until: …)` か `description` の散文で書ける |
| `[kv]` | 1（register） | KV は technology であって role ではない。技術は物理層 `store { type }` に置く |
| `[bff]` | 2（既存表現） | `delivers <ClientId>` が BFF / SSR パターンを**構造として**表現済み。構造で言えることにタグを重ねると、2 つの表現が食い違ったときに正解が決まらない |
| `[graph]` / `[timeseries]` / `[replica]` | 3（停止規則） | 技術差は物理層、運用配置はモデル化しない |
| `[stateful]`（Durable Object / actor） | — | 見送り。roadmap finding 6 の実在ギャップ（adapter が `service [external]` へ degrade し所有境界を過大表現している）は認識するが、求められているのは「compute かつ store」という **kind** の問題であり、タグで塗るのは register の観点で筋が悪い。watch 継続 |

**却下も挙動として現れる**ことをテストで固定した（`[kv]` は `tag-not-builtin`、`@canary` は `annotation-not-builtin` を出し続ける）。却下理由が散文にしか残らないと、半年後に同じ候補が「新しい提案」として再登場する。

### 進め方の案

- **案1: #2172 記載の 2 件だけを処理する** — スコープは小さいが、`@canary` は却下が妥当なので成果は `[cache]` 1 件のみ。以後も 1 件ずつ来るたびに register 判定と停止規則の議論を最初からやり直すことになり、判断基準が蓄積しない。
- **案3: すべて facet に逃がす** — **register 違反**。[ADR-2065](2065-tags-and-facets.md) は `facet bff`（アーキタイプ偽装）/ `facet canary`（lifecycle 偽装）を「拡張点一本化で再生産されうる誤用」としてリスク台帳に明記している。公式に facet へ逃がすと、その誤用を karasu 自身が推奨することになる。facet は外在的な集合所属であり既定描画の効果を持たないので、cache であることが図に出ないという実害もある。

## 影響

- **既存モデル**: `[cache]` / `[analytics]` / `@planned` という名前を書いていたモデルは、警告が消えて badge が付く（[ADR-1314](1314-krs-spec-v1-freeze.md) の下で追加互換）。適用範囲外の kind に付けていた場合は `tag-not-applicable` の警告に変わる。
- **version skew**: 新語彙を含むモデルを旧版で開くと `*-not-builtin` の警告が出る（[ADR-2065](2065-tags-and-facets.md) のリスク台帳で受容済みのトレードオフ）。
- **tier**: `reference-data.ts` に experimental フラグが無いため実質 stable 追加として扱う（[ADR-1820](1820-notation-promotion-gate.md) の gate 判断そのもの）。後方互換な追加なので v1.x minor で載せた。
- **translate**: `--from wrangler` の KV 出力が `database <id> [cache]` に変わり、[ADR-1935](1935-wrangler-translate-adapter.md) の degrade gap が閉じた。

## 積み残し

- `@planned` なノードを一部の診断から除外すべきかは**除外しない**と決めた（どの deploy unit も realize していない `@planned` サービスは `unassigned-service` を出す）。黙らせるとアノテーションが穴を隠す手段になる。
- `docs/spec/**` の `.krs` スニペットには fence の parse ガードが無く、`tags-annotations.md` の既存スニペットが現行文法から外れていることが本作業中に判明した → [#2415](https://github.com/kompiro/karasu/issues/2415)。
- stateful compute（finding 6）の kind 設計は本 ADR の対象外。
