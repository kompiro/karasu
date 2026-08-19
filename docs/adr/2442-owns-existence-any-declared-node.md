---
id: ADR-2442
title: owns の存在検査は kind を問わない（system は kind 拒否として報告し、invalid-owns は拒否した kind を名指す）
status: accepted
date: 2026-08-12
topic: resolver
depends_on:
  - ADR-2410
related_to:
  - ADR-2408
  - ADR-1720
  - ADR-927
scope:
  packages: [core, i18n]
assumptions:
  - "symbol: packages/core/src/parser/reference-validation.ts :: collectDeclaredNodePaths"
  - "symbol: packages/core/src/parser/reference-validation.ts :: resolveDeclaredRef"
  - "symbol: packages/core/src/resolver/warnings.ts :: detectInvalidOwns"
  - "grep: packages/core/src/types/warnings.ts :: ownedKind"
  - "grep: packages/i18n/src/en.ts :: cannot be owned"
  - "file: docs/spec/diagnostics.md"
---

# ADR-2442: owns の存在検査は kind を問わない（system は kind 拒否として報告し、invalid-owns は拒否した kind を名指す）

- **日付**: 2026-08-12
- **ステータス**: 決定済み
- **関連**:
  - 引き金 Issue: [#2442](https://github.com/kompiro/karasu/issues/2442)（宣言済みで所有できない kind が 2 コード引く）
  - 記録の起票 Issue: [#2451](https://github.com/kompiro/karasu/issues/2451)
  - 実装 PR: [#2450](https://github.com/kompiro/karasu/pull/2450)
  - 前提 ADR: [ADR-2410](2410-import-coupled-diagnostics-decline-and-invalid-owns-kind-only.md)（`invalid-owns` は解決した参照の kind だけを述べる）
  - 関連 ADR: [ADR-2408](2408-owns-infra-target-and-chip-gate.md)（`owns` の対象 kind）、[ADR-1720](1720-client-realize-owns-target.md)
  - 派生 TPL: [TPL-1720](../test-perspectives/TPL-1720-validation-target-set-enumerates-all-kinds.md)
  - spec: `docs/spec/diagnostics.md` / `.ja.md`

## 背景

[ADR-2410](2410-import-coupled-diagnostics-decline-and-invalid-owns-kind-only.md) が
`invalid-owns` を「解決した参照の kind を述べる」検査に絞ったあと、二重報告が 1 ケース
残った。存在検査（`owns-target-not-found`）が id 集合を **所有可能 kind で絞って**
いたため、宣言済みの `user` / `usecase` / `entity` / `resource` はその集合に居らず、
「見つからない」と報告されていた。同じ行に対して `invalid-owns` が「所有できない kind」
とも言うので、1 つの誤りに 2 つのコードが並んだ。

原因は、存在検査が答えていた問いが「**所有可能な**ノードが在るか」だったことである。
これは存在の問いに kind の判断が混ざった形で、コードの名前（`*-target-not-found`）と
実際の判定が食い違っていた。

同時に 2 つの副次的な不整合が見えた。

- **`invalid-owns` のメッセージが存在の文だった** — 「no service or domain with that id
  exists」。ADR-2410 でこの診断は kind 検査になったのに文言は初版（#39）のままで、
  カタログの規定とも食い違っていた。
- **`system` id はどちらの検査にも属していなかった** — 両検査とも `system.children` しか
  歩いておらず system 自身の id を集めていなかったため、`owns <systemId>` は
  「見つからない」と報告されていた。system は実在するので、この文言は誤りである。

## 決定

**1. `owns` の存在検査は kind を問わない。** 「その id を持つノードが在るか」だけを判定し、
宣言済みのノードはすべて解決したものとして扱う。kind の拒否は `invalid-owns` が単独で
担う。導出は `contains` と 1 つの walk（`collectDeclaredIds`。#2548 の path 記法導入で
kind と full path を持つ `collectDeclaredNodePaths` に一般化された）を共有し、違いは
**system id を含めるかどうかの 1 軸**だけにする（現在は解決時のフィルタ）。

**2. `system` id は存在集合に含める。** team は system を所有できないが、それは
`invalid-owns` の kind 拒否として述べる。system は実在するので「見つからない」は誤りである。

**3. `invalid-owns` は拒否した kind を名指す。** warning の params に `ownedKind` を持たせ、
メッセージは `kind "<x>" cannot be owned` の形にする。

## 理由

- **1 つの診断は 1 つの問いに答える。** 存在と kind を 1 コードで報告していたことが
  二重報告の原因だった。名前が述べている問いに実装を合わせれば、利用者は 1 つの誤りに
  1 つの説明を得る。[ADR-2410](2410-import-coupled-diagnostics-decline-and-invalid-owns-kind-only.md)
  が `invalid-owns` 側で同じ整理をしており、本 ADR はその対称側を揃える。
- **集合を共有できるのは、問いが同じになったから。** `contains` の存在検査は元から
  「宣言済みの全ノード id」を計算していた。存在検査が kind を見なくなった時点で 2 つは
  同じ問いに収束するので、walk を 1 つにするのは重複の削減ではなく**同一の問いを 1 度だけ
  実装する**ことである。[ADR-2408](2408-owns-infra-target-and-chip-gate.md) が却下した
  「`collectOwnableIds` を 2 検査で共有する」案とは前提が違う — あちらは *所有可能集合*
  の共有で、2 つの集合が意図的に異なっていた。
- **walk-then-delete にしない。** 同名 id の共存は珍しくないので（ADR-927 の背景）、
  1 つの集合を作ってから system id を削る実装は、別スコープの同名 service まで消す。
  `includeSystemIds` を walk の引数にするのはこのためである。
- **メッセージは kind を名指すことで文言と意味が一致する。** 加えて `system` や `user` が
  この診断に到達するようになったため、旧文言（「service または domain が存在しません」）は
  放置すれば明確な誤りになった。
- **冠詞を固定しない。** `LogicalNodeKind` には母音始まりの kind（`entity`）があるため、
  `a ${kind}` は必ずどこかで崩れる。`kind "<x>"` の形にすると冠詞の一致表を持たずに
  全 kind で成立する。en / ja 双方で全 kind を描画するテストで固定した。

## 影響

- **`OWNS_TARGET_KINDS` の読み手は `invalid-owns` だけになった。** これにより
  [ADR-2408](2408-owns-infra-target-and-chip-gate.md) の決定文にある「解決を担う 2 つの
  検査はその列挙を 1 つの定数から読む」という**機構の記述は現状と合わなくなった**。
  対象 kind の集合（service / domain / client / infra）は不変であり、決定そのものは
  覆っていない。accepted な ADR は書き換えないため、本 ADR がその機構の更新を記録する。
- **[TPL-1720](../test-perspectives/TPL-1720-validation-target-set-enumerates-all-kinds.md)
  が求めるのは列挙の一本化であって読み手を 1 つにすることではない。** 読み手が複数でも
  同じ定数を参照していればよく、`OWNABLE_LOGICAL_KINDS`（提示側の狭い集合）は理由と
  テストを伴う容認された分岐である。今回読み手が 1 つになったのは、存在検査が kind の
  問いから降りた結果に過ぎない。
- **`owns <systemId>` は判定が変わる**（件数ではない）。従来は `owns-target-not-found`
  1 件、以後は `invalid-owns` 1 件。
- 同名 id が ownable な kind と そうでない kind の両方を指す場合、`validIds` に id が
  入るため**何も報告しない**。その id を持つノードのどれかは所有できるので、拒否すべき
  ものが無いという判断である。
- `capability` は `properties.capabilities` のプロパティでノードではないため、
  引き続きどのノードにも解決せず `owns-target-not-found` が担当する。

## 却下した案

- **存在検査に kind の絞りを残し、`invalid-owns` 側で二重報告を抑える** — 影響範囲を
  `invalid-owns` に閉じる案。名前と判定の食い違い（存在コードが kind を語る）が残り、
  次に kind が増えたとき同じ形で再発する。却下。
- **`system` id を存在集合から除く**（`contains` と完全に同一の集合にする） — 実装が
  最小になる案。`owns <systemId>` が「system 階層に見つからない」と報告され続けるが、
  system は実在するので文言が誤りのままになる。却下。
- **メッセージ変更を別 Issue に分ける** — 二重報告の解消だけに絞る案。`system` と `user`
  がこの診断に到達する変更と同時に入れないと、その瞬間から文言が明確な誤りになる。
  分離すると「誤った文言が出る期間」を意図的に作ることになる。却下。
- **冠詞を kind ごとに解決する**（`a`/`an` の対応表を持つ） — 自然な英文を保つ案。
  i18n の 1 メッセージのために kind × 冠詞の表を持つ維持コストに対し、`kind "<x>"` の
  形で同じ情報が伝わる。却下。
