---
id: TPL-20260630-02
title: "ADR permalink の正は自己完結 /s?s= payload であり、短縮 URL を必須依存にしない"
status: active
date: 2026-06-30
applicable_to:
  - "ADR / 設計記録から karasu の構造（共有 URL・レンダリング済み図）へリンクする規約・スキーマ・生成器を設計するとき"
  - "self-contained なスナップショット URL と、その短縮形（shortener が発行する別名）の 2 表現を持ち、どちらを「正」として記録するか決めるとき"
  - "point-in-time の記録（ADR・監査ログ）が外部サービス（URL shortener / D1 等）に解決を依存するリンクを保持するとき"
known_consumers:
  - docs-site
  - app
  - adr-tools
discovered_from:
  - issue: "#1829"
related_to:
  - TPL-20260510-18
  - TPL-20260510-17
  - TPL-20260510-20
topic: adr-tooling
scope:
  packages:
    - app
    - docs-site
---

# TPL-20260630-02: ADR permalink の正は自己完結 /s?s= payload であり、短縮 URL を必須依存にしない

## 観点

ADR（point-in-time の記録）から karasu の構造へリンクするとき、**正（source of
truth）は自己完結した `/s?s=<payload>` URL** であり、短縮 URL（taka 等の
shortener が発行する別名）を正にしてはならない。短縮はあくまで**差し替え可能な
表示用の別名**であり、短縮レイヤを必須依存にしない。

理由は 2 つの不変条件に分解できる:

- **immutability** — payload は構造を凍結したスナップショットそのもの。decode
  すれば `.krs` が戻る。ADR は判断時点の構造を指すべきで、payload を正にすれば
  ref-pin なしで構造的に immutable になる（[TPL-20260510-18](TPL-20260510-18-text-as-single-source-of-truth.md)
  の「SoT は in-repo `.krs`」を、記録側では「凍結 payload が point-in-time の
  正」として継ぐ）。
- **依存の方向** — 短縮 URL は opaque で、shortener のレコードが消えると指す構造
  を失い、しかもそれを検出できない。正を payload に置けば、shortener が消えても
  リンクは生き残る（別名が切れるだけ）。短縮の有無は trust posture
  （図を第三者 shortener に預けるか）の**ユーザー選択**であり、規約が強制しない。

unfurl が要る共有では **`/s?s=`（query, server-visible）** を使う。`#s=`
（fragment）はサーバに届かず OGP が死ぬため、短縮の宛先にも `/s?s=` を使う。

## 想定される失敗モード

- 規約・スキーマ・adr-tools の生成器が**短縮 URL を正のフィールド**として記録し、
  payload を任意扱いにする。→ shortener 障害・レコード削除でリンクが死に、ADR から
  構造を再現できない（point-in-time 記録の喪失）。
- ADR に `#s=`（fragment）形を貼る／短縮の宛先を `#s=` にする。→ SNS / GitHub で
  unfurl されず、サーバ側の OGP 経路にも届かない。
- 「短縮 URL がきれい」という理由で payload を省く。→ taka（または任意 shortener）が
  karasu リンクの**必須依存**になり、機密構造を第三者 datastore に預けることを
  規約が暗黙に強制してしまう。
- deep permalink の対象を `label` で指す。→ i18n / 表示文字列は identity ではなく、
  rename で別名に化ける（[TPL-20260510-20](TPL-20260510-20-id-not-label-for-identity.md)）。

## チェックリスト

- [ ] ADR が保持する**正のリンクは `/s?s=<payload>`**（自己完結）か。短縮 URL は
      任意フィールド / 別名として扱われ、payload を置き換えていないか。
- [ ] 貼る・短縮する URL は `#s=`（fragment）ではなく **`/s?s=`（query）** か。
- [ ] 短縮レイヤ（taka 等）が**必須依存になっていない**か — payload が無くても
      成立する設計になっていないか（短縮を消しても正が無傷か）。
- [ ] deep target を指す場合、要素は author-given `id`（`label` ではない）で
      指しているか。
- [ ] 機密構造に対して「短縮しない／自前 shortener」を選べる旨が guide に明記
      されているか（trust posture のユーザー選択）。

## 既知の対処パターン

- **正は payload・短縮は別名**（design doc `adr-permalink-convention` の B-4）—
  `permalink:` を構造化するなら `payload` を必須、`short` / `source` / `view` を
  任意にする（`.claude/rules/adr.md`）。検証は payload の decode を必須とし、
  任意 `short` の 302 解決チェックは外部依存をテストに持ち込むため温度を下げる
  （#1830 へ申し送り）。
- **L1 / L2 の分離** — karasu を参照する ADR はユーザー repo にあり置き場所を
  強制できないため、「何を書くか」だけの portable guide（L1）を baseline にし、
  固定の置き場所＋機械検証は adr-tools 採用 repo（L2）に限定する。

## 関連テスト

- `docs/acceptance/adr-permalink-convention.md` — 規約どおりのサンプルで正が
  `/s?s=` payload・短縮が任意別名であることを確認する受け入れ条件。
- payload の roundtrip（encode → decode で `.krs` が戻る）は
  `packages/app/src/utils/inline-share.test.ts` が担保する。

## 派生元 spec

この観点は次のドキュメント節を proactive に守るために起こした（双方向 back-ref）:

- `docs/guide/adr-permalinks.md` / `.ja.md`（L1 portable guide）— `> Related TPLs:`
  注釈で本 TPL を参照する。
- `.claude/rules/adr.md` の「ADR から karasu 構造へリンクする（permalink）」節
  （L2 adr-tools 実装規約）。
