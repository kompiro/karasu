# EdgeContextMenu を shadcn DropdownMenu primitive に移行する

- **日付**: 2026-05-19
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#1400](https://github.com/kompiro/karasu/issues/1400)（親 [#1399](https://github.com/kompiro/karasu/issues/1399) item 3 から分離）
  - 関連 ADR: [ADR-20260515-01](../adr/20260515-01-adopt-shadcn-ui.md)（shadcn/ui 採用）
  - 関連 TPL: [TPL-20260516-01](../test-perspectives/TPL-20260516-01-control-a11y-contract-survives-migration.md)（interactive control の a11y 契約は移行で静かに壊れる）
  - コード: `packages/app/src/components/EdgeContextMenu.tsx`、
    `packages/app/src/components/PreviewPane.tsx`、
    `packages/app/src/components/ui/`

## 背景・課題

`EdgeContextMenu` はダイアグラム上のエッジを右クリックしたとき、その場（クリック座標）に
浮かぶメニューで edge direction（`auto` / `up` / `down` / `left` / `right`）を選ばせる
コンポーネント。

ADR-20260515-01 の shadcn/ui 採用に伴い #1368 で Radix `Popover` へ移行済みだが、
direction 項目は依然として生の `<button role="menuitem" className="context-menu-item">`
を `PopoverContent` 内に並べただけになっている。`role="menuitem"` を付けてはいるが、
親が本物の menu primitive ではないため:

- 矢印キーによる roving focus（項目間移動）が無い
- type-ahead（頭文字で項目を絞る）が無い
- `aria-activedescendant` / `aria-orientation` といった menu の ARIA 構造が無い
- disabled 項目のキーボードスキップが無い

つまり「`role` だけ menuitem、実体は素の button 列」という状態で、キーボード操作の
セマンティクスが欠落している。#1400 はこれを本物の menu primitive へ移行して解消する。

## 現状（インベントリ）

| 観点 | 現状 |
| --- | --- |
| 開き方 | `PreviewPane` がエッジの `contextMenu` イベントで React state `edgeMenu` を立て、`EdgeContextMenu` を条件レンダリング |
| 位置決め | `PopoverAnchor` を `position: fixed; left: x; top: y; width/height: 0` のゼロサイズ仮想要素として配置し、`PopoverContent` をそこに anchor |
| 直接の右クリック対象 | 診断 SVG は `dangerouslySetInnerHTML` で描画されるため、エッジ要素に React コンポーネント（Trigger）をマウントできない |
| direction 項目 | `<button role="menuitem" className="context-menu-item" disabled={!writable}>` ×5。`onClick` で `onPickDirection` → `onClose` |
| 非対話要素 | header（title / subtitle / target）・section-label・hint は `<div>`。separator も `<div>` |
| dismissal | Radix `Popover` の `DismissableLayer` が outside-click / Esc / focus 復帰を担う |
| primitive | `packages/app/src/components/ui/` に `popover` はあるが `dropdown-menu` は未導入。`@radix-ui/react-dropdown-menu` も未依存 |
| テスト | 専用テストファイルは無く、`PreviewPane.test.tsx` の "edge context menu" describe（6 ケース）が `.edge-context-menu button.context-menu-item` を直接クエリして検証 |

## 制約・前提

- **座標表示は維持必須** — このメニューはエッジのクリック座標に出る。VS Code 風の「Trigger を
  クリックして開く」モデルには置き換えられない。
- **SVG にトリガを置けない** — 診断図は `dangerouslySetInnerHTML`。エッジ `<g>` を React の
  Trigger にはできないため、開く起点は従来どおり `PreviewPane` の state 制御のまま。
- **挙動契約を保つ** — クリック座標での表示、Esc / outside-click でのクローズ、`.krs.style`
  書き込み先が無いとき direction 項目を非対話にして hint を出す、の 3 点は維持する。
- **a11y 契約を劣化させない**（TPL-20260516-01）— 移行で `role` / `aria-*` を取りこぼさない。
  むしろ menu primitive 化で強化する。
- **out of scope** — `file-tree/ContextMenu.tsx`（別の右クリックメニュー）は本 Issue の対象外。
  shadcn 移行は将来別 Issue で。

## 検討した選択肢

### 案1: Popover のまま、roving focus / type-ahead を手書きで足す

