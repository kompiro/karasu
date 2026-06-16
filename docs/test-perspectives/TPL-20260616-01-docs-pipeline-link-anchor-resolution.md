---
id: TPL-20260616-01
title: "docs/ を別系統へ取り込むパイプラインは repo-relative リンクと明示アンカーの未解決をビルド時に fail させる"
status: active
date: 2026-06-16
applicable_to:
  - "`docs/` の markdown を別の成果物（ドキュメントサイト・生成コンテンツ・別フォーマット）へ変換・取り込むパイプラインを追加 / 変更するとき"
  - "repo-relative なリンク（`../spec/syntax.md`）や明示アンカー（`<a id>` / 見出し slug）を別の URL 体系へ書き換える処理を足すとき"
  - "`PUBLISHED_EN_FILES` のような「サイトに載せるファイル集合」を変更するとき（集合から外したページを指すリンクが残ると 404 になる）"
known_consumers:
  - docs-site
discovered_from:
  - root_cause_file: "packages/docs-site/scripts/check-links.ts"
  - root_cause_file: "packages/docs-site/scripts/lib/rewrite.ts"
related_to:
  - TPL-20260511-02
  - TPL-20260510-10
topic: build
scope:
  packages:
    - docs-site
---

# TPL-20260616-01: docs/ を別系統へ取り込むパイプラインは repo-relative リンクと明示アンカーの未解決をビルド時に fail させる

## 観点

`docs/` の markdown は GitHub 上で素読みすることを前提に **repo-relative リンク**（`../spec/syntax.md`、`../../examples/...`）と **明示アンカー**（`<a id="goals-and-non-goals">` や見出しの GitHub-style slug）で相互参照している。これを別系統 — ドキュメントサイト（`@karasu-tools/docs-site`）・生成コンテンツ・別フォーマット — へ取り込むときは、リンクとアンカーを取り込み先の URL 体系へ書き換える必要がある。

この書き換えは **静かに壊れる**。リンクの解決先が間違っていても、アンカーが存在しなくても、変換そのものは成功し、ビルドは緑のまま、デプロイされたサイトで初めて 404 / 死んだページ内リンクとして現れる。原典（`docs/`）とサイトのリンク体系という「同じ意図を 2 つの表現で持つ」構造であり、TPL-20260511-02（spec doc ↔ reference data の片方向同期）の link/anchor 軸版にあたる。

したがって **取り込みパイプラインは、サイト内部を指すリンク・アンカーの未解決をビルド時に検出して fail させる**。具体的には (1) in-site リンクの解決先ルートが公開ページ集合に存在する、(2) `#fragment` 付きリンクの指すアンカーが取り込み先ページに実在する（見出し slug は本番と同じ `github-slugger` で算出、`<a id>` は本文から抽出）、(3) ページ内 `#anchor` リンクも同様に検証する、を assert する。サイト外（`examples/` / ADR / 外部 URL）へ出るリンクは GitHub URL へ落とすだけで本チェックの対象外にする — 片方向に絞ることで、`docs/` が追いついていない過渡期に test が脆くならないようにする（TPL-20260511-02 と同じ理由）。

この観点は実際に機能した: docs-site 導入 PR（#1575）で `check-links` が `docs/spec/tags-annotations.ja.md` の `./syntax.ja.md#client-capability` を検出した。ja 見出し `#### \`client\` の \`capability\`` の slug は `client-の-capability` であり、英語アンカーをそのまま流用したリンクが既に壊れていた。多言語ドキュメントでアンカーは言語ごとに slug が変わる点が、この種の drift の典型的な発生源。

## 想定される失敗モード

