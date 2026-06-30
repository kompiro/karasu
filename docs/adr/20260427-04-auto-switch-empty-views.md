---
id: ADR-20260427-04
title: 空ビューを避けるための自動タブ切替（system > deploy > org）
status: accepted
date: 2026-04-27
topic: app-ui
related_to:
  - ADR-20260312-03
  - ADR-20260327-01
  - ADR-20260404-10
scope:
  packages:
    - app
  concerns: []
assumptions:
  - "file: packages/app/src/hooks/useAutoSwitchToDeploy.ts"
  - "file: packages/app/src/hooks/useAutoSwitchToOrg.ts"
  - "symbol: packages/app/src/hooks/useAutoSwitchToDeploy.ts :: useAutoSwitchToDeploy"
  - "symbol: packages/app/src/hooks/useAutoSwitchToOrg.ts :: useAutoSwitchToOrg"
  - "file: packages/app/src/hooks/useAppViews.ts"
---

# ADR-20260427-04: 空ビューを避けるための自動タブ切替（system > deploy > org）

- **日付**: 2026-04-27
- **ステータス**: 決定済み
- **関連**:
  - Issue #766 — deploy-only file rendering
  - Issue #817 — open org view automatically for organization-only files
  - PR #821 — deploy-only 実装
  - PR #835 — Design Doc 追記（org-only 拡張）
  - PR #844 — org-only 実装
  - ADR-20260312-03 — 論理構造と物理構造の分離
  - ADR-20260327-01 — Deployment Diagram Design Decisions
  - ADR-20260404-10 — Org tree view
  - 設計過程: deploy-only-render.md（本 ADR へ昇格・削除済み）

## 背景

karasu のプレビューは初期表示で `system` タブを選択する。`.krs` ファイルが
`system` ブロックを持たず `deploy` または `organization` のみ含む場合、
ユーザーは「描画できる絵」があるのに `"No nodes to render"` が表示された
空キャンバスを見ることになる。Deploy / Org タブを手動でクリックすれば
正しい絵が出るが、その存在は初見ユーザーには気付きにくい。

ADR-20260312-03 は「論理 (`system`) と物理 (`deploy`) の分離」を述べており、
ADR-20260404-10 は組織図 (`organization`) を独立した第三の関心軸として
位置付けている。これら 3 つの関心軸はそれぞれ独立に存在し得るため、
「ある関心軸だけで完結したファイル」も同様に独立に存在し得る。

## 決定

### 1. 自動タブ切替（auto-switch）

ファイルを開いたとき、以下のルールでアクティブタブを決める。

- ユーザーが直前に手動でタブを変えていない初期遷移時に限り評価する
- 評価の優先順位は **system > deploy > org**:
  - `system` ブロックが存在 → System タブのまま
  - `system` 無し、`deploy` 存在 → Deploy タブに自動切替
  - `system` 無し、`deploy` 無し、`organization` 存在 → Org タブに自動切替
  - 上記いずれも該当しない → System タブのまま（現行どおり「No nodes to render」）

### 2. Sticky semantics

自動切替は **`entryPath` ごとに 1 度** だけ発火する。同じファイルでユーザー
が自動切替後に手動で別タブへ戻った場合、再切替はしない。

- ファイルツリーで別ファイルへ切り替えると `entryPath` が変わるので新規ファイルとして扱う
- 同じ `entryPath` を再度開いても ref は持続するため再切替しない（reopen で
  リセットしない理由: deploy/org の挙動を一致させ、UX を予測可能にする）

### 3. swap モード時の `entryPath` の選び方

diff モードで `swapped` が立っている間、auto-switch hook には `compareEntryPath`
（compare 側のパス、`useAppViews` で `effEntryPath` と命名）を渡す。
「タブは画面に映している中身に追従する」というポリシーを、通常モードと
swap モード共通で採用する。

### 4. 実装は target ごとに独立した hook

`useAutoSwitchToDeploy` / `useAutoSwitchToOrg` の 2 フックに分け、
`useAppViews` から両方を呼び出す。優先順位は両フックの guard 節の
boolean 述語で表現し、フックの呼び出し順は意味を持たない:

- deploy hook: `activeView==="system" && hasDeployDiagram && !hasSystem`
- org hook: `activeView==="system" && hasOrg && !hasSystem && !hasDeployDiagram`

両ガードが安定な props のみを参照するため、effect が同一 commit で並行に
評価されても dispatch は最大 1 件しか発火しない（race-free）。

