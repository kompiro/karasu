# shadcn/ui 導入実験

- **日付**: 2026-05-13
- **Issue**: #1368
- **ステータス**: 検討中
- **関連**:
  - [ADR-20260325-01 testing-library-react](../adr/20260325-01-testing-library-react.md)
  - [ADR-20260326-04 app-testing-strategy](../adr/20260326-04-app-testing-strategy.md)
  - [ADR-20260401-04 vscode-phase3-webview-architecture](../adr/20260401-04-vscode-phase3-webview-architecture.md)
  - [ADR-20260312-04 css-inspired-styling](../adr/20260312-04-css-inspired-styling.md) — `.krs.style` の語彙とは独立であることを確認

## 背景・課題

`packages/app/src/components/` は ~25 個の hand-rolled コンポーネントに肥大化し、
スタイリングは単一の `src/styles/app.css` に集約されている。
UI 面が広がるにつれ（Chat / CRUD / Snapshot picker / Settings / ProjectSelector / PasteCompare…）、
以下の摩擦が顕在化しつつある:

- **視覚言語の一貫性**: dialog / dropdown / context menu / tabs が個別に実装され、
  focus ring・keyboard handling・portal 配置の挙動が微妙に異なる
- **a11y**: Radix のような primitive を使わず手書きしているため、
  focus trap・aria 属性・keyboard navigation が局所最適に留まる
- **テーマ**: light/dark 切替のための CSS 変数が `app.css` 内に散在し、
  diagram SVG 側のトークンと一致しているか目視確認が必要

karasu の主目的は「Claude Code の学習」と「テキストベースのアーキテクチャモデリングツールの探索」であり、
UI フレームワーク選定は **karasu の本体価値ではない**。
そのため「導入する／しない」を即決するのではなく、
**実験 PR で実コード上の trade-off を確認してから判断したい**（Issue #1368 が明示的にそう述べている）。

## 制約・前提

- `packages/app` は Vite + React 19 + TypeScript で構築されている（CLAUDE.md「技術スタック」節）
- テストは Vitest + RTL（ADR-20260325-01・ADR-20260326-04）。jsdom 環境
- `packages/vscode` は app の build 成果物を webview に積む構成（ADR-20260401-04）。
  bundle が極端に肥大化すると webview の起動コストに直撃する
- `packages/core` の SVG renderer は app 側の CSS 変数を読みに行く箇所があり、
  テーマトークンの命名を勝手に変えると diagram の色が崩れる
- ホスト環境は monorepo (`pnpm workspaces`)。`packages/app` 局所で完結する変更にしたい
- `karasu` リポジトリは OSS 公開を控えており、過剰な dependency 追加は license-compliance 経路を増やす

## 検討した選択肢

### 案1: Tailwind v4 + shadcn/ui を `packages/app` に導入し、代表 6 コンポーネントを移行

- 概要: `tailwindcss@4` + `@tailwindcss/vite` を入れ、`@import "tailwindcss"` を `app.css` に追加。
  `components.json` を手書きし、shadcn primitive を `src/components/ui/` にコピーして使う。
  既存 `app.css` は共存させ全面書き換えはしない。
- 移行候補: `PasteCompareDialog`, `SnapshotPickerModal` → `Dialog` /
  `EdgeContextMenu` → `ContextMenu` /
  `DiagramTabBar`, `EditTabBar` → `Tabs` /
  `Breadcrumb` → `Breadcrumb`
- メリット:
  - Radix primitive により a11y baseline がまとめて改善する
  - Tailwind 変数で diagram SVG トークンと同じ CSS 変数を共有しやすい
  - shadcn は npm 依存ではなく source copy なので runtime lock-in が無い
- デメリット:
  - `clsx` / `tailwind-merge` / `class-variance-authority` / 複数の `@radix-ui/react-*` が runtime dependency に増える
  - Tailwind v4 と既存 `app.css` の preflight が衝突する可能性
  - `packages/vscode` webview の bundle が増える（要計測）
  - shadcn CLI の v4 対応が 2026-05 時点で canary 経由、CI 安定性に不安

### 案2: Radix primitive だけを直接使い、shadcn の wrapper は採用しない

- 概要: Tailwind を導入せず、必要な Radix package（`@radix-ui/react-dialog` 等）を個別に入れ、
  既存 `app.css` の class 命名で wrapper を書く。
- メリット:
  - a11y baseline は得られる
  - Tailwind 導入コストと bundle 増分を避けられる
  - 既存 CSS と完全共存
- デメリット:
  - shadcn 採用判断という Issue 本来の目的に答えられない
  - 視覚言語の統一は手書き css/wrapper を続けることになり摩擦が残る
  - 「実験して捨てるかも」という Issue の前提が消えるので、論点がぼやける

### 案3: 何もしない（現状維持）

