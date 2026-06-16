---
id: TPL-20260616-02
title: "全診断コードは規則カタログに 1 件の項目を持つ（規則 ↔ 診断の双方向完全性）"
status: active
applicable_to:
  - "core に新しい診断コード（`DiagnosticParamsByCode`）や warning kind（`WarningKind`）を追加・改名するとき"
  - "`docs/spec/diagnostics.md`（規則カタログ）を編集するとき"
  - "規則（概念）と診断（メカニズム）を別レイヤーで併存させる spec を書くとき"
date: 2026-06-16
discovered_from:
  - issue: "#1623"
  - root_cause_file: "docs/spec/diagnostics.md"
related_to:
  - TPL-20260610-02
  - TPL-20260514-08
  - TPL-20260511-02
topic: parser
scope:
  packages:
    - core
---

# TPL-20260616-02: 全診断コードは規則カタログに 1 件の項目を持つ（規則 ↔ 診断の双方向完全性）

## 観点

karasu は問題報告を **規則（rule, 概念）** と **診断（diagnostic, メカニズム）** の
2 レイヤーで語る。`docs/spec/diagnostics.md` は両者を対応づけるカタログであり、
**core が emit する全コードがカタログにちょうど 1 件の項目として現れる**ことが
不変条件である。

TPL-20260610-02 が「spec の散文が約束した診断は実装されている」（spec → code）を
縛るのに対し、本観点は逆向き（code → spec カタログ）を縛る:

- **コード追加 → カタログ未記載**: 新しい診断コードや warning kind を core に
  足したのに `diagnostics.md` に項目を書き忘れると、ユーザー向けに「この警告は
  何の規則違反か」を辿る手段が欠ける。
- **改名 → 旧名がカタログに残留 / 新名が未記載**: 診断コードは LSP・app・下流
  ツールが消費する安定 API。改名するとカタログと emit 面が drift する。
- **en / ja で項目が片側にしか無い**: カタログは en/ja 対であり、片側だけの追加は
  spec parity を崩す。

いずれも「機能としては動くのでテストに出ない」drift で、放置するとカタログが
信頼できなくなる。

## 想定される失敗モード

- レビューや LSP の hover で診断コードを見たユーザーが、対応する規則を
  `diagnostics.md` で引けない（カタログに無い）。
- 規則の言い回しに引きずられて診断コードを rename し、`@karasu-tools/core` の
  consumer（LSP の quick-fix 等）が壊れる。
- en だけ項目を足し、ja カタログが古いまま放置される。

## チェックリスト

新しい診断コード / warning kind を追加・改名するとき:

- [ ] `docs/spec/diagnostics.md` と `diagnostics.ja.md` の双方に、適切な規則
      ファミリーの下で 1 件の項目（`code` / severity / 発火条件）を追加した
- [ ] 既存コードを **rename していない**（規則名と診断コードは別レイヤー。
      コードは安定 API なので、規則の言い回しに合わせて改名しない）
- [ ] 規則ファミリーの選択が妥当（1 コード = 1 規則。複数規則にまたがらない）
- [ ] `packages/core/src/types/diagnostics-catalog.test.ts` が green
      （カタログ ↔ コードの双方向完全性を assert する meta-test）

## 既知の対処パターン

`packages/core/src/types/diagnostics-catalog.test.ts` が
`DiagnosticParamsByCode` のキーと `WarningKind` のメンバーを型ソースから抽出し、
en/ja 両カタログに `code` として現れることを assert する。型はランタイムで erase
されるためソーステキストを正規表現で読む（reference-data の spec↔source sync,
TPL-20260511-02 と同じ「並列に存在するものは drift する」発想を診断面に広げた形）。

## 関連テスト

- `packages/core/src/types/diagnostics-catalog.test.ts` — カタログ完全性の meta-test
- `scripts/lint/spec-structure-sync.ts` — `diagnostics.md` / `.ja.md` の en/ja
  構造 parity（`SPEC_PAIRS` に登録）

## 派生元 spec

- `docs/spec/diagnostics.md` —「診断と規則のリファレンス」全体。特に
  「カタログの完全性」節が本 TPL を back-ref する。
</content>
