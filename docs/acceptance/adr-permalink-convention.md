# AT: ADR-permalink authoring convention（taka short link + required source）

- **日付**: 2026-06-30
- **関連 Issue**: [#1829](https://github.com/kompiro/karasu/issues/1829)（near-term ADR permalink、permalink layer epic [#1826](https://github.com/kompiro/karasu/issues/1826)）
- **関連 ADR（決定記録）**: [ADR-20260702-01](../adr/20260702-01-adr-permalink-convention.md)（規約の決定。B-4 → **B-3**（taka 短縮 + 必須 source）に改訂）
- **関連 ADR**: [ADR-20260626-04](../adr/20260626-04-karasu-nest-ogp-share-page.md)（`/s?s=` OGP 共有ページ）/ [ADR-20260626-01](../adr/20260626-01-karasu-nest-hosted-preview.md)（karasu-nest stateless）
- **関連 spec**: [`docs/spec/permalink.md`](../spec/permalink.md)（deep-permalink アンカー contract）
- **関連 TPL**: [TPL-20260630-03](../test-perspectives/TPL-20260630-03-adr-permalink-records-source.md)（permalink は record ではなく pointer — 必須 `source` を記録）
- **対象ファイル**:
  - `docs/guide/adr-permalinks.md` / `docs/guide/adr-permalinks.ja.md`（L1 portable guide）
  - `.claude/rules/adr.md`（L2 adr-tools 実装規約 — `permalink:` frontmatter）
  - `packages/docs-site/scripts/lib/site-map.ts`（guide を docs-site で公開）
  - `packages/app/src/utils/inline-share.ts`（短縮の宛先 `/s?s=` payload の encode/decode — 既出荷）

> スコープは **ADR-authoring convention の文書化**（規約 ＋ ドキュメント）。
> inline `?s=` snapshot と taka 短縮の**機構**は #1829 で実装済み（既出荷）。
> `permalink:` frontmatter の**検証・本文生成**は #1830 / `@kompiro/adr-tools`、
> deep target のエンコードは #1827、repo-backed / source の ref-pin は #1828 に切り分ける。

## 受け入れ条件

- [x] AT-A: L1 guide が en / ja 両ロケールで存在し、相互リンクと「記録は in-repo `.krs` source・permalink は pointer」を規定している

  > ✅ Automated — `docs/guide/adr-permalinks.md` / `.ja.md` の存在と相互リンクは docs-site の `check-links`（`pnpm --filter @karasu-tools/docs-site build`）が検証する

- [x] AT-B: L1 guide が docs-site で公開される（`PUBLISHED_DOCS` に登録され、ja スラッグが生成される）

  > ✅ Automated — `packages/docs-site/scripts/lib/site-map.ts` の `PUBLISHED_EN_FILES` に `guide/adr-permalinks.md` を含み、docs-site `build` が en/ja ページを生成する

- [ ] AT-C: guide が `#s=`（fragment）を不可・短縮の宛先は `/s?s=`（query）と明記し、`source` を必須（＝リンクを単一障害点にしない）とし、trust note（短縮しない / 自前 shortener の選択）と **L1/L2 のレイヤ分けの解説**（karasu はユーザー repo に配置を強制できない → L1 は「何を記録するか」だけ縛る baseline、L2 は adr-tools による強制手段）を含む（レビュー確認 — `docs/guide/adr-permalinks.md` の「The `.krs` source is the record」「Shorten the `/s?s=` share URL」「Trust note」「Two layers」節）

- [ ] AT-D: L2 規約が `.claude/rules/adr.md` にあり、`permalink:` の `short`（taka）と `source`（必須）を定義し、生の payload を frontmatter にインラインしないこと・本文サマリ生成フォーマットを示す（レビュー確認 — `.claude/rules/adr.md`「ADR から karasu 構造へリンクする（permalink）」節）

- [x] AT-E: proactive TPL が同 PR で起こされ、guide / rules と双方向 back-ref している

  > ✅ Automated（リンク） — `TPL-20260630-03` の `## 派生元 spec` ↔ guide の `> Related TPLs:` 注釈。TPL README index に登録され、`scripts/lint` のリンクチェックが切れリンクを検出する

- [x] AT-F: guide の worked example が示す短縮宛先 `/s?s=` payload が decode して有効な `.krs` に戻る（短縮リンクの背後の構造が復元可能であることの裏付け）

  > ✅ Automated — `/s?s=` payload の encode/decode roundtrip は `packages/app/src/utils/inline-share.test.ts` が担保する（サンプルは `examples/en/feature-samples/minimal.krs` から生成）

### 手動確認（CI で検証できない項目）

- [ ] M-1: guide の worked example の短縮宛先 `/s?s=<payload>` URL を karasu-nest（`karasu.kompiro.dev`）で開くと、`minimal.krs` の system 図が表示されること
- [ ] M-2: その `/s?s=` URL を taka で短縮し、短縮 URL を Slack / Discord / X に貼ると、`/s?s=` の OGP（system 図 PNG）で unfurl されること（#1786 の end-to-end 課題に合流）
- [ ] M-3: 短縮 URL を消しても `source`（in-repo `.krs`）から構造が復元できること（＝リンクが単一障害点でないことの確認）
