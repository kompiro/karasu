# .krs.style 構文リファレンス

> [English](style.md) · **日本語**（このファイル）

## セレクタの種類

| セレクタ | 例 | 対象 |
|---------|-----|------|
| 種別 | `service` | 指定した種別の全ノード |
| 複数種別 | `service, domain` | いずれかの種別の全ノード |
| タグ | `[external]` | 指定タグを持つ全ノード |
| アノテーション | `@deprecated` | 指定アノテーションを持つ全ノード |
| 複合（種別+タグ） | `service[external]` | 種別とタグの両方に一致 |
| 複合（タグ+アノテーション） | `[external]@deprecated` | タグとアノテーションの両方に一致 |
| 複合（種別+タグ+アノテーション） | `service[external]@deprecated` | すべてに一致 |
| ID | `#ECommerce` | 特定ノードのみ |
| エッジ | `edge` | 全エッジ |
| エッジ+タグ | `edge[async]` | 指定タグのエッジ |
| エッジ ID | `edge#criticalWrite`、`edge#A->B`、`edge#A-->B` | 特定のエッジのみ |

---

## 詳細度ルール（カスケード）

| セレクタ | スコア |
|---------|-------|
| 種別（`service`） | 1 |
| タグ（`[external]`） | 10 |
| アノテーション（`@deprecated`） | 10 |
| 種別+タグ（`service[external]`） | 11 |
| タグ+アノテーション（`[external]@deprecated`） | 20 |
| 種別+タグ+アノテーション | 21 |
| ID（`#ECommerce`） | 100 |
| エッジ ID（`edge#criticalWrite`） | 101（ID 100 + `edge` 種別 1） |

同スコアなら後に書いた方が優先（CSS同様）。

---

## エッジ ID セレクタ（`edge#<id>`）

特定のエッジ 1 本だけにスタイルを適用する。`<id>` はエッジの **canonical id** で、
パース後に以下の規則で確定する:

1. `.krs` でエッジ宣言（または `usecase` の `resource` 行）に `#<id>` が
   書かれていれば、その author id がそのまま canonical id になる
2. それ以外は **base 形式** `<from><arrow><to>`。`->` は sync、`-->` は async

```css
/* `.krs` 側で  A -> B "primary" #criticalWrite  と書かれた場合 */
edge#criticalWrite { color: #EF4444; }

/* author id が無い場合の base 形式 */
edge#A->B { color: #00FF00; }

/* async の base 形式 */
edge#A-->B { stroke-width: 2px; }
```

