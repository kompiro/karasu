---
id: TPL-20260616-03
title: "client の語彙はアクセスパスの構造を名指し、実装の詳細を名指さない"
status: active
date: 2026-06-16
applicable_to:
  - "`client` サブ言語に新しい語彙を足す / 既存を拡張するとき（form-factor タグ、`handles` / `delivers`、`resource` storage kind、`capability` のセマンティクス）"
  - "client 周りのプロパティで「何を記録し、何を記録しないか」を決めるとき"
  - "`docs/concepts.md` の structure / implementation 境界に関わる spec を書くとき"
discovered_from:
  - issue: "#1625"
  - root_cause_file: "docs/concepts.md"
related_to:
  - TPL-20260514-08
  - TPL-20260610-02
topic: core-concepts
scope:
  packages:
    - core
---

# TPL-20260616-03: client の語彙はアクセスパスの構造を名指し、実装の詳細を名指さない

## 観点

`client` サブ言語は karasu の語彙の中で structure / implementation の線に **最も
近い**一角である。新しい client 機能を足す／拡張するときは、それが線の **構造側**に
留まることを 1 つのテストで確認する:

> その機能は、アクセスパス上の **参加者か関係**（誰が・どの surface 越しに・
> どの種類の状態を保持して・何に到達するか）を名指すか？ それとも
> **フレームワーク・スキーマ・ペイロード・実行時の値**を名指すか？

前者なら構造側で in-scope。後者なら実装側で、語彙には足さず `description` +
外部ドキュメントへの `link` に逃がす。`resource` の storage kind が **種類だけ**を
予約集合で受け、内容・スキーマ・生の認証情報・cookie・デバイス機能を
`client-resource-invalid-kind` で拒否しているのが、この線を実行可能にした実例。

## 想定される失敗モード

- 「便利だから」と client に実装寄りの属性（保存データのスキーマ、API の
  リクエスト/レスポンス形、利用フレームワーク、バンドラ設定）を語彙として
  足してしまい、モデルが**実装の高度に滑り落ちる**。アーキテクチャが変わって
  いないのに実装変更のたびにモデルが書き換わるようになる。
- storage kind の予約集合を緩めて任意文字列を許し、生の認証情報や cookie が
  構造リストへ無言で漏れ込む（より強いモデル化が要る関心の取りこぼし）。
- form-factor タグをフレームワーク識別子（`[react]` 等）として使い始め、
  surface の種類という構造的意味が薄まる。

## チェックリスト

`client` 語彙を足す / 変えるとき:

- [ ] その機能はアクセスパスの**参加者か関係**を名指す（実装・スキーマ・
      ペイロード・実行時値ではない）
- [ ] 記録するのは「種類 / 関係」までで、**内容や値**は記録しない
- [ ] 受け付ける集合を絞るべきもの（storage kind 等）は予約集合 + 専用診断で
      境界を実行可能にしている
- [ ] 「実装詳細を書きたい」要求は `description` + `link` に逃がす設計になっている
- [ ] `docs/concepts.md`「Structure, not implementation — the `client` sub-language」
      節の規定と矛盾しない（en/ja 双方）

## 既知の対処パターン

- **予約集合 + reject 診断で境界を実行可能にする**: `resource` の storage kind は
  6 値の予約集合に絞り、外れた kind を `client-resource-invalid-kind` で拒否する。
  「種類は構造、内容は実装」の線をパーサが守る。
- **開いた集合は意味を構造に寄せる**: `capability` / 非 builtin タグは open set だが、
  「何ができるか / どの surface か」という構造的意味に留め、実装識別子にしない。

## 関連テスト

- （未確立 — 本観点は主に spec / 語彙設計レビュー時の判断材料。`resource` storage
  kind の境界は `client-resource-invalid-kind` の parser テストが担保する）

## 派生元 spec

- `docs/concepts.md` —「Structure, not implementation — the `client` sub-language as the test case」節（structure / implementation の線と client の各機能の位置づけ）
</content>
