# AT: examples/ と gallery manifest のカバレッジを一致させる

- **日付**: 2026-08-04
- **関連 Issue**: [#2310](https://github.com/kompiro/karasu/issues/2310)
- **関連 ADR**: [ADR-1628](../adr/1628-docs-site-examples-gallery.md)（gallery はビルド時レンダリング。`ec-platform` 1 ページ化はその設計 doc が決めて未実装だった）、[ADR-1642](../adr/1642-en-ja-example-parity.md)（`examples/<lang>/<name>/` と en/ja 対応）、[ADR-1724](../adr/1724-system-view-infra-external-tier-split.md) / [ADR-1728](../adr/1728-external-on-sides-layout.md)（`hato` は両 ADR の実測モデル）
- **関連 AT**: [1628-examples-gallery](1628-examples-gallery.md)、[1642-en-ja-examples](1642-en-ja-examples.md)、[1728-external-on-sides](1728-external-on-sides.md)（`hato` を `examples/en/hato/` から render する）
- **関連 TPL**: [TPL-1032](../test-perspectives/TPL-1032-derived-state-staleness.md)（派生 state の二重持ち — manifest は `examples/` の再掲）、[TPL-2253](../test-perspectives/TPL-2253-removal-sweep-needs-a-search-not-a-file-list.md)（完了条件は検索式で書く）
- **対象ファイル**:
  - `packages/docs-site/scripts/lib/examples-manifest.ts`
  - `packages/docs-site/scripts/lib/examples-coverage.test.ts`（新規）
  - `examples/README.md`

> #2310 の 3 件はいずれも「`examples/` ツリーとその consumer が、そこに何があるかで
> 食い違っている」という 1 つの形をしている。個別に埋めるだけだと同じ形で再発するので、
> **カバレッジそのものを機械チェックにする**ところまでを本 PR のスコープとした。

## 受け入れ条件

- [x] AT-A: `examples/en/<name>/` の**全**ディレクトリに gallery ページがある（#2310-1: `hato` がどこにも属していなかった状態の解消）

  > ✅ Automated — `packages/docs-site/scripts/lib/examples-coverage.test.ts` › `examples/ ↔ gallery manifest coverage (#2310)` › `publishes every example directory`

- [x] AT-B: gallery manifest が、存在しない `examples/` ディレクトリを指していない（逆方向）

  > ✅ Automated — 同 describe › `publishes nothing that is not an example directory`

- [x] AT-C: `ec-platform` の gallery ページが `03-domains.krs` を代表として en / ja 双方でレンダリングされる（#2310-2: ADR-1628 の設計 doc が決めて未実装だった決定の実装）

  > ✅ Automated — `packages/docs-site/scripts/lib/render-examples.test.ts` › `examples gallery rendering` が manifest の全エントリを en / ja 双方で compile し、非空 view が出ることを確認する（`ec-platform` / `hato` の追加でケース数が 59 → 79 に増える）

- [x] AT-D: `hato` の gallery ページが `@import "hato.krs.style"` 解決込みでレンダリングされる

  > ✅ Automated — 同上（style import が解決できなければ `renderDiagram` が落ちる）

- [x] AT-E: en-only でないディレクトリには必ず `ja` の対応物がある

  > ✅ Automated — `examples-coverage.test.ts` › `examples/ en–ja parity (ADR-1642, #2310)` › `has a ja counterpart for every directory that is not listed en-only`

- [x] AT-F: en-only リストが、実際に `ja` を持たないディレクトリと**過不足なく一致**する（#2310-3 の核心）

  > ✅ Automated — 同 describe › `lists as en-only exactly the directories that have no ja counterpart`。**`if and only if` の両向き**を assert しているのが要点で、片向き（「リストにあるものは ja が無い」）だけだと、翻訳を忘れたディレクトリをリストに 1 行足すことで黙って green にできてしまう

- [x] AT-G: en-only の各ディレクトリが `examples/README.md` の「en-only examples (and why)」節に**理由付きで**載っている

  > ✅ Automated — 同 describe › `names every en-only directory in examples/README.md, with a reason`。テスト側の `EN_ONLY` 集合だけでは、説明されない除外を manifest からテストファイルへ移しただけになる

- [x] AT-H: en / ja 双方を持つディレクトリのファイル集合が一致する（片方だけファイルが増える drift の検出）

  > ✅ Automated — 同 describe › `` `%s` has identical file sets in en and ja ``（ディレクトリごとに 1 ケース）

- [x] AT-I: `ja` にしか無いディレクトリが存在しない

  > ✅ Automated — 同 describe › `has no ja-only directory`

- [ ] AT-J: 🧑 Manual — <https://kompiro.github.io/karasu/> の Examples で、新しい 2 ページ（**EC platform — staged tutorial** / **Multi-hub system (hato)**）が Overview とサイドバーに出て、図とソースが読めること。en / ja 双方で確認する

- [ ] AT-K: 🧑 Manual — `ec-platform` ページの blurb が「7 本のうち 1 本を代表として出している」ことを伝えており、残りへ辿るための "view on GitHub" リンクが `examples/<lang>/ec-platform` を指していること。1 ページしか出ていないのを取りこぼしと読まれないことがこの blurb の役目

- [ ] AT-L: 🧑 Manual — `hato` ページの図が、ADR-1728 が主張する **external をサイドに置いた配置**として読めること（サイド列に `[external]` が並び、エッジが横に走る）。ここが崩れているなら ADR-1728 の実測が古くなっている合図

## 補足 — 自動化しなかったもの

**gallery ページの見た目**（AT-J / AT-L）は自動化していない。`render-examples.test.ts` が
言えるのは「compile が通り、非空の view が出る」までで、配置が読めるかは人にしか判定
できない。とくに `hato` は ADR-1724 / ADR-1728 の実測対象を兼ねるため、AT-L は
gallery の確認であると同時に、その実測がまだ成り立っているかの定点観測でもある。

`hato` を**移動しなかった**理由も記録しておく。#2310 は「fixture ならテストの隣へ」と
書いているが、`hato` を消費しているのは AT-1728 の `karasu render examples/en/hato/…`
という**パス指定**であり、移動は ADR-1724 / ADR-1728 / AT-1728 の 3 件の記録を書き換える。
そのうえ、この fixture の価値は「実在するシステムのモデルであること」なので、テスト用
ディレクトリに移せば誰も更新しなくなり、実在性を失う。gallery に載せることで、
実在性が維持される理由（人が見るページである）を与える側に倒した。
