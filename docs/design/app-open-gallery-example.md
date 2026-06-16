# gallery の example を app で開く（id 指定・固定 origin fetch）

- **Issue**: [#1646](https://github.com/kompiro/karasu/issues/1646)
- **PR**: [#1660](https://github.com/kompiro/karasu/pull/1660)
- **日付**: 2026-06-16
- **ステータス**: 検討中

## 背景・課題

ADR-20260616-08 で「アプリは最小シードに徹し、網羅 example カタログは docs gallery が担う」と決めた。残るのは「gallery で見た example を app に取り込んで触る」導線（#1646）。当初は「任意 URL からの import」を考えたが、ブラウザ内 fetch とはいえ **未信頼コンテンツの読み込み（描画経路の XSS 余地）・ビーコン/フィッシングの踏み台**になりうるため、任意 URL は採らない。

代わりに **example を id（slug + lang）で指定し、app が固定の karasu raw origin から組み立てて fetch する**。ユーザーは URL を一切渡さない。

## 現状（インベントリ）

| 観点 | 現状 |
| --- | --- |
| ProjectMode 取り込み | `ProjectSelector.onImportProject(file)` → `ProjectModeApp.importProject` → `import-project-zip.ts`（zip-slip / bomb / 拡張子 `.krs`/`.krs.style` を検証）→ `ADD_PROJECT` reducer |
| URL パラメータ | `main.tsx` が `?reference` を既に解釈。`?example=…` 追加は容易 |
| example の所在 | `examples/<lang>/<name>/`（ADR-20260616-08）。raw は `raw.githubusercontent.com/kompiro/karasu/<ref>/examples/<lang>/<slug>/<file>`（CORS 許可） |
| openable な集合 | docs gallery の manifest（`packages/docs-site/scripts/lib/examples-manifest.ts`）と同じ slug 群。app からは参照できない（別 package） |

## Related TPLs

- [TPL-20260510-17](../test-perspectives/TPL-20260510-17-trust-boundary-input-validation.md) — 信頼境界での入力検証。`?example`/`?lang` は外部入力なので slug/lang を厳格 validate し、固定 origin 以外には絶対に fetch しない。

## 制約・前提

- **任意 URL fetch はしない**。fetch 先は **コード内定数の origin + テンプレート**で組み立てる（`RAW_BASE = https://raw.githubusercontent.com/kompiro/karasu/<ref>/examples`）。
- 入力は **slug（`^[a-z0-9-]+$`）と lang（`en`|`ja`）のみ**。テンプレートに差し込む前に厳格検証。`..` やパス区切りは slug に出現し得ない。
- fetch は **redirect を追従しない**（`redirect: "error"` か最終 URL の origin 再検証）。サイズ上限は ZIP import の caps を流用。
- 取り込んだ `.krs` は **parse されるだけで実行されない**。描画は既存のサニタイズ経路に乗る。
- これは最小シード（ADR-20260616-08）への **上乗せ**。bundled seed には影響しない。

## 検討した選択肢

### A. id 指定・固定 origin fetch（採用）

`?example=<slug>&lang=<lang>` deep-link（＋将来 in-app の「Open an example」一覧）→ slug/lang を validate → `RAW_BASE/<lang>/<slug>/<entry>` を fetch → `Project` を組み立て `ADD_PROJECT`。gallery 各ページに「Open in the app」ボタン（`https://karasu.pages.dev/?example=<slug>&lang=<lang>`）。

**メリット**: 任意 fetch ゼロ・allowlist バイパスの余地ゼロ。用途（gallery→app）に直結。
**デメリット**: 開けるのは karasu の example のみ（仕様として妥当）。

### B. origin allowlist 付き URL import（不採用）

ユーザーが URL を渡し、allowlist origin のみ許可。A より柔軟だが、allowlist の厳密化（ホスト完全一致・redirect 拒否・`@`/サブドメイン詐称対策）が必須で、攻撃面が増える。用途に対して過剰。

## 現時点の方針（確定）

**案 A を採用**。確定事項:

- **fetch ref は `main`**（`RAW_BASE = https://raw.githubusercontent.com/kompiro/karasu/main/examples`）。drift は diagnostics で表面化させ、リリースタグ運用は持たない。
- **MVP から multi-file 対応**。entry を fetch 後、`import` / `@import` を辿って同 origin から相対パス解決で再帰取得し、`Project`（複数ファイル）を組み立てる。
- **openable manifest は `packages/core` に共有**（`{ slug, lang[], entry }`）。app（fetch / validate）と docs-site（gallery ボタン生成）が同じ正典を参照し、二重管理を避ける。
- **UI は deep-link のみ**。gallery の「Open in the app」ボタン経由。app 内の example 一覧 UI は作らない。

### 実装の指針

1. **共有 manifest**（`packages/core`）: openable example の `{ slug, lang[], entry }` を export。slug 検証・再帰 fetch の起点・gallery ボタン生成に使う。
2. **fetch util**（app）: `loadExampleProject(slug, lang)` — slug(`^[a-z0-9-]+$`)/lang(`en`|`ja`) を validate → `RAW_BASE/<lang>/<slug>/<entry>` を `fetch`（`redirect: "error"` / サイズ上限は import-zip の caps 流用）→ entry の `import`/`@import` を辿って同 origin から再帰取得（パスは slug 配下に限定）→ `Project` 構築 → 既存の `ADD_PROJECT` 経路へ。失敗（offline / 404 / parse error）は UI でグレースフルに表示。
3. **deep-link**: `main.tsx`/`ProjectModeApp` が `?example`/`?lang` を解釈し起動時に `loadExampleProject` を呼ぶ。
4. **gallery（docs-site）**: 各 example ページに「Open in the app」ボタン（`https://karasu.pages.dev/?example=<slug>&lang=<lang>`）。
5. **テスト**: slug/lang validate（不正入力で一切 fetch しない）/ 単一・multi-file の fetch 成功で Project 生成 / 失敗時 UX。`fetch` は mock。再帰 fetch が slug 配下の同 origin に限定されることを assert。
6. **AT**: `docs/acceptance/1646-open-gallery-example.md`。
7. **ADR 昇格**: 実装完了後に昇格、本 Design Doc を同 PR で削除。

### 影響範囲・マイグレーション

- 既存ユーザー: 影響なし（導線追加のみ。bundled seed・既存 import 不変）。
- docs-site: gallery ページにボタン追加 + core manifest 参照。
- セキュリティ: 固定 origin のみ・入力 validate・redirect 不追従・再帰は slug 配下限定（TPL-20260510-17）。
