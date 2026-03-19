# .krs.style 構文リファレンス

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

同スコアなら後に書いた方が優先（CSS同様）。

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

@migration-target {
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
```
