---
type: product
---

# AT-1389: concepts.md ↔ ADR-topic 双方向参照レイヤ

- **日付**: 2026-05-19
- **関連 Issue**: [#1389](https://github.com/kompiro/karasu/issues/1389)
- **対象ファイル**:
  - `docs/concepts.md` / `docs/concepts.ja.md`（各トップレベル節に `<a id>` アンカー + `> Related ADR topics:` 注釈を追加）
  - `docs/adr/README.md`（各トピック見出しに `> Derives from` バックリンクを追加）
  - `scripts/lint/concept-adr-refs.ts`（新規 — バリデータ）
  - `scripts/lint/concept-adr-refs.test.ts`（新規）
  - `package.json` / `lefthook.yml`（`lint:concept-adr-refs` の配線）

## 受け入れ条件

- [ ] AT-A: クリーンな checkout で `pnpm lint:concept-adr-refs` が exit 0（コミット済みの concepts ↔ ADR-topic 参照が双方向で整合）
  > ✅ Automated — `scripts/lint/concept-adr-refs.test.ts` › `real repo: concepts <-> ADR-topic references are consistent`

- [ ] AT-B: `docs/concepts.md` の各トップレベル節に `> Related ADR topics:` 注釈が存在する（オンボーディング専用節は `_(none ...)_` 表記でも可）
  > ✅ Automated — `scripts/lint/concept-adr-refs.test.ts` › `real repo: every concept section carries a Related ADR topics annotation`

- [ ] AT-C: トピックの `> Derives from` バックリンクが存在しない / 実在しないアンカーを指す / 片方向参照になっている場合にバリデータが exit 1 する
  > ✅ Automated — `scripts/lint/concept-adr-refs.test.ts` › `flags a topic with no Derives from back-ref` / `flags a Derives from anchor that does not exist in the concept files` / `flags a one-directional reference (concept lists topic, README disagrees)`

- [ ] AT-D: `docs/concepts.ja.md` が `docs/concepts.md` と同じアンカー集合をミラーしていない場合にバリデータが exit 1 する
  > ✅ Automated — `scripts/lint/concept-adr-refs.test.ts` › `flags an anchor missing from the Japanese mirror`

- [ ] AT-E（manual）: GitHub 上で `docs/adr/README.md` を開き、各トピック見出しの `> Derives from` リンクをクリックすると `docs/concepts.md` の対応する節（`<a id>` アンカー位置）へスクロールすることを目視確認する
  > 🧑 Manual — レンダリング後のアンカーリンク遷移は静的検査では担保できないため目視確認する