`PopoverContent` 内に `onKeyDown` を書き、矢印キーで `focus()` を移し、type-ahead を実装する。

**メリット**

- 依存追加なし。位置決めの仕組みを変えない。

**デメリット**

- Radix Menu が無償で持つものを再実装することになる。#1400 が問題視している「hand-rolled」を
  まさに増やす方向で、Issue の意図に反する。
- type-ahead・`aria-activedescendant`・disabled スキップを正しく書くのは地味に重く、テスト負債も増える。

### 案2: Radix `DropdownMenu` をネイティブ Trigger で使う

`DropdownMenuTrigger` を実在のボタンとして置き、ユーザーがそれをクリックして開く。

**メリット**

- 最も「教科書どおり」の使い方。

**デメリット**

- karasu のメニューはエッジのクリック座標に出る。クリックすべき可視 Trigger は存在しない。
  開閉モデルが現状と根本的に合わず、採用不可。

### 案3: Radix `ContextMenu` を使う

Radix `ContextMenu` はネイティブ右クリックで開く menu primitive。

**メリット**

- 「右クリックで開く」という意味論が一致する。

**デメリット**

- `ContextMenu` は `ContextMenuTrigger` 要素上の右クリックで開く。トリガにできるのは React が
  マウントする要素であり、`dangerouslySetInnerHTML` で描かれた SVG エッジには付けられない。
- 仮にラッパ要素全体をトリガにすると、エッジ以外の右クリックでも開いてしまい、現状の
  「エッジ上だけ」という判定（`data-edge-canonical-id` を持つ要素か）を別途書く必要があり、
  結局 `PreviewPane` 側の state 制御が残る。利点が相殺される。

### 案4: Radix `DropdownMenu` を制御 open + 仮想 Trigger で使う（採用）

`DropdownMenu` を `open` 制御で使い、`DropdownMenuTrigger` を `position: fixed` の
ゼロサイズ要素としてクリック座標に配置する。`DropdownMenuTrigger` は `DropdownMenuContent` の
anchor を兼ねるため、現状の `PopoverAnchor` と同じ「仮想 anchor」テクニックがそのまま使える。
direction 項目は `DropdownMenuItem` にする。

**メリット**

- 座標表示を維持したまま、direction 項目が Radix Menu の roving focus / type-ahead /
  Home・End / disabled スキップ / menu の ARIA 構造を無償で得る。#1400 の目的を直接満たす。
- `DismissableLayer`（Esc / outside-click）は `DropdownMenu` も内蔵。dismissal 契約は維持。
- `Popover` → `DropdownMenu` の差し替えで、`PreviewPane` 側の state 制御・開く判定は無改修。

**デメリット**

- `@radix-ui/react-dropdown-menu` の依存追加と `ui/dropdown-menu.tsx` primitive の新規作成。
- 「ゼロサイズ仮想 Trigger」は Radix の教科書例には無いパターンで、意図をコメントで残す必要がある
  （ただし現状の `PopoverAnchor` も同じ仮想 anchor テクニックであり、新規性は実質ない）。

## 比較

| 観点 | 案1 Popover+手書き | 案2 native Trigger | 案3 ContextMenu | 案4 DropdownMenu+仮想Trigger |
| --- | --- | --- | --- | --- |
| 座標表示の維持 | ○ | ✕ | △（要追加判定） | ○ |
| キーボード semantics | 手書き（負債増） | ○ | ○ | ○ |
| 依存追加 | なし | あり | あり | あり |
| Issue #1400 の意図 | 反する | 不適合 | 部分的 | 合致 |
| 実装の素直さ | △ | ✕ | △ | ○ |

## 現時点の方針

**案4 を採用する** — `DropdownMenuTrigger` が `DropdownMenuContent` の anchor を兼ねる
性質を使い、ゼロサイズの仮想 Trigger をクリック座標に置く。これは現状 `Popover` で使っている
`PopoverAnchor` の仮想 anchor テクニックと同型であり、座標表示・dismissal 契約をそのまま保ったまま、
direction 項目だけを本物の `DropdownMenuItem` に格上げできる。案1 は #1400 が問題視する
hand-rolled を増やし、案2・案3 は karasu の「座標で開く」モデルに合わない。

### 実装の指針

