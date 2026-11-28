---
type: product
---

# AT: 帯の線が横切っても、焦点の相互の対は 1 本の線のまま（#3887）

- **日付**: 2026-11-22
- **関連 Issue**: [#3887](https://github.com/kompiro/karasu/issues/3887)（[#2823](https://github.com/kompiro/karasu/issues/2823) のスライス B が作った欠陥）
- **関連 ADR**: [ADR-2823](../adr/2823-ghost-band-layout.md), [ADR-3027](../adr/3027-mutual-edge-pair-merge.md)
- **Related TPLs**: [TPL-3027](../test-perspectives/TPL-3027-visual-merge-only-when-indistinguishable.md), [TPL-2598](../test-perspectives/TPL-2598-fence-corpus-must-reach-the-limit.md)
- **対象ファイル**: `packages/core/src/renderer/mutual-pair.ts`

> 帯の線は焦点の線の後に配線されるので、焦点の相互の対の真ん中を横切ることがある。
> そのとき分け目の候補がすべて交差から 14px 以内になり、帯が無ければ 1 本だった対が
> 2 本に戻っていた。分け目は、まず今までどおりすべての線から 14px 離れた点を探し、
> 見つからないときだけ、帯の線との交差からは hop の半径、帯の線だけの hop からはその幅だけ離れればよいとする。

## 受け入れ条件

### AC-1: 帯の線が横切る焦点の対も 1 本にまとまる

- [ ] AT-1: Umami の fixture で、帯の線が真ん中を横切る Boards と TrackedEntities の対が 1 本の線で描かれ、帯の線との交差には hop が付く。対は 14 組、描く線は 27 本になる

  > ✅ Automated — `packages/core/src/renderer/mutual-pair.test.ts` › `the dense domain canvas (Umami fixture)` › `keeps a canvas pair the band's lines cross as one line, the crossings hopped (#3887)`
  >
  > ✅ Automated — `packages/core/src/renderer/mutual-pair.test.ts` › `the dense domain canvas (Umami fixture)` › `draws 27 lines instead of 41, with every authored edge still its own LayoutEdge`

### AC-2: 分け目は帯の線の hop の外にあり、帯の無い対の分け目は変わらない

- [ ] AT-2: 分け目は帯の線の交差から hop の半径以上、帯の線の hop の幅の外にあり、焦点の線との交差からは今までどおり 14px 以上離れる。帯の線も含めてすべての線から 14px 離れた分け目が見つかる対では、分け目は今までと同じ位置にある。帯の線どうしの対は、焦点の線から 14px 離れた分け目が無ければ 2 本のまま

  > ✅ Automated — `packages/core/src/renderer/mutual-pair.test.ts` › `the dense domain canvas (Umami fixture)` › `keeps every split clear of corners, crossings and every hop over its line`
  >
  > ✅ Automated — `packages/core/src/renderer/mutual-pair.test.ts` › `where the line splits` › `slides off a soft line's crossing by a hop radius only (#3887)`
  >
  > ✅ Automated — `packages/core/src/renderer/mutual-pair.test.ts` › `where the line splits` › `keeps out of the gap of a hop over a soft line's crossing, not 14px (#3887)`
  >
  > ✅ Automated — `packages/core/src/renderer/mutual-pair.test.ts` › `where the line splits` › `finds a split between soft crossings where hard ones would leave none (#3887)`
  >
  > ✅ Automated — `packages/core/src/renderer/mutual-pair.test.ts` › `where the line splits` › `keeps a band line 14px off a canvas pair's split while the full clearance finds one (#3887)`
  >
  > ✅ Automated — `packages/core/src/renderer/mutual-pair.test.ts` › `where the line splits` › `gives a band pair no soft clearance from canvas lines (#3887)`
