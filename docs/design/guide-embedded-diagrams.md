# docs/guide に hero スニペットのレンダリング済み SVG を埋め込む

- **日付**: 2026-06-16
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#1574](https://github.com/kompiro/karasu/issues/1574)
  - 元になったガイド: PR [#1561](https://github.com/kompiro/karasu/pull/1561)
  - 関連 TPL:
    - [TPL-20260511-02](../test-perspectives/TPL-20260511-02-spec-doc-reference-data-sync.md) — 正典と再掲の片方向 drift check（本設計の drift gate はこの系譜）
    - [TPL-20260510-18](../test-perspectives/TPL-20260510-18-text-as-single-source-of-truth.md) — テキストを単一の正典に保つ
    - [TPL-20260510-11](../test-perspectives/TPL-20260510-11-parallel-function-parity.md) — en/ja の並行成果物のパリティ
    - [TPL-20260510-12](../test-perspectives/TPL-20260510-12-ast-parser-renderer-agreement.md) — render の決定性
  - コード: `packages/core/src/index.ts`（`compile()`）、`scripts/reference/gen-docs.ts`（`--check` の先例）

## 背景・課題

`docs/guide/`（5 章 × en/ja）の各章には説明用の `.krs` スニペットが fenced code block として埋め込まれているが、**コードだけ**で実際の出力図は載っていない。読者は karasu の auto-layout が実際にどんな図を出すかを見られない。

#1574 のねらいは show-don't-tell: 各「hero」スニペットの**真横（下）にレンダリング済みの図**を置き、実出力を見せる。`docs/concepts.md` の non-goal（karasu は pixel-perfect layout を追わない）とも整合する — 実際の auto-layout 出力をそのまま見せるのが誠実。

## 現状（インベントリ）

| 観点 | 現状 |
| --- | --- |
| ガイド構成 | `docs/guide/0[1-5]-*.md` と対の `*.ja.md`、`README.md`/`README.ja.md` |
| inline `<svg>` | GitHub は markdown 内 inline `<svg>` を sanitize する → SVG は**ファイル**として commit し `![](diagrams/x.svg)` で参照する必要（`docs/github-actions.md` と同じ render-and-commit パターン） |
| レンダリング API | `compile(krsSource, { diagramType, theme })` が `{ svg, diagnostics, warnings }` を返す（`packages/core/src/index.ts`）。CLI を経由せず core を直接呼べる |
| CLI render | `karasu render <file> --view system\|deploy\|org` は file 引数必須・**stdin 非対応**。default は全 view を CSS タブで束ねた SVG（静的画像には不適） |
| drift check の先例 | `gen:reference`（`scripts/reference/gen-docs.ts`）が `--check` で in-memory 再生成 → disk と比較 → 差分あれば exit 1。CI は `reference-docs-check.yml` で実行 |
| fence 検出 | `scripts/lint/spec-structure-sync.ts` に CommonMark 準拠の fence 検出正規表現あり（再利用可） |
| diagrams ディレクトリ | 未存在（新規に `docs/guide/diagrams/` を作る） |

## 制約・前提

- inline SVG は使えない（GitHub sanitize）→ ファイル commit + 画像参照。
- 全スニペットは描かない。`.krs.style`（css）ブロック・`legend`/部分断片・CLI 出力・partial example は単独図にならない。**hero スニペット（full system / overview）約 10〜15 件のみ**。
- 単一 view でレンダリング（`--view system|deploy|org` 相当）。default の全 view バンドルは静的画像に不適。
- en/ja でラベルが異なる → 言語別に `x.svg` / `x.ja.svg` を生成。
- `compile()` は決定的 → 再生成は diff-stable（drift check の前提）。
- **スニペットの単一正典は markdown の fenced block**。サイドカー `.krs` を別に置いて二重管理しない（[TPL-20260510-18](../test-perspectives/TPL-20260510-18-text-as-single-source-of-truth.md)）。
- Out of scope: 全スニペット描画 / interactive 埋め込み / pixel-perfect layout 調整。

## 検討した選択肢

### 軸A: スニペットの正典をどこに置くか

#### 案A1: markdown の fenced block を正典にし、そこから SVG を導出（採用）

fenced block はそのまま残し、直上の HTML コメントマーカーで「描画対象」を指定する。例:

```
<!-- render: system id=01-monolith -->
​```krs
system Shop { ... }
​```
<!-- diagram:begin id=01-monolith -->
![Shop system view](diagrams/01-monolith.svg)
<!-- diagram:end id=01-monolith -->
```

ジェネレータはマーカー直後の fenced krs を抽出し、指定 view を `docs/guide/diagrams/<id>.<lang>.svg` にレンダリングし、`diagram:begin`〜`diagram:end` の管理区間に画像参照を挿入/更新する。

**メリット**

- スニペットの正典が 1 箇所（fenced block）。サイドカー `.krs` の drift が原理的に発生しない。
- 既にガイドの syntax-check で使われている「fenced block 抽出」発想の延長。
- `gen:reference` の managed-region 置換と同じ実装パターンを流用できる。

**デメリット**

- markdown にマーカーという軽い構文負債が増える。

#### 案A2: サイドカー `.krs` ファイルを置き、ガイドからは画像のみ参照

**メリット**: ジェネレータが markdown を編集しなくてよい。
**デメリット**: スニペットが markdown とサイドカーで二重化し drift する。[TPL-20260510-18](../test-perspectives/TPL-20260510-18-text-as-single-source-of-truth.md) に正面から反する。**却下**。

### 軸B: レンダリング経路

#### 案B1: core の `compile()` を直接呼ぶ（採用）

ジェネレータ（`scripts/guide/`）から `compile(krs, { diagramType, theme })` を呼ぶ。CLI は file 必須・stdin 非対応なので、抽出した krs 文字列を直接渡せる core API が適切。subprocess なしで速い。

#### 案B2: 抽出した krs を temp ファイルに書き CLI render を呼ぶ

**デメリット**: temp ファイル・subprocess のオーバーヘッド。core API があるのに迂回する理由がない。**却下**。

### 軸C: drift gate の置き場所

#### 案C1: `gen:guide-diagrams --check` を既存 `reference-docs-check.yml` に追加（採用）

`gen:reference --check` と同じ job に `pnpm gen:guide-diagrams --check` を足し、path trigger に `docs/guide/**` を加える。drift（SVG ファイル or 画像参照が stale）なら exit 1。

#### 案C2: 専用の新規 workflow

**デメリット**: 既存の generated-doc check job と性質が同じ。job を増やす必然がない。**却下**。

## 現時点の方針

**案A1 + 案B1 + 案C1 を採用する。** fenced block を単一正典に保ったまま（A1）、core の `compile()` で決定的にレンダリングし（B1）、`gen:reference` と同じ `--check` drift gate を既存 CI job に相乗りさせる（C1）。Issue の "single source, no duplication" と既存の generated-doc drift 運用（[TPL-20260511-02](../test-perspectives/TPL-20260511-02-spec-doc-reference-data-sync.md)）にそのまま乗る形。

### 確定した事項

1. **テーマ**: ガイド埋め込みの SVG は `light` テーマでレンダリングする（GitHub の白背景 markdown で読みやすいため）。`compile(krs, { diagramType: view, theme: "light" })`。
2. **マーカー構文**: `<!-- render: <view> id=<id> -->`（view は `system|deploy|org`、id は kebab・ファイル内 unique）。
3. **配置**: 図はコード block の**下**（caption 任意）。side-by-side（HTML table）は将来の refinement とし今回はやらない。

### 実装の指針

1. `scripts/guide/gen-guide-diagrams.ts` を新規作成:
   - `docs/guide/*.md` を走査し `<!-- render: <view> id=<id> -->` マーカーを検出。
   - マーカー直後の fenced krs を抽出（`spec-structure-sync.ts` の fence 検出を共通化 or 流用）。
   - `compile(krs, { diagramType: view, theme })` で SVG 生成。
   - lang はファイル名（`*.ja.md` → ja、それ以外 → en）から決定し `docs/guide/diagrams/<id>.<lang>.svg` へ書き出し。
   - `<!-- diagram:begin id=<id> -->`〜`<!-- diagram:end id=<id> -->` の管理区間に `![caption](diagrams/<id>.<lang>.svg)` を挿入/更新（`gen:reference` の applyBlock パターン）。
   - `--check`: 書き込まず in-memory 再生成し、SVG ファイル内容と markdown 画像参照の双方を disk と比較。drift があれば stale 一覧を stderr に出し exit 1。
2. `package.json` に `"gen:guide-diagrams": "tsx scripts/guide/gen-guide-diagrams.ts"` を追加。
3. hero スニペット約 10〜15 件にマーカーを付与（Issue の候補リストを起点に最終選定）。各章 en/ja 両方。
4. 生成された `docs/guide/diagrams/*.svg` を commit。
5. CI: `reference-docs-check.yml` に `pnpm gen:guide-diagrams --check` を追加、path trigger に `docs/guide/**` を追加。
6. lefthook の generated-doc 系 hook があれば同様に追加（push 前検出）。
7. ドキュメント: `docs/process.md`（または `docs/guide/README.md`）に再生成手順（`pnpm gen:guide-diagrams`）を 1 節追記。
8. AT: `docs/acceptance/` に新規ファイル。TC は:
   - マーカー付き block から指定 view の SVG が `diagrams/<id>.<lang>.svg` に生成され、画像参照が block 直下に挿入される。
   - 再実行で差分ゼロ（決定性 / idempotent）。
   - スニペットを 1 行変えると `--check` が exit 1（drift 検出）。
   - en と ja で別 SVG（`<id>.svg` / `<id>.ja.svg`）が生成される。
9. proactive TPL: 本設計は既存 TPL（02 / 18 / 11 / 12）で観点が概ねカバーされるため新規 TPL は起こさず、AT と PR description で上記 TPL を back-ref する（spec/concepts への新規節追加はないため proactive TPL 同梱の必須対象外）。
10. ADR 昇格: 実装完了後 `docs/adr/1574-guide-embedded-diagrams.md`（番号は Issue/PR に従う）として昇格し、本 Design Doc は同 PR で削除する。

### テスト観点（TPL 確認結果）

- [TPL-20260511-02](../test-perspectives/TPL-20260511-02-spec-doc-reference-data-sync.md): 正典（fenced block）から再掲（SVG・画像参照）への片方向 drift を `--check` で縛る。本設計の drift gate はこの観点の素直な適用。
- [TPL-20260510-18](../test-perspectives/TPL-20260510-18-text-as-single-source-of-truth.md): スニペットの正典を markdown 1 箇所に保つ（案A2 却下の根拠）。
- [TPL-20260510-11](../test-perspectives/TPL-20260510-11-parallel-function-parity.md): en/ja で SVG を対に生成し、両言語の図が揃っていることを担保。
- [TPL-20260510-12](../test-perspectives/TPL-20260510-12-ast-parser-renderer-agreement.md): `compile()` の決定性に依存するため、再生成 diff-stable を AT で固定。

### 影響範囲・マイグレーション

- 既存ユーザーへの影響: なし（ドキュメントとビルド時ツールのみ。ランタイム成果物に影響なし）。
- ドキュメント更新: `docs/guide/*.md`（マーカー + 画像参照）、`docs/guide/diagrams/*.svg`（新規）、再生成手順の追記。
- テスト・examples への影響: なし（examples は変更しない）。新規 AT と script test を追加。
- CI: `reference-docs-check.yml` に 1 ステップ + path trigger 追加。

## 未解決の問い / 決めないこと

- hero スニペットの最終選定（実装時に図の見栄えを見て確定）。
- side-by-side レイアウト（HTML table）は将来 refinement。今回は code の下に縦並び。
- `karasu diff` の SVG 埋め込み（Issue で optional 扱い）は今回スコープ外でよいか。