1. `packages/app/package.json` に `@radix-ui/react-dropdown-menu` を追加（既存 Radix 依存と同系列）。
2. `packages/app/src/components/ui/dropdown-menu.tsx` を新規作成。`popover.tsx` の流儀に倣い、
   必要分のみ trim して export する: `DropdownMenu` / `DropdownMenuTrigger` /
   `DropdownMenuContent` / `DropdownMenuItem` / `DropdownMenuSeparator`。
3. `EdgeContextMenu.tsx` を `Popover` → `DropdownMenu` に書き換える:
   - `DropdownMenu open onOpenChange={(o) => !o && onClose()}`。
   - `DropdownMenuTrigger` をゼロサイズ `position: fixed` 要素としてクリック座標 (x, y) に配置。
     仮想 anchor の意図をコメントで明記。
   - direction 5 項目を `DropdownMenuItem`（`onSelect` でピック、選択時 Radix が自動クローズ →
     `onOpenChange` 経由で `onClose`）。`disabled` は `DropdownMenuItem` の prop で渡し、
     Radix に roving focus からスキップさせる。
   - header / section-label / hint は非対話要素のため `<div>` のまま。separator は
     `DropdownMenuSeparator`。レガシー class 名（`context-menu-*`）は CSS 継続のため維持。
4. `packages/app/src/styles/app.css` の `.context-menu-item` 系ルールを調整:
   - `DropdownMenuItem` は `div[role="menuitem"]` で `:disabled` 疑似クラスが効かないため、
     `:disabled` を Radix の `[data-disabled]`、`:hover` を `[data-highlighted]`（キーボード
     ハイライト）にも対応させる。`outline: none` を補う。
5. `PreviewPane.test.tsx` の "edge context menu" describe を更新:
   - セレクタ `button.context-menu-item` → `[role="menuitem"].context-menu-item`。
   - direction クリックを `userEvent.click` に（`.claude/rules/testing.md`：Radix primitive は
     full pointer sequence を要する）。
   - disabled 判定を `btn.disabled` → `aria-disabled` / `data-disabled` 属性ベースに。
6. AT: `docs/acceptance/1400-edge-context-menu-shadcn-menu.md` を新規作成。手動確認 TC:
   - メニュー表示中、↑↓ で direction 項目間のフォーカスが移動し Home/End が効く。
   - 頭文字キーで type-ahead 絞り込みができる。
   - `.krs.style` 未設定時、disabled 項目が矢印キーでスキップされる。
   - Enter / Space で項目を選択 → メニューが閉じて方向が書き込まれる。
   - Esc / outside-click でメニューが閉じる（dismissal 契約の維持確認）。
7. ADR 昇格: 実装完了後、本 Design Doc を `docs/adr/1400-edge-context-menu-shadcn-menu.md`
   相当（karasu 規約の `YYYYMMDD-NN` 形式）として昇格し、同 PR で本ファイルを削除する。

### a11y 契約のレビュー（TPL-20260516-01）

TPL-20260516-01 は「移行で interactive control の a11y 契約が静かに壊れる」観点。本移行では:

- 旧 `<button role="menuitem">` の `role` / disabled 表現が、新 `DropdownMenuItem`
  （`div[role="menuitem"]` + `aria-disabled` / `data-disabled`）に 1 対 1 で引き継がれることを
  diff で確認する。
- contract test を class ベースでなく role / 属性ベースにする（セレクタを `[role="menuitem"]`、
  disabled assert を `aria-disabled` に変更するのはこの方針に沿う）。
- アイコンのみボタン化の懸念は無し（direction 項目はテキストラベルを持つ）。

機能（クリックでピックされるか）は維持しつつ、本移行はむしろ a11y 契約を menu primitive 化で
**強化**する方向のため、新規 retrospective TPL は起こさない（既存 TPL-20260516-01 を引用する）。

### 影響範囲・マイグレーション

- 既存ユーザーへの影響: メニューの見た目・座標表示・クローズ挙動は不変。矢印キー / type-ahead が
  使えるようになる純増。direction 項目選択時、Radix が項目選択フォーカス時に項目を focus する点が
  変化（context menu として自然な挙動）。
- ドキュメント更新: `docs/acceptance/` に AT を追加。`docs/spec/` 系の変更は無し。
- テスト・examples への影響: `PreviewPane.test.tsx` の edge context menu 6 ケースのセレクタ /
  クリック方式 / disabled 判定を更新。examples への影響なし。
- 公開パッケージ（`karasu` CLI）への影響なし → changeset 不要。
