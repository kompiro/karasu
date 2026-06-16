---
id: ADR-20260514-01
title: マルチファイル import の意味論 — whole-file import / system 再オープン / DAG 再到達
status: accepted
date: 2026-05-14
topic: resolver
related_to:
  - ADR-20260405-03
  - ADR-20260409-05
  - ADR-20260409-06
  - ADR-20260513-03
scope:
  packages: [core, app, cli]
assumptions:
  - "file: packages/core/src/fs/import-resolver.ts"
  - "symbol: packages/core/src/fs/import-resolver.ts :: resolvedCache"
  - "symbol: packages/core/src/fs/import-resolver.ts :: loadingKrs"
  - "symbol: packages/core/src/fs/import-resolver.ts :: reconcileLabel"
  - "grep: packages/core/src/types/ast.ts :: system-property-conflict"
  - "grep: docs/spec/syntax.md :: Multi-file import semantics"
  - "file: examples/ja/multi-file-system/index.krs"
  - "file: examples/ja/multi-file-system/infra.krs"
---

# ADR-20260514-01: マルチファイル import の意味論 — whole-file import / system 再オープン / DAG 再到達

- **日付**: 2026-05-14
- **ステータス**: 決定済み
- **関連**:
  - Issue: [#1381](https://github.com/kompiro/karasu/issues/1381) — Multi-file split of a single `system` block does not merge cleanly via `import "file.krs"`
  - 設計 PR: [#1382](https://github.com/kompiro/karasu/pull/1382)（旧 `docs/design/import-semantics-redesign.md` — 本 ADR に集約して削除）
  - 仕様化 PR: [#1383](https://github.com/kompiro/karasu/pull/1383) — `docs/spec/syntax.md` §「Multi-file import semantics」追加 + proactive TPL 5 件
  - 実装 PR: [#1384](https://github.com/kompiro/karasu/pull/1384) — resolver の修正と end-to-end の例
  - 関連 ADR: [ADR-20260405-03](20260405-03-wildcard-import-two-pass-resolution.md)（wildcard import / 2 パス解決）, [ADR-20260409-05](20260409-05-directory-import.md)（ディレクトリ import）, [ADR-20260409-06](20260409-06-named-import-toplevel-service.md)（top-level service named import）, [ADR-20260513-03](20260513-03-import-system-nested.md)（system 配下 named import の path 構文）
  - フォローアップ Issue: [#1385](https://github.com/kompiro/karasu/issues/1385)（infra block の cross-file reopen）, [#1386](https://github.com/kompiro/karasu/issues/1386)（karasu の style-prescriptive warning に対する立場）

## 背景

karasu の import 形式は ADR-20260405-03 以降に段階的に拡張されてきた。`import "p.krs"`（whole-file / wildcard）、`import { Foo } from "p.krs"`（named）、`import "dir/"`（directory）、`import { A.B.C } from "p.krs"`（system 配下 named — ADR-20260513-03）の 4 形式が存在する。しかし「1 つの `system` を複数ファイルに分割し、`index.krs` で `import "..."` を並べて束ねる」という自然なユースケース（Issue #1381）で次の挙動が起きていた:

1. DAG 経由で同じファイルに 2 経路で到達すると `circular-import` 警告が誤発火する
2. 同じファイルを named import で先に取り込んだ後で whole-file import すると、後者の結果が空 `KrsFile` になり中身がサイレントに消失する
3. 同名 `system` の再オープンは実装上サポート意図があったが spec で未定義、`label` / `description` の衝突時の挙動も未定義
4. `deploy` / `organization` を whole-file import で伝搬する規則が未定義（実装は意図していたが穴があった）
5. dangling edge endpoint（未解決の参照先）が source / target ノードを巻き添えにする実装になっていた

実装ミスのうち (1)〜(2) は `visitedKrs` が「ロード中」と「ロード済み」を兼任していたこと、wildcard merge の `database` / `queue` / `storage` / `client` / `domain` / `legend` 伝搬漏れ、ノード identity ベースの dedup 不在が原因。だが根本原因は **import の意味モデルが spec に明文化されていない** ことで、ユーザーの自然な期待と実装の挙動の食い違いを文書だけでは判定できなかった。

karasu は **テキスト記述で論理 / 物理 / 組織の三面を可視化する** ツールであり、import は「モデルの単位（system / deploy / organization）」を「ファイルの単位」から切り離す主要メカニズム。意味論を spec に明文化し、proactive TPL でその規定が将来の変更で破られないよう固定する必要があった。

## 決定

`docs/spec/syntax.md` §「Multi-file import semantics」(S1〜S7) を canonical な規定として制定し、resolver をその規定に揃える。proactive TPL 5 件 (TPL-20260514-01〜05) をそれぞれの S 規定に対応付けて bidirectional に紐付ける。

### 主要な規定

- **S1 — 4 つの import 形式**: style import / named / whole-file / directory。directory は配下 .krs を alphabetical 順で whole-file 相当として処理。
- **S2 — whole-file merge**: `import "p.krs"` は p.krs を再帰的に完全展開した `KrsFile` を取り込む。解決結果は **ファイル単位で memoize** され、複数経路から到達しても 1 度だけ計算される。
- **S3 — system 再オープン**: 同名 `system` は children を id ごとに union merge。本体プロパティ（`label` / `description` / タグ）は **import グラフの root（= `ImportResolver.resolve()` に渡された entry file = App / CLI で開いているファイル）に近い側が勝つ**。non-empty 衝突は `system-property-conflict` 警告。
- **S4 — deploy / organization 再オープン**: S3 と同じ規則を `deploy` / `organization` に適用。`realizes` / `owns` 等の relation も union。
- **S5 — DAG ≠ cycle**: import グラフは DAG を許す。真の循環（loading スタックに既に居る）のみ `circular-import` 警告。
- **S6 — dangling edge は node を残す**: edge / relation の endpoint 未解決時、edge は drop + 警告、source / target ノードは保持。
- **S7 — 決定的順序**: source order × alphabetical directory expansion × find-or-create で同一プロジェクトは同一 AST を生む。

### 再発防止フレームワーク (F1〜F4)

意味モデルが spec から漏れる構造的原因を断つため、TPL ↔ spec / ADR の双方向トレーサビリティを `docs/process.md` と `CLAUDE.md` に明文化:

- **F1**: TPL frontmatter の `spec_section` / spec 章末尾の `> Related TPLs:` で双方向リンク
- **F2**: `docs/spec/` / `docs/concepts*.md` に新規セクションを追加する PR は proactive TPL を最低 1 件同梱（または既存 TPL に back-ref）
- **F3**: DesignDoc / ADR 提出時に spec が含意するテスト観点を proactive TPL として起こす
- **F4**: proactive 比率を `docs/test-perspectives/README.md` の健全性指標として明記

これにより「spec が書かれた時点で proactive TPL が起こされている」状態を制度化する。

## 理由

- **意味論の明文化を先に**: 仕様 PR → 実装 PR → ADR の 4 段で進めることで、ユーザー期待と実装の食い違いを spec レビューで確定してから実装に進めた。今回のように retrospective TPL を 1 件も生まずに proactive 5 件で済んだのが proactive-first ライフサイクル（`docs/test-perspectives/README.md` 「TPL のライフサイクル」）の理想形。
- **root entry 優先 + warning**: ユーザーの WYSIWYG メンタルモデル（App / CLI で開いているファイルがプレビューに反映される）と一致する。AST ビルダーに「現在開いているファイル」を別パラメータで渡す必要はなく、既存の `entryPath` 引数がそのまま機能する。サイレントな上書きを防ぐため `system-property-conflict` 警告で採用 / 無視を明示する。
- **identity dedup**: cache + DAG 再到達では同一ノードインスタンスが複数経路で merged に流入しうる。id 一致だけで dedup すると別ファイルの同 id 重複（本来 error すべきケース）と区別できないため、**インスタンス同一性** で dedup を判定し、別インスタンス + 同 id は `duplicate-node-in-system` を維持する。
- **edge endpoint 未解決でノードを残す**: node は宣言された場所に存在する責任、edge は両 endpoint の合意の責任、と責任を分離する。連鎖的にノードが消える二次被害（#1381 で `LicenseApply` が `LicenseManagement` 不在で消えた）を構造的に防ぐ。
- **再発防止フレームワークの制度化**: 今回の bug は「concept / spec の含意を proactive TPL に落とせていなかった」ことが構造的原因。同じ shape の bug を将来踏まないため、spec 改訂 PR チェックリストとして組み込む。

## 却下した案

- **A. system 再オープンを禁止する**: 同名 system の重複を error にする案。大規模モデルを複数ファイルに分割する自然な書き方を封じてしまう。Issue #1381 のユーザー期待は妥当でサポートする方が karasu の三面可視化原則と一致する。却下。
- **B. whole-file import に新構文（`import * from "p.krs"`）を追加**: ADR-20260405-03 で既に検討・却下済み。冗長でメリットなし。本 ADR でも継承。
- **C. dangling edge で node も drop**: 「孤立した node を GC」する案。連鎖的にノードが消えると debug 不能なサイレント失敗が起きる（#1381 で実際に起きた）。node は宣言された場所に存在するという原則を守る方が良い。却下。
- **D. property conflict を error にする**: 同名 system の `label` 衝突を error にする案。実用上、ファイルを分割している最中の中間状態で error が大量発生して開発がブロックされる。warning に留めて修正は任意とする方が良い。却下。
- **E. cache を導入せず merge 側で dedup**: identity dedup だけで対応する案。それでも resolveKrsFromMap の再呼び出しは発生し、深い import グラフで指数的に遅くなる。ファイル単位の memoization が単純で効果も大きい。却下。

## フォローアップ

本 ADR は `system` / `deploy` / `organization` の再オープンを対象とする。**`database` / `queue` / `storage` の cross-file reopen** は別 Issue #1385 で扱う（実装 PR で wildcard merge の伝搬経路は塞いだが、複数ファイルでの **同 id 再宣言** の意味論はまだ明文化されていない）。`database-per-service` 原則に対する karasu の立場は Issue #1386 で議論する。
