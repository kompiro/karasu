# Outline view のタグ駆動アイコン variant 解決

- **日付**: 2026-05-19
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#1415](https://github.com/kompiro/karasu/issues/1415)
  - 先行 Issue: [#1408](https://github.com/kompiro/karasu/issues/1408)（Outline view へのアイコン表示追加）
  - 関連 TPL: [TPL-20260510-06](../test-perspectives/TPL-20260510-06-display-mode-cross-surface.md)
  - コード: `packages/core/src/builtins/icon-theme.ts`, `packages/app/src/components/OutlineView.tsx`

## 背景・課題

#1408 で Outline view に各ノードの Icon Mode ピクトグラムを表示する機能が
入った。しかし Outline は **base node kind** しかアイコンに解決しておらず、
プレビューの Icon Mode が描き分けるタグ駆動の variant が反映されない。

- `client` のサブタイプ — `client[mobile]` / `client[web]` / `client[desktop]`
  / `client[cli]` / `client[device]` / `client[extension]` / `client[embed]`
- `resource` の variant — `resource[table]` / `resource[queue]` /
  `resource[api]` / `resource[storage]`

これらに対し Outline は常に base の `client` / `resource` アイコンを出す。
プレビューの Icon Mode と Outline で同じノードに別のアイコンが出るのは、
表示面ごとの不整合（cross-surface drift）であり、[TPL-20260510-06] が
警告する典型パターンに該当する。

[TPL-20260510-06]: ../test-perspectives/TPL-20260510-06-display-mode-cross-surface.md

## 現状（インベントリ）

| 観点 | 現状 |
| --- | --- |
| アイコンテーマの真実源 | `ICON_THEME_STYLE_SOURCE`（`packages/core/src/builtins/icon-theme.ts`）。CSS で `kind` + `[tag]` セレクタに `shape: url("<icon>")` を割り当てる |
| variant の解決経路 | Icon Mode 時、style resolver が `ICON_THEME_STYLE_SOURCE` を適用してノードごとの `shape` を決める。client が複数のサブタイプタグを持つ場合は `applyClientSubtypeFirstMatch`（`resolver/style-resolver.ts`）が `node.tags` の順で first-match-wins |
| サブタイプ一覧の真実源 | `CLIENT_SUBTYPE_TAGS`（`icon-theme.ts` で定義）。resolver も import するが、`@karasu-tools/core` の entry point からは re-export されていない |
| Outline のアイコン解決 | `OutlineView.tsx` の `KIND_ICON_NAME`（kind → icon name の静的 map）。tag を見ない。`OutlineNode` 自体が `tags` フィールドを持たない |
| `(kind, tags) → icon name` の関数 | 存在しない。CSS 文字列としてしか公開されていない |

## 制約・前提

- Icon Mode と Outline が **同じノードに同じアイコン**を出すこと（#1415 AC）。
- アイコン解決ロジックの真実源は 1 箇所に集約し、drift を構造的に防ぐ。
- `OutlineView` は presentational なまま保つ（特定 AST 形状に依存しない）。
  Issue #1408 の設計方針を崩さない。
- Outline は system / deploy / org の 3 つの AST を `OutlineNode[]` に
  正規化して描く。タグを持つのは system view のノード（`client` / `resource`）。
- out of scope: Icon Mode 自体の variant 追加・アイコン SVG の新規作成。

## 検討した選択肢

### 案1: core に `iconNameForNode(kind, tags)` を新設し、Outline から呼ぶ

`icon-theme.ts` に `ICON_THEME_STYLE_SOURCE` の規則をミラーした関数
`iconNameForNode(kind, tags)` を追加し、`@karasu-tools/core` から export する。
`OutlineView` の `KIND_ICON_NAME` をこの関数呼び出しに置き換える。
`OutlineNode` に `tags` を追加し、adapter で populate する。

**メリット**

- `(kind, tags) → icon` の解決が core の関数 1 つに集約され、Icon Mode と
  Outline が同じ語彙を共有できる（#1415 が明示的に提案する形）。
- `CLIENT_SUBTYPE_TAGS` の re-export もこの機に解消できる。
- client の first-match-wins を resolver と同じ規則で再現できる。

**デメリット**

- `ICON_THEME_STYLE_SOURCE`（CSS 文字列）と `iconNameForNode`（関数）の
  2 表現が併存する。両者を同じファイル内に co-locate し、編集時に揃える
  運用が必要（後述の proactive TPL でフェンスする）。

### 案2: `OutlineView` 側で `ICON_THEME_STYLE_SOURCE` を style resolver にかける

Outline が core の style resolver を直接呼び、Icon Mode と全く同じ経路で
`shape` を解決する。

**メリット**

- 解決経路が完全に一本化され、表現の二重化が起きない。

**デメリット**

- Outline は AST ノードではなく正規化済みの `OutlineNode` を扱う。resolver
  にかけるには再び AST 相当の入力を組み立てる必要があり、presentational な
  設計（#1408）を壊す。
- resolver は spacing / color など shape 以外も解決する重い処理。アイコン名
  1 つのために通すのは過剰。
- deploy / org のノードは Icon Mode の対象外で、resolver 経路に乗せられない。

### 案3: `OutlineView` の `KIND_ICON_NAME` にタグ分岐を直書き

`OutlineView` 内のロジックを kind + tag 分岐に拡張する。core は触らない。

**メリット**

- 変更が app パッケージに閉じる。

**デメリット**

- アイコン語彙が `icon-theme.ts` と `OutlineView.tsx` に二重化し、まさに
  #1408 が避けたかった drift を app 側で再生産する。Issue が「core に
  resolution API を出す」ことを推している意図に反する。

## 比較

| 観点 | 案1 | 案2 | 案3 |
| --- | --- | --- | --- |
| 変更量 | 中（core + app 数ファイル） | 大（Outline の再設計） | 小（app のみ） |
| drift 耐性 | 高（core 1 箇所） | 最高（経路一本化） | 低（app に二重化） |
| #1408 の presentational 設計の維持 | 維持 | 破壊 | 維持 |
| Issue #1415 の提案との一致 | 一致 | 部分的 | 不一致 |

## 現時点の方針

**案1 を採用する** — Issue #1415 が明示的に提案する形であり、解決ロジックを
core の 1 関数に集約しつつ `OutlineView` の presentational 設計を保てる。
案2 は理想的だが Outline の再設計コストと resolver 経路の重さが見合わない。
案3 はアイコン語彙を app 側に二重化し drift を再生産するため却下する。

CSS 文字列と関数の二重表現（案1 のデメリット）は、両者を `icon-theme.ts`
内に co-locate し、後述の proactive TPL でフェンスすることで管理する。

### 実装の指針

1. `packages/core/src/builtins/icon-theme.ts`:
   - `ICON_THEME_STYLE_SOURCE` の base 規則をミラーした base-kind マップ、
     `resource` variant マップ、client サブタイプマップを追加する。
   - `iconNameForNode(kind: string, tags: readonly string[]): string | undefined`
     を追加する。`client` は `CLIENT_SUBTYPE_TAGS` に対し `tags` 順で
     first-match-wins（resolver の `applyClientSubtypeFirstMatch` と同規則）。
     `resource` は variant タグに対し first-match。いずれにも当たらなければ
     base-kind マップを引く。Icon Mode アイコンを持たない kind（`system`・
     deploy / org kind）は `undefined`。
2. `packages/core/src/index.ts`: `iconNameForNode` と `CLIENT_SUBTYPE_TAGS`
   を re-export する。
3. `packages/app/src/components/OutlineView.tsx`:
   - `OutlineNode` に optional な `tags?: string[]` を追加する。
   - `KIND_ICON_NAME[node.kind]` を `iconNameForNode(node.kind, node.tags ?? [])`
     に置き換える。infra item kind（`table` / `queue-item` / `bucket`）は
     Icon Mode に CSS 規則が無いため、Outline 専用の小さな fallback マップで
     現状の挙動を維持する（core には委譲しない）。
4. `packages/app/src/components/outline-adapters.ts`: `krsNodeToOutline` で
   `node.tags` を `OutlineNode.tags` に詰める（deploy / org の adapter も
   ノードがタグを持つ範囲で同様に）。
5. テスト:
   - core: `iconNameForNode` の単体テスト（`client[mobile]` / `resource[table]`
     / base kind / 複数サブタイプタグの first-match-wins / `system` で
     `undefined`）。
   - app: `OutlineView.test.tsx` に `client[mobile]` が `client-mobile`
     ピクトグラムを、`resource[table]` が `table` ピクトグラムを描くテスト。
6. AT: `docs/acceptance/` に新規ファイル。TC は:
   - `client[mobile]` ノードが Outline で mobile-client ピクトグラムを表示する
   - `resource[table]` ノードが Outline で table ピクトグラムを表示する
   - Outline とプレビューの Icon Mode が同一ノードで同じアイコンに解決する
7. proactive TPL: 「同一語彙を CSS と関数など複数の表現で持つとき、片方だけ
   更新されて静かに drift する」という**汎用観点**の proactive TPL を同 PR で
   起こす。`iconNameForNode` × `ICON_THEME_STYLE_SOURCE` を最初の
   `known_consumers` / `root_cause_file` に据えつつ、enum とラベルマップの
   二重定義など他の二重表現にも横展開できる粒度にする（下記「Related TPLs」
   参照）。
8. ADR 昇格: 実装完了後、`docs/adr/1415-outline-icon-variants.md` 等として
   昇格し、本 Design Doc は同 PR で削除する。

### 影響範囲・マイグレーション

- 既存ユーザーへの影響: なし（Outline の表示精度が上がるのみ）。
- ドキュメント更新: なし（`docs/spec/` の規定は変えない）。
- テスト・examples への影響: なし。新規テストの追加のみ。

## Related TPLs

- [TPL-20260510-06](../test-perspectives/TPL-20260510-06-display-mode-cross-surface.md)
  — 表示モード / グローバルレンダリング切替は全描画面の点検が必要。Outline は
  Icon Mode と並ぶ新たな描画面であり、同じ `(kind, tags) → icon` 語彙を
  共有させることでこの観点に応える。
- proactive TPL（同 PR で起票予定）— 同一語彙を複数の表現（CSS 文字列と
  関数、enum とラベルマップ等）で持つ場合、片方だけ更新されると表示面が
  静かに drift する、という**汎用観点**で起こす。今回の
  `iconNameForNode` × `ICON_THEME_STYLE_SOURCE` を最初の事例（`known_consumers`
  / `root_cause_file`）に据えるが、`applicable_to` は icon-theme に限定せず
  「同一語彙の二重表現」一般を対象にする。新しい kind / variant を
  `ICON_THEME_STYLE_SOURCE` に足したら `iconNameForNode` 側にも足す（逆も同様）
  ことを保証する。

## 決めないこと

- 案1 のデメリット（CSS 文字列と関数の二重表現）を将来的に解消するなら、
  単一の真実源から `ICON_THEME_STYLE_SOURCE` と `iconNameForNode` の双方を
  導出する案が考えられるが、本 Design Doc では扱わない。フォローアップとして
  [#1445](https://github.com/kompiro/karasu/issues/1445) を起票済み。当面は
  上記 proactive TPL で二重表現の drift をフェンスする。
