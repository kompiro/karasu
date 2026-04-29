---
id: ADR-20260429-08
title: セキュリティ／脅威モデリングは karasu の語彙に取り込まず companion document に委ねる
status: accepted
date: 2026-04-29
topic: core-concepts
scope:
  concerns: [security]
related_to: [ADR-20260312-03, ADR-20260428-06]
---

# ADR-20260429-08: セキュリティ／脅威モデリングは karasu の語彙に取り込まず companion document に委ねる

- **日付**: 2026-04-29
- **ステータス**: 決定済み
- **関連**:
  - Issue #834 — modeling: security/threat-related concerns in system diagrams (parent)
  - Issue #832 — usecase-level authorization（直交する関心事として別途継続）
  - ADR-20260312-03 — 論理／物理／組織の三面構造（karasu のコア語彙の範囲）
  - ADR-20260428-06 — `client` kind 導入（`client.resource` を巡る議論で本論点が顕在化）

## 背景

`#823` / `#831` で `client` / MCP のモデリングを検討する中で、cookie / token などクライアント側のクレデンシャル保管を `client` がどう宣言するかが議題に上がった。これを掘り下げるうちに、認証フロー、サーバ側シークレット管理、ネットワーク境界、データ分類、監査ログ、コンプライアンス範囲、脅威モデル全般など、**セキュリティ／脅威関連の関心事はシステム図のほぼすべての箇所に現れうる**ことが分かった。

`#834` はそれらをまとめて扱う親 issue として立てられたが、議論の前提として「どのトピックを karasu の語彙に取り込むか」だけが俎上にあり、**「そもそも karasu の外で扱う」を一級の選択肢として並べていない**ことが整理の漏れだった。

karasu のコア概念は ADR-20260312-03 で述べた「論理／物理／組織の分離 × usecase 駆動の構造コミュニケーション」である。一方、セキュリティ／脅威モデリングは STRIDE、attack tree、DFD + trust boundary、threat dragon、pytm など独自の確立された語彙と実務がある。これを karasu の文法に押し込むと:

- karasu の語彙が肥大化し「何のためのツールか」が薄まる
- 既存のセキュリティ実務者の慣習と語彙がズレ、両方を覚える負荷が生じる
- 一方で karasu に取り込むメリット（同一ファイルで構造とセキュリティが見える）は、外部リンクで参照すれば概ね達成できる

また、ノードに関連ドキュメントを紐づけるための `link` プロパティは既に syntax に存在し（`docs/spec/syntax.md`）、複数指定も許されている。すなわち「companion document を参照する」用途は **追加の構文を導入せずとも今ある仕組みで成立している**。

## 決定

karasu はセキュリティ／脅威モデリングを内部の語彙として取り込まない。セキュリティに関する記述は karasu 外の companion document（例: `security/threat-model.md`）に置き、karasu のノードや usecase からは既存の `link` プロパティで参照する。

ただし trust boundary のように、ノード／エッジの**構造そのものに直接効く**関心事は、将来必要になれば別途 issue / ADR を立てて検討する余地を残す。

## 理由

- karasu のコア価値は「論理／物理／組織の構造を簡潔に表現する」ことにある。セキュリティ専用の語彙を抱え込むとフォーカスがぼやけ、ツールの説明可能性が落ちる。
- セキュリティモデリングは別系統の確立された語彙と実務を持っており、karasu が独自語彙で被せても実務者にとって価値が薄い。companion document に委ねれば既存実務との衝突がない。
- `link` プロパティが既に存在しており、ノード単位で外部ドキュメントを指せる。「ここに脅威分析がある」という参照点は新構文なしで提供できる。
- このスタンスを ADR として明文化することで、将来「authn flow を取り込みたい」「secrets を表現したい」といった提案が来ても、毎回ゼロから議論せず判断軸を共有できる。

## 却下した案

- **すべての候補トピックを karasu の語彙に内部化する** — 認証フロー、シークレット管理、ネットワーク境界、データ分類、監査、コンプライアンス範囲を karasu の構文に取り込む案。語彙の肥大とフォーカスの分散を招き、既存セキュリティ実務との衝突も大きいため却下。
- **`link` 参照を改めて専用構文化する（例: `@security <doc>`）** — 既存の `link` プロパティで実用上同じことが達成できるため、追加構文を導入する純利得がない。
- **`#834` をスタンス表明ではなく単一の trust boundary 議論 issue に絞り直す** — trust boundary は構造に直接効く可能性があるが、現時点で具体的な要請がなく、先に「外部化」の原則を確定するほうが将来の判断が一貫する。trust boundary は本 ADR とは別 issue で扱う。

## 適用範囲

本 ADR がカバーするトピック（`#834` の Topics in scope より）:

- Authentication flows — companion document に委ねる
- Client-side credential storage — companion document に委ねる（構造的な「何を保持するか」は ADR-20260428-06 の `client.resource` で別途扱う）
- Server-side secrets management — companion document に委ねる
- Network security（TLS / mTLS / VPN / subnet 等の設定詳細） — companion document に委ねる
- Data classification — companion document に委ねる
- Audit logging — companion document に委ねる
- Threat model / attack surface — companion document に委ねる
- Compliance scope — companion document に委ねる

`#832`（usecase-level authorization）は本 ADR の対象外で、独立した関心事として継続する。trust boundary は将来別 issue で再検討する余地を残す。
