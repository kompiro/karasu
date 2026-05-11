---
id: ADR-20260511-02
title: 実行時認可（usecase レベルの authz）は karasu の語彙に取り込まない
status: accepted
date: 2026-05-11
topic: core-concepts
scope:
  concerns: [security]
related_to: [ADR-20260428-06, ADR-20260430-01, ADR-20260312-03]
assumptions:
  - "file: docs/spec/syntax.md"
  - "grep: docs/adr/20260428-06-client-mcp-modeling.md :: requires"
---

# ADR-20260511-02: 実行時認可（usecase レベルの authz）は karasu の語彙に取り込まない

- **日付**: 2026-05-11
- **ステータス**: 決定済み
- **関連**:
  - Issue #832 — usecase-level authorization（本検討の起点）
  - ADR-20260428-06 — `client` kind 導入（`role` / `license` / `group` / `plan` / `requires` / `allows` / `policy` を将来の認可語彙の予約候補として認識した ADR）
  - ADR-20260430-01 — セキュリティ／脅威モデリングは companion document に委ねる（#832 を「直交する関心事として別途継続」と切り出した ADR — 本 ADR はその続きを閉じる）
  - ADR-20260312-03 — 論理／物理／組織の三面構造（karasu のコア語彙の範囲）
  - 旧 Design Doc: `docs/design/usecase-authorization-modeling.md`（本 ADR の昇格に伴い削除。検討経緯は PR #1070 と本 ADR を参照）

## 背景

`#832` は「user のロール／ライセンス／プラン／グループに応じて、どの usecase を実行できるかを図で伝えたい」という要望である。現代の SaaS / B2B プロダクトでは usecase の実行可否がこれらの属性の組み合わせで決まるのが普通で、今の karasu には usecase 側に「実行に必要な属性」を宣言する手段も、user 側にロール以外の属性を持たせる手段もない。

検討では次の選択肢を順に評価した（詳細は旧 Design Doc）:

- **案A** — `user_attributes` ブロックで属性語彙を宣言し、`usecase.requires` 述語（`requires plan in ["pro","enterprise"]` 等、AND 限定の最小式言語）で参照する first-class 機構
- **案 half-A** — 案A のうち属性宣言だけを採用し、`requires` 述語は採らない。usecase 側の表現は `description` + `link` に逃がす
- **案B** — 言語に何も足さず、authz は `description` + 外部 policy doc への `link` で表現する
  - **B-soft** — 既存の `user.role` は残し、spec で「actor archetype ラベル、authz プリミティブではない」と縛る
  - **B-strict** — `user.role` の二義性（actor archetype か RBAC の権限の束か）も問題の一部とみなし、`user.role` の見直しも別途行う

中間案（タグ流用 `[restricted]`、アノテーション流用 `@requires-role(...)`、汎用 `attribute "<key>" "<value>"`、エッジアノテーション `Admin -> RefundOrder @allowed`）はいずれも既存セマンティクスを汚すか組み合わせ爆発を招くため早期に棄却した。

ADR-20260430-01 はセキュリティ／脅威モデリング全般を companion document に委ねると決めたうえで、`#832`（usecase-level authorization）だけは「PDP のルール記述に相当する直交した関心事」として対象外に切り出していた。本 ADR はその残った論点を閉じる。

## 決定

usecase レベルの認可（authz）を karasu の語彙に取り込まない。`requires` 述語・`policy` ブロック・`user_attributes` 宣言など、authz 専用の構文は導入しない。「どの user がどの usecase を呼べるか」は usecase の `description` と、外部 policy doc / IAM ツール（OPA / Cedar / Casbin 等）への `link` で表現する。

これに伴い、既存の `user.role` キーワードの位置づけ（actor archetype として残すか、deprecate するか）も再検討対象とするが、それは別 Issue で扱う（既存 spec・examples・パーサに影響するため本 ADR とは分離する）。

## 理由