同じ base id を持つエッジが 2 本以上あって両方に author id が無い場合、
パーサが `ambiguous-edge-base` warning を出し、`edge#<base>` セレクタは
**どちらにも一致しない**。区別したい場合は `.krs` 側でいずれかに `#<id>` を
付ける。詳細は [`docs/spec/syntax.md`](syntax.md#edge-declaration) と
[`docs/design/edge-id-selector.md`](../design/edge-id-selector.md) を参照。

### タグセレクタを優先すべきケース

「read / write の見た目を変えたい」のような **論理分類による上書き** は
`edge#<id>` ではなく `edge[write]` / `edge[read]` を使うこと。タグセレクタは
論理分類に追従するので、`usecase` の `operations` を変更しただけで対象エッジが
正しく追従する。`edge#<id>` は「**この特定のエッジ**」を直接指したい場合に
限定して使う。

---

## プロパティ一覧

```css
/* ノード用プロパティ */
background-color: #1D4ED8;
color:            #DBEAFE;       /* テキスト色 */
border-color:     #1E40AF;
border-width:     2px;
border-style:     solid;         /* solid | dashed | dotted */
border-radius:    8px;
font-size:        13px;
font-weight:      bold;          /* normal | bold */
font-family:      "Noto Sans JP", sans-serif;
opacity:          0.6;

/* エッジ用プロパティ */
color:            #94A3B8;
stroke-width:     1.5px;
font-size:        11px;
direction:        auto;          /* up | down | left | right | auto（ヒント、後述） */

/* karasu固有プロパティ（CSS非対応のため例外） */
shape:            box;           /* box | user | cylinder | queue | hexagon | cloud | url("...") */

/* アノテーション用プロパティ（バッジ表示） */
badge-color:      #EF4444;
badge-icon:       "⚠";
badge-label:      "非推奨";
```

---

## shape プロパティ

| キーワード | 形状 | 主な用途 |
|-----------|------|---------|
| `box` | 角丸長方形 | service, domain（デフォルト） |
| `user` | 人型（頭+体） | user |
| `cylinder` | 円柱 | db系 |
| `queue` | 横向き円柱 | queue系 |
| `hexagon` | 六角形 | マイクロサービス |
| `cloud` | 雲形 | 外部クラウド |

カスタム形状（SVGファイル参照）：

```css
service[external] {
  shape: url("shapes/cloud.svg");
}
```

---

## レイアウトヒント（escape hatch）

> **最後の手段として使う。** karasu の auto-layout（kind と到達性で決まる
> 行配置、直交エッジルーティング、ポート分散）はほとんどの図を入力なしで
> 描けます。レイアウトヒントは、それでも作者の意図を表現できない場合（例：
> 管理用 actor を右側に固定したい、外部サービスを片側に寄せたい）にだけ
> 使うこと。まずヒューリスティクスでの吸収を検討し、ヒントは最後に。

### `column` — `left | center | right`

同じ layer 内のノードを 3 つのバケット（`left` / `center`-もしくは未指定 / `right`）
に振り分けます。`center` と未指定は同じ中央バケットに入るため、両端だけを
明示的に指定して残りは未指定で済ませられます:

```css
service[external]        { column: right; }
queue, database, storage { column: center; }
/* internal service は未指定 → 中央バケットに入る */
```

各バケット内は既存の並び（system view では宣言順、それ以外では barycenter）
を保持します。**layer（行）自体を動かす効果はありません**。行を変えたく
なった場合はヒントを増やす前に auto-layout のヒューリスティクス改善 Issue
を立ててください。

### 適用スコープ

| View | 挙動 |
| --- | --- |
| `system` | 上記の通り適用。 |
| `deploy` | 無視。解決時に `style-column-ignored-non-system-view` 警告が出る。 |
| `org`    | 同上。 |

`left` / `center` / `right` 以外の値は `style-column-invalid-value`
警告とともに破棄されます。

### `direction` — `auto | up | down | left | right`

エッジに対するレイアウトヒント。エッジを視覚的にどの方向に流したいかを
示唆する。デフォルトは `auto`（エンジンに任せる）。

```css
edge[write] { direction: down; }
edge[read]  { direction: right; }
edge#criticalWrite { direction: down; }
```

値はリゾルバを経由して `ResolvedEdgeStyle.direction` に届く。GUI 編集フロー
（#1076 / #1098）が `.krs.style` に `edge#<id> { direction: <value> }` を
書き戻す前提のプロパティ。

> **MVP の制約.** 現在のレイアウトエンジンは `direction` を読まないため、
> 値は parse / resolve され `ResolvedEdgeStyle` 上には載るが、描画結果は
> 変わらない。レイヤ割り当て / 経路探索への組み込みは
> [#1124](https://github.com/kompiro/karasu/issues/1124) で追跡している。
> 設計上の意図（ヒントであり絶対指定ではない、サイクル回避時はエンジンが
> 上書きできる）は `docs/design/edge-direction-style.md` を参照。

不正値は黙って破棄され、`direction` は `auto` にフォールバックする。

---

## @import のスコープと衝突

- グローバルスコープ（ファイル全体に適用）
- 同じセレクタが複数ファイルで定義された場合は後勝ち
- 衝突時は警告を出力（エラーにはしない）

```
⚠ Warning: セレクタ "service" が複数ファイルで定義されています
  - default.krs.style:3
  - my-theme.krs.style:2
  my-theme.krs.style の定義が適用されます（後勝ち）
```

---

## スタイル解決の擬似コード

```javascript
function resolveStyle(node, rules) {
  return rules
    .filter(rule => matches(node, rule.selector))
    .sort((a, b) => specificity(a.selector) - specificity(b.selector))
    .reduce((acc, rule) => ({ ...acc, ...rule.style }), {})
}

function specificity(selector) {
  let score = 0
  if (selector.id)              score += 100
  score += selector.tags.length        * 10
  score += selector.annotations.length * 10
  if (selector.type)            score += 1
  return score
}
```

---

## 完全サンプル（default.krs.style）

```css
/* ── 種別セレクタ ── */
user {
  background-color: #1D4ED8;
  color:            #DBEAFE;
  border-color:     #1E40AF;
  border-width:     2px;
  border-radius:    8px;
  font-size:        13px;
  font-weight:      bold;
  shape:            user;
}

service {
  background-color: #0369A1;
  color:            #E0F2FE;
  border-color:     #075985;
  border-width:     2px;
  border-radius:    8px;
  font-size:        13px;
  font-weight:      bold;
  shape:            box;
}

domain {
  background-color: #15803D;
  color:            #D1FAE5;
  border-color:     #166534;
  shape:            box;
}

usecase {
  background-color: #1F2937;
  color:            #F9FAFB;
  border-color:     #374151;
  font-size:        11px;
  shape:            box;
}

impl {
  background-color: #78350F;
  color:            #FEF3C7;
  border-color:     #92400E;
  shape:            box;
}

/* ── タグセレクタ ── */
[external] {
  background-color: #1F2937;
  color:            #D1D5DB;
  border-color:     #374151;
  border-style:     dashed;
}

/* ── アノテーションセレクタ ── */
@deprecated {
  badge-color:  #EF4444;
  badge-icon:   "⚠";
  badge-label:  "非推奨";
  opacity:      0.6;
}

@new {
  badge-color:  #10B981;
  badge-icon:   "✦";
  badge-label:  "NEW";
}

@experimental {
  badge-color:  #F59E0B;
  badge-icon:   "⚗";
  badge-label:  "実験的";
}

@migration_target {
  badge-color:  #3B82F6;
  badge-icon:   "→";
  badge-label:  "移行先";
}

/* ── 複合セレクタ ── */
user[external] {
  color: #9CA3AF;
}

[external]@deprecated {
  border-color: #EF4444;
}

/* ── IDセレクタ ── */
#ECommerce {
  background-color: #7C3AED;
}

/* ── エッジ ── */
edge {
  color:        #94A3B8;
  stroke-width: 1.5px;
  font-size:    11px;
}

edge[async] {
  border-style: dashed;
  color:        #6B7280;
}

/* ── 組織図（Org Tree View）── */
team {
  background-color: #1E3A5F;
  color:            #E2E8F0;
  border-color:     #3B82F6;
}

member {
  background-color: #0F172A;
  border-color:     #334155;
}

/* 特定チームのみ強調 */
#BackendTeam {
  border-color: #F59E0B;
  border-width: 2px;
}
```

---

## 組織図ノードセレクタ（Org Tree View）

Org Tree View は `team` / `member` の種別セレクタと ID セレクタ（`#NodeId`）をサポートします。

| セレクタ | 対象 |
|---------|------|
| `team` | すべてのチームカード |
| `member` | すべてのメンバーカード |
| `#TeamId` | 特定のチームカード |
| `#MemberId` | 特定のメンバーカード |
| `edge` | チーム間のベジェコネクタ |

**対応プロパティ:**

| プロパティ | 効果 |
|---|---|
| `background-color` | カード背景色 |
| `color` | テキスト色 |
| `border-color` | 枠線色 |
| `border-width` | 枠線幅（px） |
| `border-radius` | 角丸（px） |
| `font-size` | フォントサイズ（px） |
| `font-weight` | フォントウェイト（`normal` / `bold`） |
| `font-family` | フォントファミリー |

> **注意**: `opacity` / `shape` / `badge-*` は Org Tree View では無視されます。
> タグ・アノテーション複合セレクタ（`team[external]` 等）は現時点では未サポートです。
