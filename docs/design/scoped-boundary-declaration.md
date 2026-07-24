# boundary をスコープ内に宣言する — 「層ごとの関心事」としての boundary 再定義

- **日付**: 2026-07-20
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#2036](https://github.com/kompiro/karasu/issues/2036)（parent [#1822](https://github.com/kompiro/karasu/issues/1822) comprehension）／設計 PR: [#2058](https://github.com/kompiro/karasu/pull/2058)
  - carve-out 先: [#2088](https://github.com/kompiro/karasu/issues/2088)（team 軸 `owns` — org は system ツリー外の横断オーバーレイなのでスコープ解決が効かない）、[#2065](https://github.com/kompiro/karasu/issues/2065)（cross-cutting concern labeling — user-defined tag の領分）
  - 顕在化元: [#1983](https://github.com/kompiro/karasu/issues/1983) / [#2034](https://github.com/kompiro/karasu/issues/2034)（drill-down grouping 正規化 → [ADR-1983](../adr/1983-boundary-drilldown-grouping.md)）
  - 関連 Issue: [#2032](https://github.com/kompiro/karasu/issues/2032)（cross-file contains の偽 not-found）、[#2076](https://github.com/kompiro/karasu/issues/2076) / [ADR-2076](../adr/2076-formatter-top-level-exhaustiveness.md)（`fmt` が top-level `boundary` を落とす問題 — マージ済み。本設計の前提）
  - notation の母体（設計）: [`system-view-grouping.md`](./system-view-grouping.md)（P2b `boundary`/`contains`、status: 部分昇格）
  - 関連 ADR: [ADR-1983](../adr/1983-boundary-drilldown-grouping.md)（per-view 交差セマンティクス。「per-level axis」却下・「nested boundary 構文」deferred の当事者 ADR）、[ADR-1884](../adr/1884-group-by-team-multi-system-root-per-system-frames.md)（同一ラベル・disjoint フレームの先例）、[ADR-927](../adr/927-import-system-nested.md)（同 id の意図的共存は正当）、[ADR-1858](../adr/1858-system-view-group-by-team.md)（`namespace` 語彙却下）、[ADR-1820](../adr/1820-notation-promotion-gate.md)（notation promotion gate）、[ADR-1827](../adr/1827-permalink-deep-element.md)（permalink deep anchor = leaf id）
  - 関連 TPL: [TPL-20260512-01](../test-perspectives/TPL-20260512-01-composite-key-must-cover-all-distinguishing-dimensions.md)、[TPL-20260716-02](../test-perspectives/TPL-20260716-02-view-state-gate-parity-across-surfaces.md)、[TPL-20260610-01](../test-perspectives/TPL-20260610-01-accepted-vocabulary-must-have-effect.md)、[TPL-20260510-02](../test-perspectives/TPL-20260510-02-round-trip-guarantee.md)、[TPL-20260623-02](../test-perspectives/TPL-20260623-02-validation-target-set-enumerates-all-kinds.md)
  - コード: `packages/core/src/parser/parser.ts`（`parseBoundaryBlock` `:1765`、root dispatch `:233`、block dispatch `parseBlockContentsWithProperties` `:370`、`buildBoundaryIndex` `:2013`）、`packages/core/src/types/ast.ts`（`BoundaryBlock` `:374`、`KrsFile.boundaryIndex` `:487`）、`packages/core/src/renderer/layout.ts`（`groupIdOf` `:1143`、`buildGroupFrames` `:68`、軸選択 `:1050`/`:1664`）、`packages/core/src/renderer/group-collapse.ts`（`groupStubId` `:25`）、`packages/core/src/formatter/formatter.ts`（`printFile` の top-level emit list `:113`）

---

> **前版（`node-reference-qualification.md`）からの撤回**
>
> 本 Design Doc は、同じ Issue [#2036](https://github.com/kompiro/karasu/issues/2036) を扱った前版
> `docs/design/node-reference-qualification.md` を**全面的に置き換える**（前版は本 PR で削除）。
>
> 前版の主軸は **「membership 参照の修飾記法」**（`contains Checkout.Payment` のような
> FQCN / 最小 disambiguating 接尾辞パスを `contains` / `owns` に導入する）だった。
> **これを撤回する。** 撤回理由は「筋が悪いから」ではなく、**問題そのものが消えるから**である —
> boundary を「層ごとの関心事」と定義し直して**各層のスコープ内に宣言できる**ようにすると、
> メンバはそのスコープの**兄弟**しか指さない。兄弟 id は `duplicate-node-id-parent`（**error**）で
> **既に一意**なので、**曖昧さが構造的に発生しない**。addressing 問題が発生しないなら
> addressing の記法も要らない。
>
> 前版の**問題設定**（「層をまたぐ id 衝突は正当であり、真の課題は指定方法である」）は
> 撤回しない — 衝突が正当であることは今も本設計の出発点である。撤回するのは
> **「指定方法を修飾記法で与える」という解**のほうである。
>
> 前版で維持されていて本版でも維持される結論: 層をまたぐ id 衝突は正当（global 一意性を強制しない）／
> `namespace` 語彙は却下済み／cross-cutting concern は tag の領分（[#2065](https://github.com/kompiro/karasu/issues/2065)）。

---

## 背景・課題

### 経緯 — 課題認識の三段変遷

| 段階 | 何を課題だと思っていたか | なぜ乗り越えたか |
| --- | --- | --- |
| 1. [#2036](https://github.com/kompiro/karasu/issues/2036) 起票時 | **id 衝突が bug** — service `Payment` と nested domain `Payment` があると `contains Payment` が両方を黙って取り込む（[ADR-1983](../adr/1983-boundary-drilldown-grouping.md) 末尾の「識別モデルの sharp edge」補足） | 衝突自体は**正当**。同 id の意図的共存は karasu が明示的に許した設計（[ADR-927](../adr/927-import-system-nested.md) L36） |
| 2. 前版 `node-reference-qualification.md` | **指定方法が無いこと**が課題 — 「どの層の `Payment` か」を書く記法が membership 参照サイトにだけ無い | 「どの層か」を**参照サイトで**書かせるのは、boundary が本来どの層のものかを**宣言サイトで**書けていないことの代償だった |
| 3. **本版** | **boundary の定義が曖昧だったこと**が課題 — boundary が「層ごとの関心事」なら、**宣言をその層のスコープに置く**のが素直で、addressing 問題は発生しない | — |

### 観測事実 1 — cross-layer boundary は 1 枚の枠として描画できない

深さの異なる members を持つ boundary は、**1 枚の枠にならず view ごとに断片化**する（compile probe 実測、[ADR-1983](../adr/1983-boundary-drilldown-grouping.md) 決定 2 として仕様化済み）:

```krs
system Shop {
  service CardVault {}                      // root system view
  service Billing {}                        // root system view
  service Checkout { domain Payment {        // drill: Checkout
    usecase Authorize                        // drill: Checkout > Payment
    usecase Capture
  } }
}
boundary pci "PCI" { contains CardVault contains Billing contains Payment contains Authorize contains Capture }
```

| view | `__group_pci__` frame | framed members |
| --- | --- | --- |
| root system view | 出る | `CardVault`, `Billing` |
| drill: `Checkout` | 出る | `Payment` |
| drill: `Checkout > Payment` | 出る | `Authorize`, `Capture` |

**枠は同一キャンバス上の peer を囲む図形**である。層をまたぐ 1 枚の枠は「囲む対象が同じ絵の上に無い」ので、
**意味として成立しない**（描画の都合ではなく定義上の帰結）。

> **混同してはならない 2 つのこと。** 上の断片化は「**1 枚の枠が層をまたげない**」という話である。
> 一方 **「同名の枠が各層に出ること」自体は是**であり、[ADR-1983](../adr/1983-boundary-drilldown-grouping.md)
> 決定 2 と [ADR-1884](../adr/1884-group-by-team-multi-system-root-per-system-frames.md)（multi-system の
> per-(system, team) フレーム）で既にそう動く。本設計は前者を否定し、後者を**積極的に肯定**する。

### 観測事実 2 — `boundary` をスコープ内に書くと今日は parse error

本設計で compile probe を実行（`/tmp/claude-1000/probe-sb/probe.ts`、`packages/core/src/compile/compile.ts` の `compile()` 直呼び）:

| 入力 | 結果 |
| --- | --- |
| `system Shop { … boundary payments "Payments" { contains Checkout contains Billing } }` | **parse error** — `unexpected-token-in-block`（`error`）× 8（`Boundary` / `Identifier` / `StringLiteral` / `LeftBrace` / `Contains` × 2 / `Identifier` × 2、いずれも `blockKind: ""`）+ 末尾 `}` が `unexpected-token-root` |
| `service Checkout { … boundary core "Core" { … } }` | **parse error** — 同型 |
| top-level `boundary payments "Payments" { contains Checkout contains Billing }` | 診断 **0 件**。`compile(src, { groupBy: "boundary" })` で svg に `__group_payments__` が 1 つ出る（現行挙動） |
| `system Shop { service Payment {} service Payment {} }` | `duplicate-node-id-parent`（**error**）+ `node-id-multiple-locations`（warning） |
| `system Shop { service Payment {} service Checkout { domain Payment {} } }` | 診断 **0 件**（層またぎ同 id は正当） |
| top-level `boundary dup "One" {…}` + `boundary dup "Two" {…}` | 診断 **0 件** — `duplicate-boundary-id` は**未実装**（probe 当時は spec にだけ書かれていた。2026-07-24 に spec 側を削除してドリフトは解消済み。下記参照） |

パーサの構造上の理由: root の dispatch は `parser.ts:233` の `case TokenType.Boundary`（`file.boundaries.push(this.parseBoundaryBlock())`）のみで、
ブロック内 dispatcher `parseBlockContentsWithProperties`（`parser.ts:370`）には `Boundary` の分岐が無く `unexpected-token-in-block`（`:646`）に落ちる。

## 概念の明確化 — 「横断的関心事」と「層ごとの関心事」

本設計の核心はここにある。**似て見える 2 つの概念を分離**する。

| | **横断的関心事**（cross-cutting concern） | **層ごとの関心事**（per-layer concern） |
| --- | --- | --- |
| 例 | PCI スコープ、個人情報を扱う、SLO tier、規制対象 | 「決済まわりのサービス群」「この service 内のコア domain 群」 |
| 何に付くか | **要素の属性** — 個々のノードが持つ性質 | **並びの構造** — ある層に並ぶ peer のまとまり |
| 1 枚の枠で描けるか | **描けない** — 対象が複数の層に散在する | **描ける** — 同一キャンバスの peer を囲む |
| 各層にどう現れるか | 各層への**射影**として現れる（同名の枠が層ごとに出る） | その層に**1 つの枠**として出る |
| 宣言の自然な位置 | 各ノード（属性なので要素側） | その層のスコープ（構造なのでスコープ側） |
| karasu における担当 | **tag** — [#2065](https://github.com/kompiro/karasu/issues/2065) | **`boundary`** — 本設計 |

**「同名の枠が各層に出る」という現象は、横断的関心事を各層に射影した結果**である。
今日の top-level `boundary pci` はその射影を「1 個の boundary 宣言」で代行しており、
**表現したいもの（属性）と表現手段（構造グルーピング）がずれている**。だから断片化が
「壊れているように見える」。実際には壊れていない — 概念が食い違っているだけである。

**本設計は `boundary` を「層ごとの関心事」と定義する。** 横断的関心事は boundary では扱わず、
tag（[#2065](https://github.com/kompiro/karasu/issues/2065)）に委ねる。

## 現状（インベントリ）

| 観点 | 現状 | 出典 |
| --- | --- | --- |
| `boundary` の配置 | **root のみ**。`parseBoundaryBlock` は `boundary <id> "label"? { (label\|description\|link\|contains)* }` | `parser.ts:233` / `:1765`（文法コメント `:1761`） |
| ブロック内の非ノードブロック先例 | `legend` はブロック内で受理される（`handleNestedLegend`） — スコープ内 `boundary` の直接の先例 | `parser.ts:641-644` |
| `boundaryIndex` | **フラット `Map<string, string>`**（node id → boundary id）、1:1、first-declared-wins、重複は info `duplicate-boundary-assignment` | `ast.ts:487` / `parser.ts:2013-2027` / `:276` |
| 軸選択 | `groupBy === "boundary" ? boundaryIndex : groupBy === "team" ? ownerIndex : undefined` が **2 箇所に重複** | `layout.ts:1050` / `:1664` |
| 枠生成 | `buildGroupFrames(nodes, groupOrder, groupIdOf, out, metaOf)` → `__group_${groupId}__` | `layout.ts:68-101`、呼び出し `:1453` / `:1937` |
| collapse stub id | `groupStubId(groupId, scope?)` → `__group_collapsed_${scope}_${groupId}__`。**`scope` は既に存在**（multi-system root で `sys.id` を渡す、#1884） | `group-collapse.ts:25-29`、caller `layout.ts:1713-1720` |
| 兄弟 id 一意性 | `duplicate-node-id-parent`（**error**）— 同一親直下でのみ発火 | `docs/spec/diagnostics.md:76`、probe 実測 |
| 層またぎ同 id | **正当**（診断ゼロ） | probe 実測、[ADR-927](../adr/927-import-system-nested.md) L36 |
| drill-down view を持つ kind | 構造由来（`children.length > 0` かつ内容あり）。drawio exporter は `system \| service \| domain \| usecase` を hardcode。加えて domain ごとの entity view、infra コンテナの drill view | `drill-down-svg.ts:64-66` / `:320-322`、`exporter/drawio/build-drawio-project.ts:127-129`、`view-extract.ts:1330` |
| `entity` の子 | ノード子を取れない（`parser.ts:628-638`） | 同左 |
| **formatter** | **`boundary` を 1 箇所も扱っていない** — `printFile` の emit list（`formatter.ts:113-120`）に `file.boundaries` が無く、`fmt` が **top-level boundary を黙って消す**。[ADR-2076](../adr/2076-formatter-top-level-exhaustiveness.md) で**修正済み**（マージ済み） | 同左 |
| `duplicate-boundary-id` | **どこにも存在しない**。当初は spec の 2 箇所（`syntax.md` / `syntax.ja.md` の boundary 節）にだけ error として書かれ実装が無いドリフトだったが、**2026-07-24 に spec 側の記述を削除して解消済み**（`DiagnosticParamsByCode` / parser / `render-diagnostic.ts` / `diagnostics.md` には元から無い）。probe でも発火せず | ドリフト解消済み |

### 同名 boundary が層をまたいでも壊れないことの検証

identity を「スコープ + id」にすると、`payments` という同じ名前の boundary が system スコープにも
service スコープにも出現しうる。**何が壊れるかを機構ごとに確認した結果、実質的に壊れるものは無い**:

| 機構 | 検証結果 | 根拠 |
| --- | --- | --- |
| **permalink アンカー** | 衝突しようがない — **boundary はアンカー名前空間に参加していない** | `docs/spec/permalink.md` に `boundary` の記載ゼロ。renderer の単一の生成点 `anchorId(viewPrefix, id)`（`svg-renderer.ts:74-76`）が出すのは `krs-<view>-<id>`（view ∈ system/deploy/org/matrix/entity）とノード id のみで、group frame は anchor を持たない |
| **collapse 状態** | **既存機構にそのまま乗る** — `groupStubId` は既に `scope` 引数を持ち `__group_collapsed_${scope}_${groupId}__` と namespace する（multi-system 用、#1884） | `group-collapse.ts:25-29` |
| **スタイル** | 同一性の論点が発生しない — **boundary / group frame を狙う `.krs.style` セレクタが存在しない** | `docs/spec/style.md` に `boundary` 0 hit、`packages/core/src/style/*.ts` に 0 hit |
| **`duplicate-boundary-id`** | 制約にならない — **spec からも削除済みで未実装**（上記ドリフト解消）。スコープ化を機に「**同一スコープ内の重複**」として**新規に**定義する | probe 実測 + grep |
| **`duplicate-boundary-assignment`**（info、実装済み） | 影響なし — ノードの親スコープは 1 つなので、あるノードが所属しうる boundary は同一スコープ内の boundary のみ。1:1 ルールはそのまま成立する | `parser.ts:2016-2027` |
| **タイポ検出** | **これが唯一の実質的コスト** — `contains paymnets` ならぬ `boundary paymnets` が黙って別 boundary になり、警告されない | 後述「未解決の問い」 |

## 制約・前提

- **層をまたぐ id 衝突は正当**。global 一意性は強制しない（[ADR-927](../adr/927-import-system-nested.md)）。
- **identity は author-given bare flat id のまま**。permalink deep anchor は leaf id 依存（[ADR-1827](../adr/1827-permalink-deep-element.md)）で、本設計はこれを触らない。
- **後方互換**: 既存の top-level `boundary` は**今日の挙動そのまま**残す。本設計は**追加的変更**であり、既存 `.krs` は 1 行も壊れない。
- **`owns`（team 軸）は対象外** → [#2088](https://github.com/kompiro/karasu/issues/2088)。`organization` は system ツリーの外にある横断オーバーレイなので「宣言スコープ」という概念自体が効かない。
- **横断的関心事は対象外** → [#2065](https://github.com/kompiro/karasu/issues/2065)（tag の領分）。
- **文法追加 → promotion gate 対象**（[ADR-1820](../adr/1820-notation-promotion-gate.md)）。ただし `boundary` は experimental のまま据え置き。

## 検討した選択肢

### 案 S（採用）: スコープ内 `boundary` 宣言

`boundary` ブロックを、ノードブロックの中に書けるようにする。

```krs
system Shop {
  service Checkout {
    domain Payment {}
    domain Cart {}
    boundary core "Core domains" {     // service Checkout スコープ
      contains Payment
      contains Cart
    }
  }
  service Billing {}
  service Wallet {}
  boundary payments "Payments" {        // system Shop スコープ
    contains Billing
    contains Wallet
  }
}
```

- メンバは**そのスコープの子**を **bare id** で指す。`Payment` は `Checkout` の子として一意（`duplicate-node-id-parent` が error）。
- 同名 `payments` を別スコープにも書いてよい。identity = **宣言スコープ + id**。
- 枠は**そのスコープのキャンバス**に 1 枚出る。断片化しない。

**メリット**

- **addressing 問題が構造的に消える** — 修飾記法が不要になる（前版の主軸を丸ごと不要化）。
- **宣言位置と意味が一致する** — 「この層の関心事」を「この層のブロック」に書く。読み手はスコープを見れば効果範囲が分かる。
- **[#2036](https://github.com/kompiro/karasu/issues/2036) の元症状が発生不能** — 兄弟しか指さないので多重取り込みが起こらない。
- **断片化も発生不能** — メンバは全員同じキャンバスに描かれる。
- **新語彙ゼロ**。既存の `boundary` / `contains` を置ける場所が増えるだけ。
- 完全な後方互換（追加的変更）。

**デメリット**

- 文法追加 → promotion gate 対象。
- `boundaryIndex` のスコープ化が必要（フラット `Map<string,string>` では「どの層の `Payment`」を表せない）。
- 同名 boundary の**タイポ検出**が効かない。
- **cross-service の domain 群をまとめる**用途はスコープに収まらない（下記「却下・非目標」）。

### 案 Q（却下）: membership 参照の修飾記法 — 前版の主軸

`contains Checkout.Payment` のように、参照サイトで層を修飾する（FQCN または最小 disambiguating 接尾辞パス）。

**却下理由**: 案 S を採ると**解くべき曖昧性が存在しなくなる**。修飾記法は「複数の層に同 id があるとき
どれを指すか」を書く道具だが、案 S ではメンバ候補が**兄弟だけ**に限定され、兄弟 id は error 一意なので
候補が常に 0 個か 1 個しかない。**問題が無いところに記法を足すのは構文表面積の純増**であり、
experimental notation に corpus evidence ゼロで表面積を足さないという規律
（[ADR-1820](../adr/1820-notation-promotion-gate.md)）に反する。

加えて、修飾記法は「boundary は層をまたいで宣言してよい」という前提を温存する。その前提こそが
概念の混同（横断的関心事 vs 層ごとの関心事）の源だった。

### 案 N（不採用・現状維持）: 何もせず、断片化を仕様として受け入れる

[ADR-1983](../adr/1983-boundary-drilldown-grouping.md) は既に per-view 交差を仕様化しており、
「壊れてはいない」。しかし**著者が「この service 内の domain 群」を表現する手段が無い**ままで、
[#2036](https://github.com/kompiro/karasu/issues/2036) の多重取り込みも残る。

### 隣接する既決事項との関係（重要）

[ADR-1983](../adr/1983-boundary-drilldown-grouping.md) は 2 つの近い案を退けている。**本案はどちらとも別物**である:

| ADR-1983 が退けた案 | その理由 | 本案との違い |
| --- | --- | --- |
| **per-level axis**（`boundary payments service { … }` のようなレベル**指定子**の新設） | 「member は id 参照であり、その id がどのレベルで描画されるかはモデル構造が既に決めている。flat index × 描画レベルの交差で同じ結果が得られ、著者に冗長な指定を課すだけ」 | 本案は**レベル指定子を足さない**。スコープは**宣言をどこに書いたか**（lexical な位置）から決まる。動機も「レベルの選択」ではなく「**どのノードを指すか**の一意化」であり、冗長な指定ではなく**曖昧性の除去**である |
| **nested `boundary` 構文**（deferred、却下ではない） | 「boundary 同士の階層という直交した別問題を解いてしまう。`boundaryIndex` の 1:1 前提が壊れ機構コストが跳ねる」 | 本案は **boundary の中に boundary を入れる話ではない**。ノードブロックの中に boundary を置く話であり、boundary 同士の階層は生じない。**1:1 前提も壊れない** — ノードの親スコープは 1 つなので、あるノードが所属しうる boundary は 1 スコープ内に限られる |

とくに per-level axis の却下理由の中核は「**flat index × 描画レベルの交差で同じ結果が得られる**」という前提だが、
これは **id が一意な場合にしか成立しない**。同 id が複数の層に存在するとき、flat index は交差では絞り込めず
**該当する全ノードを取り込む**（＝ #2036 の症状そのもの）。この過剰捕捉は ADR-1983 自身が末尾の
「識別モデルの sharp edge」補足で認めており、**却下理由の前提はその補足と両立しない**。本案はまさに
その前提が崩れる領域（同 id の共存）を扱うため、per-level axis の却下は本案に及ばない。

ただし ADR-1983 の「`boundaryIndex` の 1:1 前提」への懸念は、**キーの次元**という形で本案にも部分的に当てはまる（後述の実装方針で扱う）。

なお本案は experimental notation への**文法追加**であり、[ADR-1820](../adr/1820-notation-promotion-gate.md)
の promotion gate の対象になる（per-level axis 却下理由の 3 点目と同じ土俵）。ただし本案の動機は
「corpus 証拠のない利便性の追加」ではなく、(a) 過剰捕捉という**構造的な誤りの除去**、(b) 宣言位置と
意味論の一致、(c) 「boundary は層ごとの関心事」という**概念定義の確定**であり、gate の趣旨（証拠なき
構文表面積の膨張を防ぐ）とは動機の性質が異なる。この点は実装 ADR で明示的に論じる。

## 比較

| 観点 | 案 S（スコープ内宣言） | 案 Q（修飾記法） | 案 N（現状維持） |
| --- | --- | --- | --- |
| addressing 曖昧性 | **構造的に発生しない** | 記法で解消する | 残る |
| [#2036](https://github.com/kompiro/karasu/issues/2036) の多重取り込み | **発生不能** | 著者が修飾すれば回避 | 残る |
| 断片化 | **発生不能** | 残る（別問題として） | 残る |
| 宣言位置と意味の一致 | **一致する** | しない（top-level のまま） | しない |
| 新語彙 | ゼロ（配置場所のみ） | ゼロ（引数形のみ） | — |
| 構文表面積 | 配置規則が増える | 参照の文法が増える | 不変 |
| 後方互換 | 完全（追加的） | 完全（bare 継続） | — |
| promotion gate | 対象 | 対象 | 外 |
| 主な実装コスト | `boundaryIndex` のスコープ化 | `boundaryIndex` 再キー + 接尾辞照合解決 | ゼロ |
| cross-service の domain 群 | 表現できない（今日も不可なので後退ではない） | 表現は書けるが**描画できない** | 不可 |

## 現時点の方針

**案 S（スコープ内 `boundary` 宣言）を採用する。**

`boundary` を「**層ごとの関心事**」と定義し、各層のスコープで宣言できるようにする。
修飾記法（案 Q）は**却下**する — 解くべき問題が消えるため。

### 決定事項

1. **`boundary` ブロックをノードブロックの中に宣言できるようにする。**
2. **メンバはそのスコープの子を bare id で指す。** 兄弟 id は `duplicate-node-id-parent`（error）で既に一意なので、曖昧さが構造的に発生しない。
3. **修飾記法（FQCN / 最小接尾辞パス）は導入しない。** 前版の主軸を撤回する。
4. **同名 boundary を層をまたいで使ってよい。** identity = **宣言スコープ + id**。名前は単なるラベルであり、**「同名が同じ関心事を意味するか」は規定しない**。
5. **後方互換**: 既存の top-level `boundary` は「**system view トップ階層スコープ**」の記法として残し、**今日の挙動を変えない**。
6. **`owns`（team 軸）は対象外** → [#2088](https://github.com/kompiro/karasu/issues/2088)。
7. **横断的関心事は対象外** → [#2065](https://github.com/kompiro/karasu/issues/2065)（tag の領分）。

### 文法設計

#### 配置規則 — どの kind の中に置けるか

**原則: 「キャンバスが描かれる場所には boundary を宣言できる」。** boundary は同一キャンバス上の
peer を囲む枠なので、キャンバスと 1:1 に対応させるのが唯一の自己整合的な規則である。

karasu の drill-down は構造由来（`children.length > 0` かつ内容あり、`drill-down-svg.ts:64-66`）なので、
**ノード子を持ちうる全 kind** が候補になる:

| kind | キャンバスの有無 | boundary を置けるか（提案） |
| --- | --- | --- |
| `system` | root system view | **可** |
| `service` | drill-down view | **可** |
| `domain` | drill-down view（usecase / resource）+ 当該 domain の entity view | **可** |
| `usecase` | drill-down view | **可** |
| `database` / `queue` / `storage` | drill-down view（`table` / `queue-item` / `bucket`） | **要判断**（下記 未解決） |
| `entity` | ノード子を取れない（`parser.ts:628-638`） | **不可** |
| `resource` / `user` / `client` / leaf infra | 子を持たない | **不可** |

`domain` が **2 つのキャンバス**（usecase drill-down と entity view）を持つ点は問題にならない。
[ADR-1983](../adr/1983-boundary-drilldown-grouping.md) 決定 1 の per-view 交差がそのまま効き、
**各キャンバスはそこに描かれる member だけで枠を組む**。`domain Payment { boundary x { contains Order contains Item } }`
で `Order` / `Item` が entity なら、枠は entity view に出て usecase drill-down には出ない（member 不在 → 決定 3 により枠なし）。

パーサ実装上のフック点は `parseBlockContentsWithProperties`（`parser.ts:370`）で、
**`legend` のネスト受理（`handleNestedLegend`、`parser.ts:641-644`）が直接の先例**になる。

#### メンバ解決規則 — 直下の子に限る

**そのスコープの直下の子（direct children）に限る。子孫は許さない。**

根拠は 2 つあり、どちらも決定的である:

1. **一意性の保証範囲と正確に一致する。** 本設計の全体が「兄弟 id は error 一意」に依存している。
   子孫まで許すと、その保証の外に出た瞬間に**曖昧性が復活し、修飾記法が再び必要になる**
   （例: `service Checkout { domain Payment {} domain Cart { usecase Payment } }` で `contains Payment` が 2 候補）。
   直下の子に限ることは、案 S を案 S たらしめている条件そのものである。
2. **枠が囲む対象と一致する。** そのスコープのキャンバスに top-level ノードとして描かれるのは直下の子である。
   子孫はそのスコープのキャンバスには（コンテナとして畳まれた姿でしか）現れないので、囲む対象にならない。

孫をグルーピングしたければ、**孫のスコープに boundary を書く**。これは制限ではなく、
「層ごとの関心事は層ごとに書く」という本設計の定義そのものである。

#### top-level `boundary` の互換規定

- 既存の top-level `boundary` は **system view トップ階層スコープ**の記法として存続し、**挙動は不変**。
- したがって top-level boundary は今日どおり **kind 無制限・レベル無制限・cross-file** にメンバを取れ、
  複数レベルにまたがれば従来どおり複数フレームに断片化する（[ADR-1983](../adr/1983-boundary-drilldown-grouping.md) 決定 2）。
- **スコープ内 boundary は新しい制限付きの形**であり、top-level 形を後から狭める（＝破壊的変更）ことは本設計では**しない**。
  両形の最終的な統合は未解決の問いに残す。

#### 同名 boundary の扱い

- **identity = 宣言スコープ + id。** 名前は単なるラベルである。
- **「同名が同じ関心事を意味するか」は規定しない。** 上記「壊れることの検証」のとおり、
  permalink / collapse / style / 診断のいずれも**現時点でこの意味論に依存していない**。
  意味論を規定せずに実装でき、規定しても現時点で観測可能な差が生まれない。
- 方針は **「決められるようになるまで決めない」**。将来 concern overview（[#2065](https://github.com/kompiro/karasu/issues/2065)）や
  タイポ検出を入れるとき、初めて「同名 = 同一概念か」を決める必要が生じる。そのとき決める。

### 実装の指針

1. **parser — 配置の受理**
   - `parseBlockContentsWithProperties`（`parser.ts:370`）に `TokenType.Boundary` の分岐を追加（`handleNestedLegend` の隣、`:641-644`）。
   - `parseBoundaryBlock`（`parser.ts:1765`）は**そのまま再利用**できる（ブロック本体の文法は同一）。
   - 配置不可の kind（`entity` 等）では専用診断を出す（`infra-not-in-context` `:604-611` / `entity-not-in-domain` `:613-623` と同じ register）。
   - 受理 kind の集合は**全 kind 列挙で確定**する（[TPL-20260623-02](../test-perspectives/TPL-20260623-02-validation-target-set-enumerates-all-kinds.md)）。
2. **AST — スコープの保持**
   - `BoundaryBlock`（`ast.ts:374`）は形を変えずに済むが、**どのスコープで宣言されたか**を保持する必要がある
     （親ノードの `children` に持たせるか、`KrsFile` 側に scope path 付きで集約するか）。
   - `KrsFile.boundaries`（`ast.ts:483`）は top-level 専用のまま維持し、スコープ内 boundary は別経路にするのが後方互換上は素直。
3. **`boundaryIndex` のスコープ化（本設計の中核実装コスト）**
   - 現状 `Map<string, string>`（node id → boundary id、`ast.ts:487` / `parser.ts:2013`）は
     **node id が global に一意である前提**を暗黙に置いており、その前提は成り立たない。
   - **区別属性（宣言スコープ）をキーに含める**必要がある（[TPL-20260512-01](../test-perspectives/TPL-20260512-01-composite-key-must-cover-all-distinguishing-dimensions.md)）。
     形としては `Map<scopePath, Map<childId, boundaryId>>` が素直 — layout は slice（= スコープ）単位で呼ばれるので、
     `groupIdOf`（`layout.ts:1143`）を組む時点で該当スコープの内側 Map を選べる。
   - 軸選択は `layout.ts:1050` と `:1664` の **2 箇所に重複**しているので、両方を揃える（片方だけ直すと surface 間が割れる — [TPL-20260716-02](../test-perspectives/TPL-20260716-02-view-state-gate-parity-across-surfaces.md)）。
   - top-level boundary は従来のフラット index のまま扱い、スコープ index と併存させる（互換規定の帰結）。
4. **collapse**
   - `groupStubId(groupId, scope?)`（`group-collapse.ts:25`）の `scope` 引数を活用する。**新機構は不要**。
     現在 `scope` を渡すのは multi-system root（`layout.ts:1713-1720`、`sys.id`）だけなので、
     スコープ内 boundary でも同様に宣言スコープを渡せば stub id が namespace される。
5. **formatter（`fmt`）**
   - 前提の fmt 修正は **[ADR-2076](../adr/2076-formatter-top-level-exhaustiveness.md) としてマージ済み**。修正前は — 現状 `printFile` の emit list（`formatter.ts:113-120`）に
     `file.boundaries` が無く、`fmt` は top-level boundary を**黙って消す**（`formatter.ts` に `boundary` 0 hit）。
   - ADR-2076 が追加した `renderBoundaryBlock` を、**ノードブロックのレンダリング経路からも呼ぶ**必要がある。
   - **注意**: ADR-2076 の網羅性ガード（同 ADR 決定 2 が期待集合を `KrsFile` の配列プロパティから導出すると定めている）（`formatter-top-level-coverage.test.ts`）は `KrsFile` の配列プロパティ由来なので
     **top-level しか守らない**。スコープ内 boundary の emit 漏れは検出されない → 別途 round-trip テストが要る
     （[TPL-20260510-02](../test-perspectives/TPL-20260510-02-round-trip-guarantee.md)）。
6. **`duplicate-boundary-id` の新規導入**
   - 「**同一スコープ内で同 id の boundary が 2 つ**」として定義し、実装する
     （`collectTeamIds` の `duplicate-team-id`、`parser.ts:2032` が直接の雛形）。
     2026-07-24 に spec 側の記述を削除したので、これは既存の約束を実装するのではなく
     **新しい規則を足す**作業になる（下記「未解決の問い」も参照）。
   - `DiagnosticParamsByCode`（`ast.ts`）→ `render-diagnostic.ts` の exhaustive switch → `en.ts` / `ja.ts` → `diagnostics.md` / `diagnostics.ja.md`。
     completeness は `packages/core/src/types/diagnostics-catalog.test.ts` が強制する。
   - `contains-target-not-found`（`reference-validation.ts:54-65`）の探索範囲を、スコープ内 boundary では**当該スコープの直下の子**に限定する。
7. **spec 改訂**
   - `docs/spec/syntax.md` の § Grouping the system view（`:943-1010`）を改訂（+ `syntax.ja.md`）。
     - 「Top-level declaration, like `organization`」（`:969`）を「top-level またはノードブロック内」に。
     - 配置可能 kind の表、メンバ = 直下の子の規則、identity = スコープ + id、top-level 互換規定を追加。
     - `boundaryIndex` の記述（`:989`）を「per-scope」に更新。
     - `duplicate-boundary-id` を診断一覧に追加（2026-07-24 の削除以降、spec には存在しない）。
   - 章末 `> Related TPLs:` の back-ref を更新する。
8. **examples**: スコープ内 boundary を使う例を 1 本追加（app が開くのは `index.krs`）。
9. **changeset**: `@karasu-tools/core` + `karasu` を **minor**（後方互換な文法追加）。
   CLI は core を devDependency（esbuild バンドル）に持つため **cascade しない** ので、`.claude/rules/changesets.md` どおり両方を明示的に名指す。
10. **AT**: `docs/acceptance/` に新規（下記「AT 案」）。
11. **ADR 昇格**: 実装完了後 `docs/adr/YYYYMMDD-NN-scoped-boundary-declaration.md` として昇格し、本 Design Doc を同 PR で削除する。

### この設計が同時に解決すること

| 症状 | 解決のされ方 |
| --- | --- |
| (a) [#2036](https://github.com/kompiro/karasu/issues/2036) の元症状（`contains Payment` が複数層のノードを黙って取り込む） | **構造的に発生不能** — メンバ候補が兄弟に限られ、兄弟 id は `duplicate-node-id-parent`（error）で一意 |
| (b) cross-depth boundary の 3 view への断片化 | **構造的に発生不能** — メンバは全員同じキャンバスに描かれる |
| (c) 宣言位置と意味の不一致 | **一致する** — 「この層の関心事」を「この層のブロック」に書く |

いずれも「診断を足して警告する」のではなく「**その状態を書けなくする**」形の解決である。

### 影響範囲・マイグレーション

- **既存ユーザー**: **影響なし**。既存の top-level `boundary` は挙動不変で、スコープ内宣言は純粋な追加。
  今日 parse error だった記述が通るようになるだけで、通っていた記述の意味は変わらない。
- **ドキュメント**: `docs/spec/syntax.md`（+ `syntax.ja.md`）の boundary 節、`docs/spec/diagnostics.md`（+ ja、`duplicate-boundary-id` 1 行）。
- **examples**: 1 本追加。
- **他 PR との順序**: fmt の top-level boundary 落ちは [ADR-2076](../adr/2076-formatter-top-level-exhaustiveness.md) でマージ済みのため、順序制約は解消済み。

## 却下・非目標

- **修飾記法（FQCN / 最小接尾辞パス）**: **却下**（前版の主軸の撤回）。スコープ宣言によって
  解くべき曖昧性が消えるため不要。問題が無いところに構文表面積を足さない
  （[ADR-1820](../adr/1820-notation-promotion-gate.md)）。
- **hard global id 一意性の強制**: 却下。層をまたぐ衝突は**正当**であり、意図的な同 id 共存
  （[ADR-927](../adr/927-import-system-nested.md) L36）と段階 severity の設計に反する。
- **identity = path 化**: 却下。bare-id 参照と permalink deep anchor（leaf id 依存、
  [ADR-1827](../adr/1827-permalink-deep-element.md)）を壊す。本設計が
  スコープ付きにするのは **boundary の identity** だけで、**ノードの identity は不変**。
- **`namespace` 語彙 / 宣言サイトの id name-scope 化**: [ADR-1858](../adr/1858-system-view-group-by-team.md) L57 /
  [`system-view-grouping.md`](./system-view-grouping.md) L240 で却下済み（id を `payments.Billing` に修飾する＝過剰約束）。
  **本案はそれとは別物** — 本案が動かすのは **`boundary` ブロックの配置**であって、**ノード id を修飾しない**。
- **`owns`（team 軸）への同種の適用**: 非目標 → [#2088](https://github.com/kompiro/karasu/issues/2088)。
  `organization` は system ツリーの**外**にある横断オーバーレイなので、「宣言スコープ」という概念が効かない。
- **横断的関心事（PCI スコープ等）を `boundary` で表現する**: 非目標 → [#2065](https://github.com/kompiro/karasu/issues/2065)。
  要素の属性であって並びの構造ではないので tag の領分（上記「概念の明確化」）。
- **cross-service の domain 群を 1 つの boundary にまとめる**: 非目標。スコープに収まらない。
  **ただしこれは後退ではない** — 今日も 1 枚の枠としては描画できず、複数フレームに断片化するだけである
  （上記「観測事実 1」）。表現したいものが横断的関心事なら [#2065](https://github.com/kompiro/karasu/issues/2065) の領分。
- **boundary 同士の階層（nested boundary）**: 非目標。[ADR-1983](../adr/1983-boundary-drilldown-grouping.md) が
  deferred にした別問題であり、本案は boundary の中に boundary を入れない。
- **タイポ検出診断の同時出荷**: 本設計では**決めない**（下記 未解決）。

## promotion gate 整理（[ADR-1820](../adr/1820-notation-promotion-gate.md)）

- 文法追加（配置場所の拡張）→ **gate 対象**。ただし `boundary` は **experimental のまま据え置き**であり、
  本件は experimental 層内での配置規則の確定である（[ADR-1983](../adr/1983-boundary-drilldown-grouping.md) L54 の
  「within-experimental の挙動変更 = 通常の minor」と同じ扱い）。
- 正当化は corpus evidence だけに寄りかからない。**概念の定義を明確化した帰結として配置が決まる**という
  論拠を併記する — boundary を「層ごとの関心事」と定義するなら、宣言がその層に置けないのは
  定義と文法の不整合である。本設計はその不整合の是正であって、新機軸の導入ではない。
- 構文表面積は**純減方向**である点も併記する。案 Q（修飾記法）を採れば `contains` の引数文法が
  恒久的に複雑化したが、案 S は既存ブロックを置ける場所を増やすだけで、`contains` の文法は bare id のまま変わらない。

## TPL

**本設計を支える既存 TPL**

- [TPL-20260512-01](../test-perspectives/TPL-20260512-01-composite-key-must-cover-all-distinguishing-dimensions.md) — **最重要**。
  複合キーは区別属性をすべて含めよ。`boundaryIndex` を `Map<nodeId, boundaryId>` のまま使うと
  「どのスコープの `Payment` か」を落とす。スコープ化の構造的根拠。
- [TPL-20260716-02](../test-perspectives/TPL-20260716-02-view-state-gate-parity-across-surfaces.md) — view-state gate の全 surface parity。
  軸選択が `layout.ts:1050` と `:1664` の 2 箇所に重複しており、片方だけ直すと interactive / export で挙動が割れる
  （#1983 で実際に 3 番目の gate の緩和漏れをこの観点が検出した）。
- [TPL-20260610-01](../test-perspectives/TPL-20260610-01-accepted-vocabulary-must-have-effect.md) — 受理語彙は効果を持て。
  スコープ内 `boundary` を parse できるようにしただけで枠が出ない（parse-and-vanish）状態を禁ずる。
- [TPL-20260510-02](../test-perspectives/TPL-20260510-02-round-trip-guarantee.md) — round-trip 保証。
  **今回特に効く** — top-level boundary が `fmt` で消える bug（[#2076](https://github.com/kompiro/karasu/issues/2076)）が
  現に起きており、[ADR-2076](../adr/2076-formatter-top-level-exhaustiveness.md) の網羅性ガードは `KrsFile` の配列プロパティ由来で
  **top-level しか守らない**。スコープ内 boundary は同じ穴に落ちうる。
- [TPL-20260623-02](../test-perspectives/TPL-20260623-02-validation-target-set-enumerates-all-kinds.md) — valid-target は全 kind 列挙。
  「boundary を置ける kind」「メンバになれる kind」の両方を `LogicalNodeKind`（`ast.ts:6-20`）の全列挙で確定する。

**前版から引き継がない TPL**

- `TPL-20260714-01`（cross-domain entity の修飾参照）は前版で案 B（修飾記法）の直接先例として引用していたが、
  **修飾記法を却下したため本設計の論拠ではなくなった**。entity 関連の `DomainId.EntityId` は引き続き有効な既存仕様であり、
  本設計はそれを変更しない。

**新規 proactive TPL — 本ブランチでは起こさない（判断と理由）**

候補は「**スコープ付きの概念を持つ index は、スコープをキーに含めなければならない**」だが、これは
[TPL-20260512-01](../test-perspectives/TPL-20260512-01-composite-key-must-cover-all-distinguishing-dimensions.md) が
既に一般形として所有しており、近い重複を新設するより**当該 TPL に本件を known_consumers / discovered_from として追記する**のが適切である。

`docs/spec/` に新規節を追加する PR は proactive TPL 同梱が必要（`CLAUDE.md`）だが、本 PR は
**`docs/design/` のみ**を触り、`syntax.md` の改訂は実装 PR で行う。双方向 spec back-ref（spec 章末の
`> Related TPLs:` ↔ TPL の「## 派生元 spec」）は spec 節が存在して初めて閉じられるため、**実装 PR に deferral する**。
母体の P2b design doc も同じ deferral 先例を持つ（[`system-view-grouping.md`](./system-view-grouping.md) L357）。

実装 PR で起こす/更新する内容のドラフト:
- [TPL-20260512-01](../test-perspectives/TPL-20260512-01-composite-key-must-cover-all-distinguishing-dimensions.md) に
  `boundaryIndex`（scope + node id）を known_consumers として追記し、`syntax.md` の boundary 節へ back-ref。
- [TPL-20260510-02](../test-perspectives/TPL-20260510-02-round-trip-guarantee.md) の網羅性チェックリストに
  「**ネストされた構文も round-trip 対象** — top-level 配列由来のガードはネスト構文を守らない」を追加。

## AT 案（人間の目視が必要な項目のみ、実装 PR で `docs/acceptance/` に起票）

自動テストで足りるもの（parse 受理 / 診断発火 / index のキー / fmt round-trip）は AT にしない。目視が要るのは:

- **枠が正しいキャンバスに 1 枚だけ出ること**: service スコープに `boundary core { contains Payment contains Cart }` を
  書いた `index.krs` を app で開き、*Group by: boundary* で **drill `Checkout` のビューにだけ** `Core domains` の枠が
  1 枚出て、root system view には出ないこと（目視）。
- **同名 boundary が層をまたいでも各層で独立に見えること**: `payments` を system スコープと service スコープの
  両方に書き、root と drill の**それぞれで別の枠**として描かれ、片方を collapse してももう片方が
  展開されたままであること（collapse 状態が混線しないことの目視確認 — stub id namespace の実挙動）。
- **既存モデルが見た目ごと不変であること**: 既存の top-level boundary だけを使う `index.krs` を
  実装前後で開き、枠の位置・ラベル・collapse 挙動が変わらないこと（後方互換の目視）。

## 未解決の問い / 決めないこと

- **メンバ解決を直下の子に限るか、子孫も許すか** — 本 doc は「**直下の子に限る**」を強く推奨し根拠も示したが、
  実装前に確定させる（子孫を許すと曖昧性が復活し、案 Q が再び必要になるという連鎖がある）。
- **boundary を置ける kind の集合** — `system` / `service` / `domain` / `usecase` は確定でよい。
  **infra コンテナ（`database` / `queue` / `storage`）を含めるか**は要判断。
  spec 上は `table` / `queue-item` / `bucket` が store の drill view で枠対象になる（`syntax.md:978-981`）ので
  原則上は「可」だが、corpus evidence がゼロなので初回は除外して後から広げる選択もある。
  `LogicalNodeKind` の全列挙で確定する（[TPL-20260623-02](../test-perspectives/TPL-20260623-02-validation-target-set-enumerates-all-kinds.md)）。
- **`duplicate-boundary-id` の新規導入** — 「同一スコープ内の重複」で error とする方針は決めたが、
  top-level 形（グローバル 1 スコープ扱い）との整合と、**既存モデルの新規 error 化**リスクの評価が残る。
  2026-07-24 に spec の記述を削除した（実装の無い約束を残さないため）ので、この診断は
  「spec が既に約束しているものを実装する」のではなく「新しい規則を足す」位置づけになった。
  同 id の boundary ブロックは現状ひとつの枠にマージされるだけなので、error 化は既存モデルを
  壊しうる挙動変更であり、experimental notation の gate（[ADR-1820](../adr/1820-notation-promotion-gate.md)）で扱う。
- **スコープ化した `boundaryIndex` の実装コスト** — `Map<scopePath, Map<childId, boundaryId>>` 形の妥当性、
  layout の 2 箇所の軸選択（`:1050` / `:1664`）の統合可否、`compile-diff.ts:231-245` /
  `fs/import-resolver.ts:247-253` の index マージ経路への波及。
- **タイポ検出をいつ足すか** — 同名 boundary を許すと `paymnets` が黙って別 boundary になる。
  唯一の実質的コストだが、(a) 後から warning を足せる（後方互換）、(b) [#2065](https://github.com/kompiro/karasu/issues/2065) の
  タグ登録機構が「宣言済みの concern 名」の集合を持てば同じ検出を吸収しうる、ため **今は決めない**。
- **「同名 = 同じ関心事」の意味論** — 意図的に**未規定**のまま残す（現時点でどの挙動もこの意味論に依存していないため）。
  規定が必要になるのは concern overview やタイポ検出を入れるときで、そのとき決める。
- **top-level 形とスコープ形の最終的な統合** — top-level を「system view トップ階層スコープ」として
  存続させるが、長期的に「top-level もスコープ規則（直下の子のみ）に揃える」＝破壊的変更を行うかは
  本設計では決めない。experimental notation なので余地はある（[ADR-1820](../adr/1820-notation-promotion-gate.md)）。
- **multi-file との相互作用**（[#2032](https://github.com/kompiro/karasu/issues/2032)） — top-level boundary は
  cross-file にメンバを取れるが、スコープ内 boundary はスコープの子に限るので **cross-file 参照が原理的に起きない**。
  ただし import 先で同じスコープが再オープンされる形（nested import、[ADR-927](../adr/927-import-system-nested.md)）が
  あるかは実装時に確認する。
