# reverse harness の synthesis を物理層について lossless にする

- **日付**: 2026-08-17
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#2078](https://github.com/kompiro/karasu/issues/2078)
  - 証拠元 Issue: [#1991](https://github.com/kompiro/karasu/issues/1991)（hato 逆生成 spike）
  - 関連 ADR: [ADR-1895](../adr/1895-reverse-architecture-harness.md)（reverse harness）、
    [ADR-1870](../adr/1870-domain-entity-modeling.md)（entity / resource 解決）、
    [ADR-1314](../adr/1314-krs-spec-v1-freeze.md)（v1 syntax freeze）
  - 関連 TPL: [TPL-907](../test-perspectives/TPL-907-cross-reference-validation.md)、
    [TPL-1503](../test-perspectives/TPL-1503-accepted-vocabulary-must-have-effect.md)、
    [TPL-1623](../test-perspectives/TPL-1623-diagnostics-catalog-completeness.md)、
    [TPL-1720](../test-perspectives/TPL-1720-validation-target-set-enumerates-all-kinds.md)、
    [TPL-2171](../test-perspectives/TPL-2171-spec-promised-diagnostics-implemented.md)、
    [TPL-999](../test-perspectives/TPL-999-implicit-data-filtering.md)
  - コード: `packages/core/src/resolver/warnings.ts`、
    `packages/core/src/resolver/resource-entity.ts`、
    `packages/core/src/view/coverage-extract.ts`、`packages/cli/src/coverage.ts`
  - スキル: `.claude/skills/reverse-architecture/SKILL.md`（Phase 3 手順 5-6 / Phase 4）

## 背景・課題

reverse-architecture harness（[ADR-1895](../adr/1895-reverse-architecture-harness.md)）の
Phase 3 synthesis で、**物理層が黙って落ちる**。#1991 の hato 逆生成（実 D1 テーブル 35 本）で
2 つの欠落が観測された。

1. **`database` 宣言ブロックごと消える。** scout の `skeleton.krs` は `database HatoDB { …35 tables }`
   を宣言していたが、merge 後の `index.krs` には `database` ブロックが 1 つも無い。テーブルは
   entity 側の `table HatoDB.X` 参照としてしか残らず（26 種）、**どの entity からも参照されなかった
   9 本が model から消滅した**。
2. **entity↔table の対応付けが domain ごとに落ちる。** 消えた 9 本すべてに対応する entity
   （`Goal`, `GoalProposal`, … `DailyUsageRow`）は存在するのに、deep-dive agent が `table HatoDB.X`
   行を書き落としていた。極端な例は `entity Goal {}`（空）。

Issue #2090 で SKILL.md 側の**プロンプト誘導**は既に着地している（Phase 3 手順 5「skeleton の
infra 宣言を verbatim で持ち越す」/ 手順 6「entity↔table を検証する」）。本 Design Doc が決めるのは
残りの半分、すなわち **構造層（決定的 CLI 側）に何を置くか**である。ADR-1895 が引いた
「意味層 = subagent、構造層 = CLI」の線に従えば、この 2 つはどちらも機械判定可能なので
CLI 側に根拠を持つべきものになる。

### 観測: 4 つの失敗形すべてが現状「無診断」

`compileProject` に直接かけて診断を観測した（probe は本 PR に含めない使い捨て）。

| ケース | 入力 | 現状の出力 |
| --- | --- | --- |
| A | `database` ブロックが無いまま `resource HatoDB.goals` / `entity Goal { table HatoDB.goals }` | 診断ゼロ |
| B | `database HatoDB { table goals }` はあるが `entity Goal {}`（mapping 無し） | 診断ゼロ |
| C | 宣言された `table daily_usage` を誰も参照しない | 診断ゼロ |
| D | すべて正しく結線されている（対照） | 診断ゼロ |

**A が無診断なのが問題の核**である。宣言されていない infra を指す dot-notation 参照が、
存在検査を一切受けずに「解決済み」として扱われている。

## 現状（インベントリ）

| 観点 | 現状 |
| --- | --- |
| `resource X.Y` の解決 | `resolver/resource-entity.ts:82-88` — `resource.ref` があれば `{infraParentId, infraChildId}` を**そのまま返す**。`X` / `Y` が宣言済みかは問わない |
| bare `resource X` の解決 | 同 `:89-105` — entity 名前空間を引き、解決できなければ `unassigned-resource` **warning** が出る |
| `entity` の物理 mapping | `types/ast.ts:214-232` の `EntityNode.tableRef?: {parent, child}`。「mapping が無いのは forward-design の正当な中間状態」と doc comment が明記 |
| `tableRef` の存在検査 | 無い。consumer は `resource-entity.ts:102-103` と `warnings.ts:824-826`（`cross-domain-store-access` の所有者マップ）の 2 か所だけ |
| §S6（`docs/spec/syntax.md:1674`） | 「参照先 id は宣言済みノードに解決しなければならない」を **edge / `realizes` / `owns` / `handles` について**規定。`resource` / `table` の dot 参照は対象外 |
| `karasu coverage` | `view/coverage-extract.ts` — domain ごとの usecase / entity / resourceRef / edge 密度のみ。物理層の観点を一切持たない |
| `karasu diff` | 出力は SVG のみ。skeleton と merged の差分を機械判定する用途には使えない |
| `karasu render` | warning / info を stderr に `Warning:` / `Info:` 前置で出す（`cli/src/render.ts:98-102`）。非ゼロ終了は error severity のみ |

**記法間の非対称**が現状の要点である。bare `resource X` が解決できなければ warning が出るのに、
dotted `resource X.Y` は宣言の有無を問われない。`unassigned-resource` のカタログ記述は
dot-notation を明示的に検査対象外としている（`docs/spec/diagnostics.md:153`）。これは
[TPL-907](../test-perspectives/TPL-907-cross-reference-validation.md)（「新しい cross-reference
プロパティには resolver-side 検証と unresolved warning を必ず付ける」）が禁じている状態そのもので、
TPL-907 が起こされる前に入った構文がその穴に残っている。

## 制約・前提

- **新しい `.krs` 構文を導入しない**（[ADR-1314](../adr/1314-krs-spec-v1-freeze.md) の v1 freeze）。
  追加してよいのは診断とレポートだけ。
- **mapping が無い entity は defect ではない。** #1991 の実測でも 44 entity 中 9 個は正当に
  tableless（read-model projection / KV backed / 計算ビュー）だった。これを warning にすると
  手書きモデルの forward-design 中間状態が常時警告まみれになる。`EntityNode.tableRef` の
  doc comment もこの状態を正当と宣言している。
- **`coverage` の score 定義を変えない。** score は domain 間の相対正規化で、ADR-1895 が
  「enrichment 後は再測定が要る」と明記している程度に敏感。物理次元を score に混ぜると
  既存の `thin` 判定が全部ずれる。
- 診断コードは stable API（`docs/spec/diagnostics.md:18-21`）。追加したコードは
  `docs/spec/diagnostics.md` と `.ja.md` の両方に行を足さないと
  [TPL-1623](../test-perspectives/TPL-1623-diagnostics-catalog-completeness.md) の
  `diagnostics-catalog.test.ts` が落ちる。i18n（`packages/i18n/src/{en,ja}.ts` +
  `render-warning.ts`）も同時更新が要る。
- **out of scope**: harness の repair ループ自体の自動化（欠落を検出したあと誰が再 dive するか）は
  SKILL.md 側の手順に留め、CLI は「検出して報告する」までとする。

## 検討した選択肢

### 案1: core の診断だけで解く

A / B / C すべてを warning ないし info の診断にし、`render` で surface する。

**メリット**

- 追加サーフェスがゼロ。harness は既に `render` を validator として使っている（SKILL.md）。
- LSP / app にも同時に効く。手書きユーザーも恩恵を受ける。

**デメリット**

- B / C は **defect ではない**ので warning にできない。info に落としても、部分的なモデルでは
  常時大量に出て「事実」としてすら読まれなくなる（[TPL-1386](../test-perspectives/TPL-1386-diagnostic-register-fact-vs-style.md)
  の register 判断に反する）。
- 「35 本中 26 本が mapping 済み」のような**量的な回復度**は診断の粒度では表現できない。
  harness が repair の要否を判断するには件数が要る。

### 案2: `karasu coverage` の拡張だけで解く

A / B / C を coverage レポートの物理セクションとして出す。診断は追加しない。

**メリット**

- harness は Phase 4 で既に `coverage --format json` を読んでいる。配線が要らない。
- 量的に出せるので repair ループが判断できる。

**デメリット**

- **A は普遍的な defect**であり、harness だけの関心事ではない。手書きで `resource TypoDB.users` と
  書いた人が黙って壊れたモデルを得る現状（TPL-907 違反）が残る。
- coverage を読むのは harness だけ。app / LSP / `render` を使う経路には何も届かない。

### 案3: `karasu fidelity` 新コマンド

物理 fidelity 専用の第 3 の primitive を立てる。

**メリット**

- 責務が最も明確に分かれる。ADR-1895 が `coverage` を `matrix` の拡張にせず別コマンドにした
  判断と同じ形。

**デメリット**

- 「逆生成モデルがどれだけ回復できているか」という**同じ問い**に対して 2 コマンドを読むことになる。
  `coverage`（論理）と `fidelity`（物理）を並べる必然性が薄い。ADR-1895 で `matrix` と分けたのは
  問い自体（CRUD マトリクス vs 密度）が違ったからで、ここは問いが同じで軸が違うだけ。
- CLI サーフェスと `--help` / ドキュメント / AT が 1 セット増える。

### 案4: 主張の種類で分割する（診断 + coverage 拡張）

**「普遍的に defect か」で振り分ける。**

- **A（宣言されていない物理を指す参照）→ core 診断。** dot-notation の `resource X.Y` と
  entity の `table X.Y` に存在検査を入れ、解決できなければ warning。§S6 の
  「warn-don't-error」ファミリに素直に収まる。
- **B / C（回復度の測定）→ `coverage` の物理セクション。** 件数と id リストを JSON / md で出す。
  診断は出さない。

**メリット**

- register の意味論（error/warning = defect、info = 事実、レポート = 測定）と一致する。
- A の修正が bare / dotted の非対称を解消し、TPL-907 の穴を塞ぐ。harness 以外にも効く。
- B / C が false-positive を作らない。判断（この entity は正当に tableless か）は harness と人間に残る。
- 新コマンドを増やさない。

**デメリット**

- 変更が 2 パッケージ（core の resolver と view、CLI の coverage 出力）にまたがる。
- harness 側は「`render` の warning を読む」と「`coverage` の JSON を読む」の 2 経路を使う。
  ただしどちらも Phase 4 で既に走らせているコマンドなので、実行回数は増えない。

## 比較

| 観点 | 案1 診断のみ | 案2 coverage のみ | 案3 新コマンド | 案4 分割 |
| --- | --- | --- | --- | --- |
| A を手書きユーザーにも届ける | ✅ | ❌ | ❌ | ✅ |
| B/C を false-positive なく出せる | ❌ | ✅ | ✅ | ✅ |
| 回復度を量で出せる | ❌ | ✅ | ✅ | ✅ |
| CLI サーフェス増 | なし | なし | +1 コマンド | なし |
| harness の配線変更 | 小 | 小 | 中 | 小 |
| TPL-907 の穴を塞ぐ | ✅ | ❌ | ❌ | ✅ |

## 現時点の方針

**案4 を採用する** — 2 つの欠落は「見た目が似ているだけで種類が違う」ためである。宣言されていない
物理を指す参照は、誰が書いても・どの経路でも defect なので診断が正しい置き場になる。一方
「entity に mapping が無い」「宣言したテーブルを誰も参照しない」は karasu のモデリング上正当な
中間状態であり、defect ではなく**回復度の測定値**として扱うのが register の意味論に合う。
案1 / 案2 はどちらか一方の性質しか扱えず、案3 は同じ問いを 2 コマンドに割る。

### 実装の指針

#### 1. core: 物理参照の存在検査（case A）

`packages/core/src/resolver/warnings.ts` の `analyze()` に detector を 2 つ足す。宣言済み集合は
merged model の `databases` / `queues` / `storages` とその leaf children から作る
（`view/crud-matrix-extract.ts:104-118` の `buildInfraIndex` が既に同じ列挙をしているので、
共有 helper に切り出して二重管理を避ける — [TPL-1720](../test-perspectives/TPL-1720-validation-target-set-enumerates-all-kinds.md)）。

| 新コード | severity | 発火条件 |
| --- | --- | --- |
| `unresolved-resource-ref` | warning | dot-notation `resource X.Y` の `X` が infra ブロックとして宣言されていない、または `Y` が `X` の leaf として宣言されていない |
| `unresolved-table-ref` | warning | entity の `table X.Y` について同上 |

- **import-coupled にする。** 未解決の import が残る単一ドキュメント文脈（LSP）では判定しない。
  既存の `owns-target-not-found` / `contains-target-not-found` と同じ扱いにする。
- メッセージは「どちらが欠けているか」を分けて書く（ブロックごと無い / ブロックはあるが leaf が無い）。
  ブロックごと無い場合が今回の hato の症状で、原因の当たりが全く違う。
- `[external]` タグの付いた参照の扱いを実装時に確認する。`unassigned-resource` は `[external]` を
  除外している。dot-notation 側で `[external]` がどう表現されるかを確認し、除外条件を揃える。
- i18n（`packages/i18n/src/{en,ja}.ts`, `render-warning.ts`）、`docs/spec/diagnostics.md` と
  `.ja.md` の「Cross-reference resolution（§S6）」表への行追加、`docs/spec/syntax.md` §S6 の
  対象に `resource` / `table` の dot 参照を含める記述を同 PR で行う。
- 既存の `examples/` と AT fixture がこの warning を新たに出さないことを確認する（出たら
  fixture 側が実際に壊れている）。

#### 2. core + CLI: `coverage` に物理セクション（case B / C）

`CoverageReport` に `physical` を足す。`domains` と `threshold` は不変で、`score` の算出式にも
触れない。

```jsonc
{
  "domains": [ /* 既存のまま */ ],
  "threshold": 0.31,
  "physical": {
    "infra": [
      {
        "infraId": "HatoDB",
        "kind": "database",
        "leaves": 35,
        "mappedByEntity": 26,
        "referencedByResource": 30,
        // 参照はされているが、どの entity も mapping していない = 回復可能な取りこぼし
        "unmappedButReferenced": ["goals", "goal_proposals"],
        // 誰も参照も mapping もしていない = domain ごと欠けている疑い
        "unreferenced": ["daily_usage"]
      }
    ],
    // mapping を持たない entity（事実。正当な logical entity かは呼び手が判断する）
    "tablelessEntities": [{ "entityId": "Goal", "domainId": "Goals" }]
  }
}
```

- `unmappedButReferenced` と `unreferenced` を分けるのが要点。前者は #1991 で観測された
  「agent が mapping 行を書き落とした」形で機械的に repair できる。後者は「その domain が
  そもそも掘られていない」形で、再 dive が要る。まとめると harness がどちらの手当てをすべきか
  判断できない（[TPL-999](../test-perspectives/TPL-999-implicit-data-filtering.md) の
  「集計層で暗黙に畳まない」）。
- md 形式では domain 表の下に物理表を足す。**infra leaf が 1 つも宣言されていないモデルでは
  セクションごと省く**（論理だけのモデルに空表を出さない）。
- 解決は `buildEntityResolver` を経由する。bare `resource Order` → `entity Order` →
  `tableRef` の経路（[ADR-1870](../adr/1870-domain-entity-modeling.md) の canonical form）で
  参照されている leaf を「参照なし」と誤判定しないため。

#### 3. スキルとドキュメント

- `.claude/skills/reverse-architecture/SKILL.md` の Phase 3 手順 5-6 と Phase 4 に、
  実行するコマンドと**到達状態**を書く。現状は「検証せよ」という指示だけで判定手段が無い。
  - Phase 3 の終わりに `karasu render index.krs`（stderr に `unresolved-resource-ref` /
    `unresolved-table-ref` が出ないこと）。
  - Phase 4 の `coverage --format json` で `physical.unmappedButReferenced` が空、
    `physical.unreferenced` は空か「なぜ空でないか」を記録。
  - SKILL.md は CLI 名を hardcode するので、`karasu <cmd> --help` で確認する既存の注意書き
    （[TPL-2084](../test-perspectives/TPL-2084-skill-cli-command-refs-drift.md)）に新コマンドも従う。
- changeset: `@karasu-tools/core` と `karasu` の両方を名指す（`.claude/rules/changesets.md` の
  cascade 非対称）。診断追加 + CLI 出力変更なので `minor`。

#### 4. AT

`docs/acceptance/reverse-synthesis-physical-fidelity.md` を新規作成する。TC は:

- `database` ブロックを持たないモデルで `resource X.Y` を書くと `unresolved-resource-ref` が出る
- ブロックはあるが leaf が無い場合も出る（メッセージが両者を区別する）
- entity の `table X.Y` が未宣言を指すと `unresolved-table-ref` が出る
- 正しく結線されたモデル・`examples/` の既存ファイルでは新 warning が 1 件も出ない（回帰）
- `coverage --format json` の `physical.unmappedButReferenced` が「参照はされているが mapping が
  無い leaf」だけを列挙する（`unreferenced` と混ざらない）
- bare `resource Order` → `entity Order { table DB.orders }` 経由の参照が `referencedByResource` に
  数えられる（canonical form の取りこぼしが無い）
- 物理宣言を持たないモデルで `coverage` の md 出力に物理セクションが現れない
- `domains` / `threshold` / `score` が physical セクション追加の前後で変わらない（既存 snapshot）

手動確認は現時点で見当たらない（すべて CLI / core のユニットで判定できる）。

#### 5. TPL

新規 TPL は起こさず、既存 TPL に back-ref する方針で臨む。case A は
[TPL-907](../test-perspectives/TPL-907-cross-reference-validation.md) が既に規定している
観点の未適用箇所であり、新しい観点ではない（TPL-907 の `known_consumers` / `discovered_from` に
本 Issue を足すのが正しい形）。`docs/spec/diagnostics.md` への追加は行の追加であって新規
`###` セクションではないので、`.claude/rules/spec-audit.md` の proactive TPL 要求は発火しない。
ただし `docs/spec/syntax.md` §S6 の対象範囲を書き換える場合は、その節に
`> Related TPLs:` として TPL-907 を追記する。

> 実装中に「dot 記法と bare 記法で存在検査が非対称になっていた」という失敗が
> TPL-907 の枠に収まらないと判断したら、そのとき proactive TPL を起こす。

#### 6. ADR 昇格

実装完了後、`docs/adr/2078-reverse-synthesis-physical-fidelity.md` として昇格する。
ADR-1895 は**書き換えず** `related_to` で繋ぐ — 本件は ADR-1895 の決定を覆すものではなく、
そこで引いた「意味層 / 構造層」の線を物理層に適用して欠けていた構造層の primitive を足す
追加決定だからである（`.claude/rules/adr.md`「既存 ADR を覆すとき」は supersede の話であり、
ここには当たらない）。

### 影響範囲・マイグレーション

- **既存ユーザーへの影響**: 新 warning が 2 つ増える。**既存の壊れたモデルは新たに警告を出す**
  — それが目的だが、`examples/` と AT fixture が該当しないことを実装時に確認する。
  render の終了コードは変わらない（warning は非ゼロ終了させない）。
- **ドキュメント更新**: `docs/spec/diagnostics.md` / `.ja.md`（行追加）、`docs/spec/syntax.md` §S6
  （対象範囲）、`.claude/skills/reverse-architecture/SKILL.md`（Phase 3/4 の到達状態）。
- **テスト・examples への影響**: `coverage` の JSON snapshot を持つ既存テストは `physical` キー
  追加で差分が出る。md 出力の snapshot も物理宣言を持つ fixture では差分が出る。

## 未解決の問い / 決めないこと

- **`unreferenced`（宣言されたが誰も参照しないテーブル）を診断にも出すか。** 現状は
  coverage 限定にする。karasu は論理/物理分離を掲げており、論理側の対応物を持たない物理宣言は
  それ自体としては正当。逆生成の文脈でのみ「掘り残し」の signal になる。運用して誤検知が
  少なければ info への昇格を後で検討する。
- **repair ループの自動化**。「`unmappedButReferenced` が空でなければ該当 domain を再 dive する」
  を CLI 側で駆動するかは決めない。ADR-1895 の分担どおり判断は agent 側に残す。
- **スライス分割**。core 診断と coverage 拡張は独立に出荷できるが、両方合わせても中規模なので
  1 PR で出す想定。レビューが長引くようなら診断側だけ先に切り出す。