- 概要: 既存のままで、必要に応じて個別コンポーネントを手書き改善
- メリット: 0 コスト、現状の安定運用が崩れない
- デメリット:
  - Issue #1368 の問いに対して「やらない」と答えるだけで、判断根拠が残らない
  - UI 面が更に広がったときに同じ議論を再開する羽目になる

### 案4: 別 framework（Park UI / Mantine / Chakra v3）を検討

- 概要: Tailwind 前提でない Panda CSS 系や CSS-in-JS 系で代替
- メリット: Tailwind 導入を回避できる選択肢もある
- デメリット:
  - Issue #1368 は shadcn を名指しした実験を求めている。範囲を広げると実験の結論が出ない
  - 案の比較は **本 Design Doc の検討外** とする（将来必要になればフォローアップ Design Doc で）

## 比較

| 観点 | 案1: Tailwind+shadcn | 案2: Radix only | 案3: 現状維持 |
| --- | --- | --- | --- |
| Issue #1368 の問いに答えるか | ✅ そのもの | △ 部分的 | ❌ |
| a11y 改善 | ✅ | ✅ | ❌ |
| bundle size | △ 要計測 | ◯ 小増 | ✅ 不変 |
| 既存 `app.css` との共存 | △ preflight 衝突リスク | ✅ | ✅ |
| VS Code webview 影響 | △ 要計測 | ◯ 小 | ✅ 無 |
| 実験完走後の意思決定容易性 | ✅ 採用/部分採用/不採用が明確に出る | △ shadcn 評価未達 | ❌ 評価不能 |
| 撤退コスト | ◯ ブランチごと破棄可能 | ◯ | — |

## Related TPLs

`packages/app` を変更する以上、以下の既存 TPL を移行時に必ず確認する:

- [TPL-20260510-04](../test-perspectives/TPL-20260510-04-continuous-input-dom-interference.md) —
  ユーザーの連続操作中は DOM / state を破壊する別系統の処理を抑止する。
  Radix Dialog / Popover の portal mount が Monaco エディタの IME composition に干渉しないか確認する
- [TPL-20260510-09](../test-perspectives/TPL-20260510-09-event-handler-ui-restructure.md) —
  UI 構造を変える event handler は次描画でマウントされる target への event 漏れを防ぐ。
  shadcn Dialog の close handler から次フレームで input が mount される系列は要点検
- [TPL-20260510-06](../test-perspectives/TPL-20260510-06-display-mode-cross-surface.md) —
  表示モード / グローバルレンダリング切替は全描画面の点検と precedence 設計が必要。
  Tailwind の `dark` クラスや CSS 変数を増やすときは、SVG renderer 側の色トークンと一貫しているか全描画面（preview / export / reference panel / legend）で確認する
- [TPL-20260510-15](../test-perspectives/TPL-20260510-15-dev-vs-packaged-mode-parity.md) —
  dev tree のレイアウトに依存するパス / 設定は packaged / installed モードでも動く。
  Tailwind のビルド成果物が `packages/vscode` の webview build にも乗り、packaged extension で同じ見た目になるか確認する

未 TPL 化の原則スキャンの結果: 本実験は **新規概念を導入せず既存 UI を置き換えるだけ** であり、
proactive TPL を起こすべき新たな原則違反は見当たらない。
実験完了時に bug や驚きが見つかれば retrospective TPL を起こす。

## 現時点の方針

**案1（Tailwind v4 + shadcn/ui、代表 6 コンポーネント移行）で進める。**

実装ガイドライン:

1. **共存優先**: 既存 `app.css` は維持し、Tailwind は新規 class 用に追加。
   preflight が既存スタイルを壊す場合は preflight を局所無効化するか scope 限定 import で逃がす
2. **コンポーネント単位の境界**: shadcn primitive は `src/components/ui/` 配下にコピーし、
   既存コンポーネントから import する形にする。既存コンポーネントの public API は変えない
3. **bundle size を計測する**: 移行前後で `vite build` の出力を控え、PR description に delta を記載する
4. **VS Code webview をビルドして確認**: 案1 採用の最後の関門。`packages/vscode` の build が壊れていないかを通す
5. **判断の落とし所**: PR description に **採用 / 部分採用 / 不採用** の推奨を必ず書く。
   merge 可否はその recommendation を見てユーザーが決定する

実験 PR がそのまま main にマージできなくても **Design Doc としての価値（trade-off の記録）は残る**。
不採用となった場合は本 Design Doc を ADR に昇格させて「shadcn/ui は採用しない」決定の根拠を残す。

## 実験の完了条件

Issue #1368 の Acceptance Criteria と同期:

- [ ] Tailwind + shadcn が `packages/app` で動く
- [ ] 5+ コンポーネント移行（候補 6 件のうち最低 5 件）
- [ ] `pnpm -F @karasu-tools/app test` 通過
- [ ] `pnpm -F @karasu-tools/app build` 通過
- [ ] `pnpm -F @karasu-tools/vscode build` 通過（webview が壊れない確認）
- [ ] PR description に bundle size delta / DX メモ / recommendation を記載
