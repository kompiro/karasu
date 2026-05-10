---
type: product
---

# AT-1186: Edge hover-highlight + dim peers (progressive disclosure)

- **日付**: 2026-05-09
- **関連 Issue**: [#1186](https://github.com/kompiro/karasu/issues/1186)
- **対象ファイル**:
  - `packages/app/src/styles/app.css`
  - `packages/e2e/tests/at-1186-edge-hover-highlight-dim.spec.ts`
- **依存**: ADR-20260506-02（`edge#<canonicalId>` selector / `data-edge-canonical-id` 付与）, ADR-20260422-03（Implicit edge detail panel）

## 受け入れ条件

- [x] AT-A: インタラクティブな edge（`[data-edge-canonical-id]` が付いた cross-service / cross-domain edge）に hover すると、**他の edge** が `opacity: 0.25` まで dim される
  > ✅ Automated — `packages/e2e/tests/at-1186-edge-hover-highlight-dim.spec.ts` › `hovering an interactive edge dims its peers`

- [x] AT-B: hover を外す（ポインタを edge 領域の外に移動）と、すべての edge が **元の opacity に戻る**（`opacity: 1`）
  > ✅ Automated — `packages/e2e/tests/at-1186-edge-hover-highlight-dim.spec.ts` › `mouseleave restores peer edges to full opacity`

- [x] AT-C: hover されている edge **自体は dim されない**（既存の hover 強調 — stroke 太線化 + brightness — もそのまま動作）
  > ✅ Automated — `packages/e2e/tests/at-1186-edge-hover-highlight-dim.spec.ts` › `the focused edge keeps full opacity while hovered`

- [x] AT-D: hover dim は `:has()` を使った **CSS のみ** で実現される（React state も DOM mutation も伴わない）。SVG の re-inject や useSystemView の debounce と race しない
  > ✅ Automated — 実装が CSS のみで完結することは PR の差分（`packages/app/src/styles/app.css` のみ変更）で担保される

- [ ] AT-E（manual）: 多数 edge の system view（例: `examples/ec-platform/`）を Preview で開き、edge を順番に hover して **focused edge が視認しやすく**、関係ない edge が背景に沈むことを目視確認する
  > 🧑 Manual — UX 体験の主観的評価。CI では検証できない

- [ ] AT-F（manual）: 既存の右クリック → direction menu（#1129）と label-click → edge detail panel（ADR-20260422-03）が引き続き機能する。具体的には: (1) edge を右クリックして Direction ▸ Up/Down/Left/Right が選べる、(2) edge label をクリックして detail panel が開く
  > 🧑 Manual — hover dim はそれらの click ハンドラに干渉しないが、CSS 状態の遷移として相互作用が起きないことの最終確認は目視で行う

- [ ] AT-G（manual）: **diff mode** で hover dim が破綻しないこと。snapshot diff を有効化した状態で edge に hover → 焦点 edge は `opacity: 1` になり（`[data-diff-state="unchanged"]` の `opacity: 0.55` を上書き）、diff-tagged な peer (`added` / `removed` / `changed`) も含めて `opacity: 0.25` まで dim される
  > 🧑 Manual — diff mode の e2e 自動化は snapshot 作成 UI に依存するためスコープ外。CSS 上は `!important` で `[data-diff-state]` ルールに勝つように実装されているが、最終確認は目視で行う