- in-site リンクの書き換え規則が間違っていて（base path の扱い・ロケール prefix の付け忘れ・相対段数の誤り）、リンクが 404 になるがビルドは通る。
- 多言語で英語アンカーを ja ページにそのまま流用し、`#client-capability` のように slug が一致せず死ぬ（#1575 で実際に発生）。
- `PUBLISHED_EN_FILES` からページを外した / リネームしたのに、他ページからそのページを指す in-site リンクが残り、解決先ルートが消えて 404。
- 見出しテキストを変えてアンカー slug が変わったのに、別ページの `#old-slug` リンクを直し忘れる。
- アンカー検証を本番と違う slug アルゴリズムで実装し、検査は通るのにサイトでは別 id が振られて死ぬ（必ず `github-slugger` = rehype-slug と同じものを使う）。
- 逆向き（サイト外リンクの到達性まで厳密に検証）を入れてしまい、外部 URL の一時的な不達で無関係に CI が落ち続け、チェックがミュートされる。

## チェックリスト

`docs/` を別系統へ取り込むパイプライン、またはリンク/アンカーの書き換え・公開ページ集合を変更するときに確認する:

- [ ] in-site リンクの解決先ルートが公開ページ集合に存在することをビルド時に assert しているか。存在しなければ fail するか。
- [ ] `#fragment` 付きリンクのアンカーが取り込み先ページに実在することを assert しているか。見出し slug は本番と同じ slugger（`github-slugger`）で算出しているか。
- [ ] ページ内 `#anchor` リンク（同一ページ内ジャンプ）も検証対象に含めているか。
- [ ] 多言語ページで、アンカーをロケールごとに正しく解決しているか（英語アンカーの ja ページへの流用を検出できるか）。
- [ ] 公開ページ集合（`PUBLISHED_EN_FILES` 等）からページを外す / リネームするとき、それを指す in-site リンクが残っていないことを同じチェックで担保しているか。
- [ ] サイト外リンク（`examples/` / ADR / 外部）は GitHub / 外部 URL へ落とすだけで、到達性の双方向検証はしていないか（片方向に留めて test を脆くしない）。
- [ ] コードフェンス内の `](...)` を書き換え・検証の対象から除外しているか（`krs` 例の中のリンク様文字列を誤書き換えしない）。

## 既知の対処パターン

- **取り込み先内部リンクの片方向解決チェック**: 取り込み対象の markdown を走査し、サイト内部を指すリンク/アンカーだけを「公開ルート集合」「ページごとのアンカー集合」と突き合わせて未解決を fail させる（`packages/docs-site/scripts/check-links.ts` がこの形）。リンク分類（in-site / repo / external / in-page）はリライタと共通の resolver（`resolveLink`）に集約し、「書き換える側」と「検証する側」が同じ判定を使うことで両者の食い違いを防ぐ。
- **本番と同じ slugger を使う**: 見出しアンカーは Starlight（rehype-slug）と同じ `github-slugger` で算出する。検証を自前の簡易 slug で書くと「検査は緑なのにサイトでは別 id」という最悪の偽陰性を生む。
- **base-agnostic な route-relative リンク**: GitHub Pages の base path（`/karasu/`）を埋め込まず、ページ間リンクを route-relative（`../../spec/syntax/`）で出すと、base が変わっても（`/` でも `/karasu/` でも）ブラウザが正しく解決する。base のハードコードによる一括 404 を避けられる。

## 関連テスト

- `packages/docs-site/scripts/check-links.ts` — in-site リンク/アンカー未解決でビルドを fail させるガード（本 TPL の主たる担保）。`pnpm --filter @karasu-tools/docs-site run build` と `.github/workflows/pages.yml` で実行される
- `packages/docs-site/scripts/lib/rewrite.test.ts` — リンク書き換え（route-relative / GitHub URL / アンカー保持）と `collectAnchors`（見出し slug / `<a id>`）の単体テスト

## 派生元 spec

- なし（spec / concepts の新規セクションではなく、`docs/` 取り込みパイプラインの構造的リスクに対する proactive TPL）。原典の設計判断は [docs-site SSG 選定の Design Doc](../design/docs-site-ssg.md)（#1575）、同期観点の親は [TPL-20260511-02](TPL-20260511-02-spec-doc-reference-data-sync.md)。