- **authz は dynamic な実行時関心であり、karasu が扱う「ゆっくり変化する構造的な文脈」の外側**。`docs/concepts.md` の非目標が共通して適用しているフィルタ — 実装／運用の詳細をモデルに引き込まない — に照らすと、authz ゲートは DB スキーマ設計やシーケンス図と同じく抽象度の外にある。
- **`requires` のような machine-checkable なゲート構文は validate → codegen の重力源になる**。`usecase-requires-unsatisfiable` バリデータが欲しくなり、次に「OPA / Cedar に export できる」へ滑る。これは非目標「モデルからアプリケーションコードは生成しない」と、`translate`（code → model のみ、情報は抽象が上がる方向にしか流さない）の非対称性に正面から抵触する。
- **half-A（属性宣言だけ入れる）は滑り台の途中で止まるだけ**。`user_attributes` 宣言を入れた瞬間「typo を検出する」バリデータが付き、すると「宣言だけあって照合がないのは半端」→ `requires` 述語 → `policy` ブロック、と引っ張られる。滑り台そのものを撤去するには「何も入れない」しかない。
- **述語式言語は tar pit 化しやすい**。AND 限定で始めても `or` / `not` / 比較演算子 / 時刻条件 / ネスト式と要求が滑り落ち、karasu の DSL が「人間と AI が共有する、ちょうどいい制約の中間言語」である性質（`docs/concepts.md`）を損なう。
- **`description` + `link` は既存機構で、ユーザーは今すぐ書ける**。「図を読んで誰が何を呼べるか判断できる」という #832 の元の課題は、散文 + 外部 policy doc へのリンクで実務上は満たせる範囲が大きい。
- **ADR-20260430-01 と同じ判断軸の延長**。セキュリティ／脅威モデリングを companion document に委ねたのと同じ理由（語彙の肥大を避ける／既存実務との衝突を避ける／ツール選択の自由を残す）が authz にもそのまま当てはまる。

## 却下した案

- **案A（`user_attributes` 宣言 + `requires` 述語の first-class 機構）** — #832 に正面から答え machine-checkable だが、上記のとおり validate → codegen の重力源になり、述語式言語が tar pit 化し、`docs/concepts.md` の非目標「振る舞い・シーケンス・時系列はモデリングしない」と同じ家系の関心事を構文に焼き付けることになる。設計の出発点は旧 Design Doc の「案A 詳細」に記録を残した。
- **案 half-A（属性宣言のみ）** — 構造的部分（user の持ち物）だけ取り込む筋の良い妥協に見えたが、宣言 → typo バリデータ → 「照合がないのは半端」→ `requires` という滑り台の途中で止まるだけで、滑り台そのものを撤去できない。
- **B-soft（`user.role` を残し spec で縛る）** — 後方互換は最大だが、"role" という語自体が「RBAC の権限の束」を誘発するため、縛りが緩むと再び `requires` の gateway 化するリスクが残る。`user.role` をどう扱うかは別 Issue で B-soft / B-strict を改めて判断する。
- **中間案（タグ／アノテーション／汎用 attribute／エッジ流用）** — タグは「これは何の kind か」、アノテーションは「ライフサイクル／出自」と用途が確立しており、authz ゲートを混ぜると概念のホームを侵食する。汎用 `attribute` は語彙ブレ問題を attribute の中に移動させるだけ。エッジ流用は user 数 × usecase 数の組み合わせ爆発を招き、属性ベースのルールを表現できない。

## 適用範囲

- usecase レベルの認可（ロール／ライセンス／プラン／グループ／機能フラグに応じた実行可否） — karasu の語彙に取り込まない。`description` + `link` で表現する。
- リソースレベル ABAC（行単位／レコード単位）、認証フロー（OAuth2 / OIDC 等）、動的属性（時刻・地理・端末状態）、ランタイム認可エンジンへの export — いずれも対象外（前者から認証フローは ADR-20260430-01 でも companion document に委ねると決定済み）。
- ADR-20260428-06 が予約候補とした `role` / `license` / `group` / `plan` / `requires` / `allows` / `policy` の語彙は、本 ADR の決定により **「将来 authz 機能を作るとき用の予約」ではなく「衝突回避のための予約」** という位置づけになる。これらをパーサ／spec に積極的に組み込む計画はない。
- 既存の `user.role` キーワードの存続可否（actor archetype として残す B-soft か、deprecate する B-strict か） — 本 ADR の対象外。別 Issue で扱う。
- 将来、外部ユーザー検証（#638 等）で「図だけで authz 境界を判断したい」需要が繰り返し顕在化し、かつ validate / codegen への滑り落ちを構造的に防ぐ設計（語彙を凍結する仕組み等）が別途確立されたら、本 ADR を supersede する新 ADR で再検討する余地は残す。
