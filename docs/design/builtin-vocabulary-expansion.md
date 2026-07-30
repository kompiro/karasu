# builtin 語彙の拡張 — `[cache]` / `[analytics]` / `@planned` の採用と却下候補の記録

- **日付**: 2026-07-30
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#2172](https://github.com/kompiro/karasu/issues/2172)（builtin vocabulary review: `[cache]` / `@canary`）
  - **PR**: [#2215](https://github.com/kompiro/karasu/pull/2215)
  - 前提 Issue: [#2159](https://github.com/kompiro/karasu/issues/2159)（`tag-not-builtin` / `annotation-not-builtin` の導入）, [#2065](https://github.com/kompiro/karasu/issues/2065)（tags and facets）, [#1816](https://github.com/kompiro/karasu/issues/1816)（notation watch round 2）
  - 関連 ADR: [ADR-1718](../adr/1718-vector-store-vs-database.md)（`[index]` = 役割タグ・新 kind を増やさない判断基準）, [ADR-316](../adr/316-database-as-first-class-node.md), [ADR-1820](../adr/1820-notation-promotion-gate.md)（promotion gate）, [ADR-1935](../adr/1935-wrangler-translate-adapter.md)（wrangler adapter の degrade）, [ADR-1314](../adr/1314-krs-spec-v1-freeze.md)（v1.0 freeze / annotation set の凍結）, [ADR-1508](../adr/1508-annotation-badge-label-i18n.md)（annotation badge label の i18n）, [ADR-2218](../adr/2218-roadmap-pruning-policy.md)（roadmap pruning — watch 行の畳み方）
  - 関連 design: [tags-and-facets](tags-and-facets.md)（register 確定・(B7) の corpus 測定要求）
  - 関連 TPL: [TPL-1503](../test-perspectives/TPL-1503-accepted-vocabulary-must-have-effect.md), [TPL-1296](../test-perspectives/TPL-1296-spec-doc-reference-data-sync.md), [TPL-1415](../test-perspectives/TPL-1415-shared-vocabulary-dual-representation.md), [TPL-1625](../test-perspectives/TPL-1625-client-vocabulary-structure-not-implementation.md), 本 PR で起こす proactive TPL（下記「Related TPLs」節）
  - コード: `packages/core/src/builtins/reference-data.ts`, `packages/core/src/builtins/default-style.ts`, `packages/core/src/translate/wrangler.ts`

## 背景・課題

[#2159](https://github.com/kompiro/karasu/issues/2159) で非 builtin の tag / annotation はすべて `tag-not-builtin` / `annotation-not-builtin` の warning 対象になった。その移行先として spec は「足りないアーキタイプ / lifecycle 状態は **builtin 追加要望**へ」という経路を明示している（`docs/spec/tags-annotations.md`）。したがって **builtin 語彙にどこまで含めるかが、ユーザーが警告なしに書ける表現力の上限**を直接決めるようになった。

[#2172](https://github.com/kompiro/karasu/issues/2172) はその経路の最初の行使として `[cache]` と `@canary` の 2 件を挙げていたが、レビューの過程で「今このタイミングで揃えておくべき語彙は他にもあるのではないか」という問いに広がった。本 Design Doc は 2 件の可否だけでなく、**builtin 語彙の棚卸しと、追加を判断するときの停止規則**までを対象にする。

現状の具体的な痛みは 2 つ観測できている（いずれも推測でなく repo 内の事実）:

1. `--from wrangler` adapter は Cloudflare KV を素の `database` に degrade している（`packages/core/src/translate/wrangler.ts:156` に「`[cache]` role は notation-watch item、出力しない」とコメントがある）。cache 役割は出力から失われる。
2. karasu 自身の記法クックブック（`docs/guide/notation-cookbook.md`）が、同じ表の中で `database SEARCH [index]` と正規のタグを使いながら、KV については `database CACHE { }` と **識別子に役割を埋め込んで**回避している。語彙が無いために命名規約へ逃がしている実例。

## 現状（インベントリ）

| 観点 | 現状 |
| --- | --- |
| builtin tag | 17 件（`external` / `index` / `async` / `sync` / `human` / `ai` / 7 つの client form-factor / `table` / `queue` / `api` / `storage`）。`reference-data.ts` の `tags` が単一情報源で、spec 表は `pnpm gen:reference` で生成 |
| builtin annotation | 4 件（`deprecated` / `new` / `experimental` / `migration_target`）。`appliesTo` を持たず全ノード種に適用可。`defaultBadge`（color / icon / label）を持つ |
| tier のフラグ | **無い**。`reference-data.ts` のエントリに experimental / stable の区別は存在せず、builtin 集合はフラット |
| `appliesTo` の強制 | **無い**。宣言は `reference-data.ts` にあり公開 API と spec 表に出るが、検証する consumer が存在しない。`tag-not-builtin` はタグ名しか見ていない（詳細は下記「タグの適用範囲の整理」節） |
| `[index]` の効果 | `default-style.ts` の light / dark 2 か所に `database[index] { badge-label: "index"; badge-color: … }` |
| 派生ストアの役割語彙 | `[index]`（検索用の導出）のみ。cache / 分析用途に相当する語彙は無い |
| lifecycle の状態 | 「削除予定」「新規」「実験的」「移行先」の 4 つ。**「まだ存在しない（to-be）」を表す語彙は無い** |
| register 規約 | tag = アーキタイプ / annotation = lifecycle / boundary = view 内グルーピング / facet = 外在的集合所属（[tags-and-facets](tags-and-facets.md) 決定事項 5）。facet は [#2173](https://github.com/kompiro/karasu/issues/2173) で **experimental として着地済み**（各 kind の `properties` に `facets` が入った）ため、membership の逃げ道は既に存在する |

## 制約・前提

- **register を跨がない** — tag に lifecycle 相当、annotation にアーキタイプ相当を入れない。register 混濁は tags-and-facets 設計が facet 一本化で潰した論点であり、builtin 追加で再汚染しない。
- **受理する語彙は効果を持つ**（[TPL-1503](../test-perspectives/TPL-1503-accepted-vocabulary-must-have-effect.md)）— badge / shape など既定描画の効果を同 PR で入れる。inert な語彙追加はしない。
- **構造で言えることに語彙を足さない**（[ADR-1718](../adr/1718-vector-store-vs-database.md) の判断基準の系）— 既存の構文・物理層で表現できるものは却下する。
- **技術は物理層** — 具体技術（Redis / Snowflake / ElasticSearch）は `store { type "..." }` に置き、論理層の語彙に技術名を入れない。
- **structure, not implementation**（`docs/concepts.md` §Structure, not implementation）— slowly-changing な構造を対象とし、runtime 状態は範囲外。
- **後方互換の方向性** — `appliesTo` の**拡大は後方互換だが縮小は破壊的**。初回は狭く入れる。
- **tier** — `reference-data.ts` に experimental フラグが無いため、実質 stable 追加として扱う（[ADR-1820](../adr/1820-notation-promotion-gate.md) の gate 判断そのものであり、載せる版は後方互換な追加なので **v1.x minor**）。
- **out of scope** — facet で扱うもの（PCI / PII などの membership、usecase の trigger 種別や CRUD といった grouping 軸）は本 Doc の対象外。`boundary` / `facet` の語彙設計にも触れない。

## 検討した選択肢

### 案1: `[cache]` と `@canary` のみを #2172 のまま処理する

Issue 記載の 2 件だけを可否判定する。

**メリット**

- スコープが小さく、判断が速い。

**デメリット**

- `@canary` は却下が妥当（後述）なので、成果は `[cache]` 1 件のみ。
- 「builtin 追加要望」経路が今後も 1 件ずつ来ることになり、そのたびに register 判定・停止規則の議論を最初からやり直す。**判断基準が蓄積しない**。

### 案2: 語彙を棚卸しし、体系として閉じる単位で追加する（採用）

派生ストアの役割軸と lifecycle 軸をそれぞれ見渡し、体系として穴になっている箇所を同時に埋める。同時に、**却下した候補とその理由**も記録して停止規則を明文化する。

**メリット**

- `[index]` / `[cache]` / `[analytics]` が「SoR ではないストアの役割」という一つの軸で閉じ、ユーザーが軸を理解して選べる。個別追加の積み重ねでは軸が見えない。
- 却下理由（`[bff]` は `delivers` で表現済み、`[kv]` は technology register 違反、など）が記録として残り、次の要望が来たときの判定コストが下がる。

**デメリット**

- 一度に増える語彙が多く、`@planned` と `[analytics]` は `[cache]` ほどの実利用証拠を持たない（後述の証拠強度参照）。

### 案3: すべて facet に逃がす

facet（[#2173](https://github.com/kompiro/karasu/issues/2173)、experimental として着地済み）がユーザー拡張点なので、`cache` も `planned` も facet で書いてもらう。

**メリット**

- ツール側の語彙を増やさない。

**デメリット**

- **register 違反**。tags-and-facets 設計は `facet bff`（アーキタイプ偽装）/ `facet canary`（lifecycle 偽装）を「拡張点一本化で再生産されうる誤用」としてリスク台帳に明記している。ここで公式に facet へ逃がすと、その誤用を karasu 自身が推奨することになる。
- facet は外在的な集合所属であり、既定描画の効果を持たない。cache であることが図に出ない。

## 比較

| 観点 | 案1（2 件のみ） | 案2（棚卸し・採用） | 案3（facet へ） |
| --- | --- | --- | --- |
| 実装量 | 小 | 中 | 極小 |
| register 整合 | 保たれる | 保たれる | **違反** |
| 判断基準の蓄積 | されない | される | されない |
| 語彙増加のリスク | 小 | 中（停止規則で抑える） | なし |

## 現時点の方針

**案2 を採用する。** 追加 3 件・却下 5 件を以下のとおり確定し、停止規則を spec に書く。

### 採用 (1) — `[cache]`（`database` / `storage` に付与）

**定義**: *SoR ではなく、失っても再構築（再計算・再取得・再ログイン）で回復できるストア。TTL を持つのが典型。*

判定は「消えたら**業務データが失われる**か」の一点。失われるなら SoR なので付けない。セッションストア・Redis キャッシュ・Cloudflare KV はいずれも該当する。

`storage` にも付与できるようにする。判定は同じで、object store 側の該当例は CDN のオリジンキャッシュ、生成済みサムネイル / レンダリング済み成果物、エクスポートの一時置き場など「元データから再生成できる blob」である。定義が kind に依存しない（SoR かどうかだけを問う）以上、`database` に限る理由が無い。

「正本からの導出コピー」に限定する案（`[index]` と同じ定義軸）は採らない。セッションストアは**そのセッションの正本**であって導出ではないため、導出厳格にすると最も典型的な用途が漏れる。揮発性を軸に取れば `[index]`（導出 ∧ 検索用）は本定義の部分集合として矛盾なく共存する。

**証拠の強さ: 強** — wrangler adapter の degrade（`wrangler.ts:156`）、クックブックの命名回避（`database CACHE`）、セッションストアという頻出用途。

### 採用 (2) — `[analytics]`（`database` / `storage` に付与）

**定義**: *分析・集計のために正本から取り込んだ派生ストア（DWH / データレイク）。*

`storage` を含めるのは、データレイクが object store（S3 / GCS 上の Parquet 等）として実現されるのが典型だからである。`[cache]` と同じく定義が kind に依存しないので、適用範囲も揃える。

`[warehouse]` ではなく `[analytics]` を採る。register が「tag = アーキタイプ（その要素が**何であるか**）」であるとき、`warehouse` は製品カテゴリの名前（Snowflake / BigQuery という**物**の言い換え）に寄り、`analytics` は「何のための派生か」という**役割**を名指す。`[index]` が「検索のための派生」であることと同じ語形になる。

分析ストアが他システムから取り込んだ、社内に正本を持たないデータを含む場合がある。その場合も「この system の SoR ではない」ことに変わりはなく、付与してよい。

**証拠の強さ: 弱〜中** — repo 内に直接の痛みの記録は無い。採用理由は体系側にある（下記「役割軸を閉じる」）。

### 採用 (3) — `@planned`

**定義**: *設計上そこに置くが、まだ実在しない要素。*

`@new`（実在する新規追加）・`@experimental`（実在するが不安定）はいずれも「実在する」ことを前提にしており、**「まだ無い」を表す語彙が 4 種のどれにも無い**。keystone 決定（`docs/roadmap.md`）が return trigger を「設計判断のとき」に置き、記録を判断の副産物と位置づけている以上、**判断の瞬間に描くのは to-be の姿**であり、そこに実在しない要素が混ざるのは通常の状態である。現状これを書くと `@planned` は非 builtin として warning になる。

**証拠の強さ: 中** — 語彙の穴は事実だが、実 corpus での使用実績はまだ測っていない。

### 役割軸を閉じる

採用後、ストアに付く役割タグは 3 つになり、一つの軸で閉じる:

| タグ | 何のための非 SoR か | 適用 kind |
| --- | --- | --- |
| `[index]` | 検索のための導出 | `database` |
| `[cache]` | 速度・可用性のための揮発コピー（またはセッション等の揮発正本） | `database` / `storage` |
| `[analytics]` | 分析のための導出 | `database` / `storage` |

タグ無しが SoR。この 4 状態で「そのストアは何なのか」が言い切れる。

`[index]` だけ `database` 限定なのは現状維持である（検索インデックスを `storage` で実現する形は観測していない）。適用範囲の拡大は後方互換なので、実例が出た時点で広げればよい。

### タグの適用範囲（`appliesTo`）の整理 — 宣言はあるが強制されていない

`[cache]` を 2 kind に広げる判断をした時点で「そもそも `appliesTo` は何を保証しているのか」が問題になる。**実測した結果、どこからも強制されていない**。

`appliesTo` は `reference-data.ts` に宣言され `reference.ts` の公開 API と spec 表に出るが、これを読んで検証する consumer は存在しない。`tag-not-builtin`（`resolver/warnings.ts`）は**タグ名が builtin 集合にあるか**だけを見ており、付与先の kind を見ていない。実際に次のモデルを `karasu render` に通すと **exit 0・warning ゼロ・badge なし**になる:

```
system S {
  service Api [index] { }     // appliesTo は database のみ
  user U [table] { }          // appliesTo は resource のみ
  database DB [mobile] { }    // appliesTo は client のみ
}
```

対照として `database DB [index]` は `index` badge を出す。つまり **builtin タグを適用範囲外の kind に付けると、受理され・効果を持たず・警告もされない**。これは [TPL-1503](../test-perspectives/TPL-1503-accepted-vocabulary-must-have-effect.md) が禁じた第 4 状態そのもので、[#2159](https://github.com/kompiro/karasu/issues/2159) は**名前の次元**でこれを解消したが、**kind の次元では残っている**。ユーザーから見ると「タグを書いたのに何も起きない」が名前のタイポと同じ症状で現れ、区別できない。

現状の適用範囲を軸で並べると、構造自体は既に整っている:

| 軸 | タグ | appliesTo |
| --- | --- | --- |
| 境界（所有の外） | `[external]` | `service` / `client` / `database` / `queue` / `storage` / `resource` |
| ストアの役割（非 SoR） | `[index]` / **`[cache]`** / **`[analytics]`** | `database`（+ 新 2 つは `storage`） |
| 通信様式 | `[async]` / `[sync]` | `edge` |
| actor 種別 | `[human]` / `[ai]` | `user` |
| client の form factor | `[mobile]` / `[web]` / `[desktop]` / `[cli]` / `[device]` / `[extension]` / `[embed]` | `client` |
| resource の shape | `[table]` / `[queue]` / `[api]` / `[storage]` | `resource` |

**タグ名 → ただ 1 つの軸 → その軸が意味を持つ kind 集合**という対応になっており、複数軸にまたがるタグは無い。`[external]` の appliesTo が広いのは境界という軸がそもそも多くの kind で意味を持つからで、例外ではない。整理すべきは表の中身ではなく、**この表が強制されていないこと**である。

したがって追加で `tag-not-applicable`（名前は仮）を提案する — builtin タグが `appliesTo` 外の kind に付いていたら warning を出す。severity は `tag-not-builtin` と同格の warning とする（症状が同じで、ユーザーにとって区別する意味が無いため）。留意点:

- **システム自動付与タグ**（`SYSTEM_ASSIGNED_TAGS` = `implicit` / `cyclic` / `read` / `write` / `inferred`）と、infra sub-kind から推論される shape タグは対象外にする。後者は `resource` に付くので `appliesTo` 内に収まるが、推論経路が将来変わったときに誤検知しないよう明示的に除外する。
- **既存モデルへの影響**は #2159 と同じ姿勢になる。今日 inert に受理されているものが warning になるだけで、parse error にはしない。
- `storage` ノードに `[storage]`（resource の shape タグ）を付けたモデルは警告対象になる。冗長な記述であり、警告されるのが正しい。

**この診断は本 Doc の語彙追加とは独立**（3 語彙を足さなくても成立し、足しても診断が無ければ `[cache]` を `service` に付けられてしまう）。実装量も別物なので、**follow-up Issue に切って別 PR で入れる**。本 Doc はギャップの記録と方針決定までを担う。

### 停止規則（境界クリープ対策）

[ADR-1718](../adr/1718-vector-store-vs-database.md) は新 infra kind の増加に対して「固有の**相互作用の形**を持つときに限る」という基準を置き、その理由として「index を kind にすると cache / graph DB / time-series が連鎖する」ことを挙げていた。タグは kind 集合を増やさないので同じ連鎖は起きないが、タグ側にも歯止めが要る。本 Doc は次を置く:

> **役割タグは「同一 kind 内で、SoR かどうかの違い」だけを表す。** 技術の違い（graph / time-series / column-oriented）は物理層 `store { type }`、運用配置の違い（read replica / シャード）は物理層かモデル化しない。

この規則により `[graph]` `[timeseries]` `[replica]` はいずれも却下側に落ちる。判定が「SoR か」の一問に畳まれているので、将来の要望も同じ問いで裁ける。

### 却下 — 理由を記録して閉じる

| 候補 | 却下理由 |
| --- | --- |
| `@canary` | (1) `@experimental` の典型用途が `docs/guide/03-evolution.md` で「feature flag 越しの試験サービス」と定義済みで意味領域が重なる。(2) canary rollout は通常 数時間〜数日の **runtime 状態**で、`@deprecated`（数ヶ月〜）と時間スケールが 2 桁違う。`docs/concepts.md` の slowly-changing 構造という範囲の外側に落ちる。(3) 実利用証拠がゼロで、tags-and-facets (B7) が要求する corpus 測定も未実施。長期併存する canary は `@new` + `@experimental`、新旧併存は `@migration_target` で既に描ける |
| `@sunset` | `@deprecated`（廃止予定）と意味が重複。廃止時期は `description` の散文で書ける |
| `[bff]` | `delivers <ClientId>` が BFF / SSR パターンを**構造として**表現済み（`docs/spec/syntax.md` のプロパティ表）。構造で言えることにタグを足さない |
| `[kv]` | **register 違反**。KV は technology であり role ではない。roadmap にあった「`[kv]` badge は watch」の行は [ADR-2218](../adr/2218-roadmap-pruning-policy.md) の pruning で既に削除されており、**却下の記録が残る場所は本 Doc から昇格する ADR だけ**になる |
| `[stateful]`（Durable Object / actor） | 今回は見送る。roadmap finding 6 の実在ギャップ（adapter が `service [external]` へ degrade し所有境界を過大表現している）は認識するが、finding 6 が求めているのは「compute かつ store」という **kind** の問題で、タグで塗るのは register の観点で筋が悪い。watch 継続 |
| `[replica]` / `[graph]` / `[timeseries]` | 上記停止規則により却下（技術差 = 物理層、運用配置 = モデル化しない） |

### 実装の指針

1. **`reference-data.ts`** — `tags` に `cache` / `analytics`（ともに `appliesTo: ["database", "storage"]`）、`annotations` に `planned`（`defaultBadge` の color / icon / label）を追加し、`pnpm gen:reference` で spec 表を再生成する（[TPL-1296](../test-perspectives/TPL-1296-spec-doc-reference-data-sync.md) / [TPL-1415](../test-perspectives/TPL-1415-shared-vocabulary-dual-representation.md)）。
2. **`default-style.ts`** — light / dark の 2 シートそれぞれに `database[cache]` / `storage[cache]` / `database[analytics]` / `storage[analytics]` の `badge-label` + `badge-color` を追加する（既存 `database[index]` と同じ形）。**`appliesTo` に挙げた kind すべてにセレクタを書く** — 片方を落とすと、宣言では受理されるのに効果が出ない状態を新規に作ることになる。`@planned` の badge は既存 4 種（⚠ / ✦ / ⚗ / →）と識別できる icon と色を選び、[ADR-1508](../adr/1508-annotation-badge-label-i18n.md) の i18n ラベル経路に載せる。**`[external]` が既に破線枠を使っているため、`@planned` に破線枠は使わない**（意味が混線する）。
3. **spec の散文** — `docs/spec/tags-annotations.md`（+ ja）に、役割軸の 4 状態表・「消えたら業務データが失われるか」という判定・停止規則を書く。`@planned` は annotation 節の lifecycle 説明に追加する。`docs/guide/03-evolution.md`（+ ja）の lifecycle 表も 5 行にする。
4. **クックブック** — `docs/guide/notation-cookbook.md`（+ ja）の Cloudflare Workers 節を `database CACHE [cache] { }` に更新し、「`[cache]` は notation-watch で未提供」という注記を削除する。
5. **wrangler adapter** — `packages/core/src/translate/wrangler.ts` の KV マッピングを `database <name> [cache]` の出力に変更し、警告を削除する。`wrangler.test.ts` の「no `[cache]` tag yet」テストを反転させる。[ADR-1935](../adr/1935-wrangler-translate-adapter.md) の degrade ギャップが閉じる。
6. **roadmap** — [ADR-2218](../adr/2218-roadmap-pruning-policy.md)（pruning 方針）に従い、§watch 対象の notation gap から **`database [cache]` role tag の行を削除する**（✅ や「昇格済み」の追記はしない。決定は昇格後の ADR が持つ）。stateful compute の行は watch 継続なので残す。§Syntax 2.0 プログラムの「`[cache]` watch がその機構の実例」という参照は、実例が完了したので昇格後の ADR を指すよう差し替える（見出しの anchor は変えない）。
7. **changeset** — core + karasu の minor。translate 出力が変わること、および今日 inert な `[cache]` / `[analytics]` / `@planned` という名前が badge を持つようになる挙動変化を明記する（ADR-1314 の下では追加互換）。
8. **AT**: `docs/acceptance/` に新規ファイル。TC は:
   - `database X [cache]` / `database X [analytics]` が warning なくパースされ、それぞれ固有の badge が描画される（light / dark 両テーマ）
   - `storage X [cache]` / `storage X [analytics]` も同様に badge を持つ（`appliesTo` に挙げた kind が全部効果を持っていること）
   - `@planned` が warning なくパースされ、badge が既存 4 種と識別可能に描画される
   - `[kv]` / `@canary` は引き続き `tag-not-builtin` / `annotation-not-builtin` の warning になる（却下が挙動として現れていること）
   - `karasu translate --from wrangler` が KV binding に対して `[cache]` を出力し、degrade 警告を出さない
   - spec 表（生成部）と `reference-data.ts` が一致している
9. **ADR 昇格**: 実装完了後に `docs/adr/YYYYMMDD-NN-builtin-vocabulary-expansion.md` として昇格し、本 Design Doc は同 PR で削除する。ADR は `refines: [ADR-1718]` として役割タグ軸の一般化を明示する。

### 影響範囲・マイグレーション

- **既存ユーザーへの影響**: これまで `[cache]` / `[analytics]` / `@planned` という名前を書いていたモデルは、warning が消えて badge が付く（挙動変化）。逆に旧バージョンのツールで新語彙を含むモデルを開くと `*-not-builtin` warning が出る（version skew。tags-and-facets のリスク台帳で受容済みのトレードオフ）。
- **ドキュメント更新**: `docs/spec/tags-annotations.md`（+ ja）, `docs/guide/03-evolution.md`（+ ja）, `docs/guide/notation-cookbook.md`（+ ja）, `docs/roadmap.md`。
- **テスト・examples への影響**: `wrangler.test.ts` の期待値を反転。examples は現状 `[cache]` / `@planned` を使っていないため影響なし（クックブックの `.krs` 断片のみ更新）。

## Related TPLs

- [TPL-1503](../test-perspectives/TPL-1503-accepted-vocabulary-must-have-effect.md) — 受理する語彙は効果を持つ。本 Doc は badge を同 PR で入れることを実装指針に含めている
- [TPL-1296](../test-perspectives/TPL-1296-spec-doc-reference-data-sync.md) / [TPL-1415](../test-perspectives/TPL-1415-shared-vocabulary-dual-representation.md) — `reference-data.ts` と spec 表の二重表現を同期させる
- [TPL-1625](../test-perspectives/TPL-1625-client-vocabulary-structure-not-implementation.md) — 語彙が構造を名指し実装を名指さないことのテスト。`@canary` 却下の根拠と同じ線
- **本 PR で起こす proactive TPL** — 「builtin 語彙の追加は register 判定・既存構造での表現可否・停止規則の 3 問を通す」。TPL-1503 は「効果があるか」だけを見ており、「そもそも足すべきか」の判定は既存 TPL に無い（3-Yes: 横展開しうる ✓ / 構造的に再発しうる ✓ = 追加要望は今後も来る / 既存 TPL 未掲載 ✓）

## 未解決の問い / 決めないこと

- `@planned` の badge に使う icon と色（実装時に既存 4 種との識別性を見て決める）
- `tag-not-applicable` 診断の正式な名前と、`docs/spec/diagnostics.md` への登録（follow-up Issue で決める。本 Doc はギャップの記録と方針までを担う）
- `@planned` なノードを一部の診断から除外すべきか（未実在の要素が orphan 系診断を鳴らす可能性）。実装時に実挙動を見て判断し、必要なら follow-up Issue にする
- finding 6（stateful compute）の kind 設計は本 Doc では扱わない
