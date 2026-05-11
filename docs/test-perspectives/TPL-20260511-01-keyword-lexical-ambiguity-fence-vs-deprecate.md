---
id: TPL-20260511-01
title: "既存キーワードの語彙的曖昧さは、まず外部 fence（別 ADR）で意味を縛れるか検討してから deprecate を判断する"
status: active
date: 2026-05-11
applicable_to:
  - "既存キーワードの意味が二義的だと気づいたとき"
  - "予約語の解釈が将来機能（authz / codegen / runtime 等）に引っ張られそうなとき"
  - "新キーワードに既存実装側の概念と同じ語を当てそうなとき"
discovered_from:
  - issue: "#1281"
  - root_cause_adr: "ADR-20260511-04"
related_to: []
topic: core-concepts
scope:
  packages: [core]
---

# TPL-20260511-01: 既存キーワードの語彙的曖昧さは、まず外部 fence（別 ADR）で意味を縛れるか検討してから deprecate を判断する

## 観点

ある DSL キーワードが二義的（例: `role` が「actor archetype」と「RBAC permission bundle」の両方に読める）だと気づいたとき、最初に検討すべきは **deprecate ではなく「滑り台の起点を外部から塞ぐ ADR」が存在するか・作れるか** である。語の引力（lexical pull）は spec の 1 文と関連 ADR への参照で多くの場合縛れる。語そのものを除去する deprecate は spec / examples / parser / AST / renderer / LSP / 拡張に波及するため、外部 fence で意味が固定できるなら deprecate より低コストで等価な保護が得られる。

逆向きも同じ — 新キーワードを足すときに、その語が将来の実装側関心（authz / runtime / codegen 等）に引かれそうなら、語を選び直すか、初めから fencing ADR をペアで書くと将来の二義性を予防できる。

## 想定される失敗モード

- 「語が曖昧だから deprecate しよう」と直接マイグレーションに進み、spec / 14+ examples / lexer / parser / AST / renderer / LSP / 拡張への波及で PR が肥大化し、その間に「実は外部の ADR で意味を縛れば等価」だったと判明する。
- 逆に外部 fence だけで満足して spec の文言を直さず、ユーザー側に二義的な解釈が残り、後から RBAC 的誤用や `requires <keyword> = ...` のような疑似述語が `description` 内に書かれ始める。
- 新キーワード追加時に語の引力を考慮せず、半年後に同じ「二義性 → fence か deprecate か」の議論を別 Issue で再演する。

## チェックリスト

DSL キーワードの意味づけを決める／見直すときに確認する:

- [ ] そのキーワードが引き寄せうる「実装側の関心」（authz / runtime / codegen / metrics 等）を列挙し、既存または計画中の ADR でその関心が karasu の語彙から除外されているか確認したか。
- [ ] 除外 ADR が既に存在するなら、spec 側の文言にその ADR へのリンクを 1 文埋め込んで「これは X primitive ではない」と明示したか。
- [ ] 除外 ADR が存在しない場合、deprecate に進む前に「除外 ADR を先に書く」案と「キーワードを deprecate する」案のコストを比較したか。
- [ ] 新キーワードを追加するときは、その語が将来の実装側関心に引かれる可能性を検討し、引かれそうなら fencing ADR をペアで起こすか語を選び直したか。

## 既知の対処パターン

- **外部 fence パターン**: 滑り台の起点となる構文（述語式・属性宣言・policy ブロック等）を別 ADR で「導入しない」と決め、spec の該当キーワードの定義にその ADR へのリンクを 1 行埋める。例: `user.role` の存続を決めた ADR-20260511-04 は、authz 構文を取り込まない ADR-20260511-02 を外部 fence として参照することで成立している。
- **語の選び直しパターン**: 二義性が深刻で外部 fence でも縛りきれないと判断したら、deprecate して別の語に置き換える（B-strict 相当）。本 TPL の対象外（このパターンを採るケースは別途検討）。

## 関連テスト

未確立。spec 文言の検証は `pnpm adr:check-assumptions` の `grep:` アサーション（ADR が参照する spec 文字列が消えていないか）で部分的に担保される。
