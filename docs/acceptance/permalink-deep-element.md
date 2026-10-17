# AT: deep permalink to a structural element / view

- **日付**: 2026-06-30
- **関連 Issue**: [#1827](https://github.com/kompiro/karasu/issues/1827)（permalink layer epic [#1826](https://github.com/kompiro/karasu/issues/1826)）
- **関連 ADR**: [ADR-1827](../adr/1827-permalink-deep-element.md)（deep permalink — 設計判断）/ [ADR-1783](../adr/1783-karasu-nest-hosted-preview.md)（karasu-nest）
- **関連 spec**: [`docs/spec/permalink.md`](../spec/permalink.md)（アンカー contract）
- **関連 TPL**: [TPL-1827](../test-perspectives/TPL-1827-deep-link-anchor-cross-surface-parity.md)（deep-link アンカーの全サーフェス parity）
- **対象ファイル**:
  - `packages/core/src/share/synthesize.ts`（`SharePayload.target`）
  - `packages/core/src/renderer/svg-renderer.ts`（`anchorId`）/ `drill-down-svg.ts`
  - `packages/app/src/utils/inline-share.ts`（`target` decode/validate）
  - `packages/app/src/hooks/useHistoryNavigation.ts`（`shareTargetToHash`）
  - `packages/app/src/App.tsx`（hash 正規化）
  - `packages/app/src/components/{ShareDialog,PreviewColumn}.tsx`
  - `packages/i18n/src/{types,en,ja}.ts`

> スコープは **share URL の deep permalink + 静的 SVG アンカー contract**。OGP の
> focused og:image（target に追従したフォーカス描画）は後続（Design Doc「未解決の
> 問い」）。rename によるアンカー陳腐化の検証は #1830。

## 受け入れ条件

- [x] AT-A: `target`（view + node + highlight + orgTree）が encode → decode でラウンドトリップする

  > ✅ Automated — `packages/app/src/utils/inline-share.test.ts` › `round-trips a full target (view + node + highlight + orgTree)`

- [x] AT-B: `target` の無い従来 `#s=` ペイロードはモデル全体（root）として復元される（後方互換）

  > ✅ Automated — `inline-share.test.ts` › `keeps the whole-model payload when there is no target`

- [x] AT-C: 未知の `view` を持つ `target` は throw せず破棄され、モデル全体で開く（degrade）

  > ✅ Automated — `inline-share.test.ts` › `drops a target whose view is not one of the known views (degrade, no throw)`

- [x] AT-D: 空文字の node/highlight・非 true の orgTree は正規化で落ちる

  > ✅ Automated — `inline-share.test.ts` › `drops empty-string node/highlight and a non-true orgTree`

- [x] AT-E: `target` は canonical `#krs-<view>-<node>:highlight` ハッシュへ変換され、`parseHash` で往復一致する

  > ✅ Automated — `packages/app/src/hooks/useHistoryNavigation.test.ts` › `shareTargetToHash` › `round-trips back through parseHash`

- [x] AT-F: SPA ハッシュ（`buildHash`）と core の `anchorId` が同一入力で同一アンカー文字列を返す（cross-surface parity）

  > ✅ Automated — `useHistoryNavigation.test.ts` › `anchor parity: buildHash ↔ core anchorId`

- [x] AT-G: 静的 drill-down SVG のレベル id は `anchorId` 文法に従う（id を sanitize、label は使わない）

  > ✅ Automated — `packages/core/src/renderer/drill-down-svg.test.ts` › `level id follows the anchorId grammar`

- [x] AT-H: ドリル/フォーカス中のみ「現在の表示位置にリンクする」チェックボックスが出て、トグルで再エンコードを通知する

  > ✅ Automated — `packages/app/src/components/ShareDialog.test.tsx` › `hides the deep-link checkbox when there is nothing to link to` / `notifies on toggling the deep-link checkbox` / `packages/e2e/tests/at-1827-permalink-deep-element.spec.ts` › `with the checkbox off, the same share opens the whole model`

- [x] M-1: あるサービスにドリルした状態で Share → チェック ON のリンクを別タブで開くと、そのサービス階層にドリルした状態で開くこと

  > ✅ Automated — `packages/e2e/tests/at-1827-permalink-deep-element.spec.ts` › `a link shared while drilled into a service opens drilled into it`（breadcrumb と `#krs-system-<id>` の hash）

- [x] M-3: 共有後にモデルの当該 node `id` を rename → 古いリンクを開くと（クラッシュせず）view root にフォールバックすること

  > ✅ Automated — `packages/e2e/tests/at-1827-permalink-deep-element.spec.ts` › `a shared target whose node was renamed opens the whole model`（payload の `target` 経由。ドリル中に共有した payload の `.krs` だけ rename して開き、root で開いて restore 失敗のバナーが出ないことを見る）/ `packages/e2e/tests/at-1958-deep-link-anchor.spec.ts` › `an anchor that no longer resolves opens the whole model`（`?krs=` 経由）

### 手動確認（CI で検証できない項目）

- [ ] M-2: ノードを選択（highlight）した状態で共有 → 開いたとき当該ノードがフォーカス強調されること

  > 🟡 Partially automated — `packages/app/src/hooks/useHistoryNavigation.test.ts` › `pending highlight restoration (#1842)`（共有オープン時に highlight が seed の VIEW_RESET 後に再適用されることを検証。実ブラウザ上の視覚的フォーカス強調の確認は手動）

- [ ] M-4: 静的にエクスポートした drill-down SVG を `<file>#krs-system-<id>` で直接開くと、CSS `:target` で当該階層が表示されること（JS 無効でも）。書き出したファイルを直接開く操作で、app を相手にする e2e の外にある
- [ ] M-5: `/s?s=<target 付き>` を実ブラウザで開くと、人間訪問者が `#s=` に bounce され deep-link が効くこと（OGP 画像はモデル全体のまま＝想定内）。`/s` は Pages Function が返すので e2e には現れない。bounce 後の deep-link は M-1 の e2e が見ている