### 優先度行列

| `system` | `deploy` | `org` | 初期 active |
|:--:|:--:|:--:|:--|
| 有 | - | - | system |
| 無 | 有 | - | deploy |
| 無 | 無 | 有 | org |
| 有 | 有 | - | system |
| 有 | - | 有 | system |
| 無 | 有 | 有 | deploy |
| 有 | 有 | 有 | system |
| 無 | 無 | 無 | system（プレースホルダ） |

## 理由

### なぜ system を最優先にするか

- 大多数のファイルは system が中心であり、現行 UX を壊さないことが最優先。
- ADR-20260312-03 が定める「論理が中心、物理は補助」の関心軸ヒエラルキーに整合。

### なぜ deploy を org より優先するか

- 同一ファイルに deploy と organization が同居するケース（system 無し）は、
  ファイル所有者が「物理デプロイ単位」と「組織情報」を併記している状況。
  通常は前者が主目的で、後者は付帯情報（誰が運用するか）になる。
- 反例（org が主目的）が明確になったらこの順序を見直すが、現時点では deploy
  優先の方が予測可能性が高い。

### なぜ汎用化 (generic auto-switch hook) しないか

deploy/org の 2 フックは ~25 行の重複を持つが、target ごとに条件式と
dispatch する action が異なるため、汎用化するとクロージャや判別パラメータが
増えて結局複雑になる。「Three similar lines is better than a premature
abstraction」（CLAUDE.md）に従い、3 個目の auto-switch target が出るまで
重複を許容する。

### なぜ sticky semantics か

ユーザーが手動で system タブに戻したのに再切替するのは押し付けがましい。
逆にユーザーがファイルを離れて戻ってきたとき初期化するのは「閉じて開き直す」
明示的な UI が無い karasu では区別不能。両方を満たす最も保守的な選択が
「同じ entryPath では 1 回だけ」。

## 却下した代替案

### A. 一般化された `useAutoSwitchView({ targetView, when })` hook

メリット: 共通の effect/ref ロジックを 1 箇所に集約できる。

却下理由: ターゲットごとに条件述語と dispatch action が異なる。共通化する
には predicate と target を引数で渡す必要があり、結局個別フックを書くのと
コードサイズが大して変わらず、可読性が落ちる。3 個目以降に出てきたタイミング
でリファクタするのが妥当。

### B. SELECT_FILE で `switchedEntryRef` をクリア

メリット: 「ファイルを離れて戻る」を「再オープン」とみなして新規体験を提供。

却下理由: deploy 側で sticky を採った後で org 側だけ別 semantics にすると
2 フックの挙動が乖離する。両方を同時に変える方が筋が良い。現時点で再オープン
時の新規体験を要求する具体的な声は無い。

### C. core 層の変更（deploy-only 用に system view を「synthesize」する 等）

メリット: タブ切替を意識せず、system view にも常に何かが映る。

却下理由: ADR-20260312-03 の「論理/物理の分離」を破る。現在の core は
deploy-only ファイルを正しくレンダリングできており、問題は app 層の
初期表示選択にしかない。

### D. realizes 先が無い場合に `__unclassified__` に寄せる（Issue #766 本文の提案）

却下理由: ユーザーが書いた `realizes OrderAPI` という意図情報を描画上失う。
deploy view extractor の現行挙動（raw serviceId をラベルに使う）の方が
情報を保持できる。

## 影響範囲

- `packages/app/src/hooks/useAutoSwitchToDeploy.ts`
- `packages/app/src/hooks/useAutoSwitchToOrg.ts`
- `packages/app/src/hooks/useAppViews.ts`
- アクセプタンステスト: `docs/acceptance/0063-deploy-only-render.md`,
  `docs/acceptance/0064-org-only-render.md`
- サンプル: `examples/deploy-only/`, `examples/org-only/`, `examples/deploy-org/`

## 確認方法

- `pnpm --filter @karasu-tools/app test useAutoSwitch` でフック単体テスト
  （15 ケース）が通る
- AT-0063 / AT-0064 の手動チェックリストを通せる
- `examples/deploy-org/index.krs` を開き Deploy タブが選択されること
  （deploy-vs-org 優先度の regression check）

## 将来の拡張

新しい view target （仮: `infra` / `data` / `flow` 等）が追加され、auto-switch
の対象が 3 つを超える場合は本 ADR の優先度行列を更新する。同時に、共通化
（却下案 A）の費用対効果を再評価する閾値とする。
