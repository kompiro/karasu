# 共有 infra fan-in を info 診断として通知する

- **日付**: 2026-06-15
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#1570](https://github.com/kompiro/karasu/issues/1570)
  - 統治 ADR: [ADR-20260514-02](../adr/20260514-02-style-prescription-stance.md)（流派が smell と呼ぶ構造は `info` で事実通知）
  - 関連 TPL: [TPL-20260514-08](../test-perspectives/TPL-20260514-08-diagnostic-register-fact-vs-style.md)（新規 diagnostic の register は事実か流派判断かで決める）, [TPL-20260514-07](../test-perspectives/TPL-20260514-07-infra-redeclared-across-files.md)
  - コード: `packages/core/src/resolver/warnings.ts`, `packages/core/src/types/warnings.ts`, `packages/i18n/src/render-warning.ts`

## 背景・課題

`docs/concepts.ja.md`「karasu が『描く』もの、『規定しない』もの」節は、`infra-redeclared-across-files`（info）を microservices の **Database-per-Service smell**（「共有 DB を smell とする」）のシグナルとして一覧している。しかしこの診断が実際に keying しているのは **宣言の冗長性**（同じ `database` / `queue` / `storage` id が複数ファイルで宣言される / S4.5）であって、**共有 / fan-in**（1 つの store を複数 service が参照する）ではない。

その結果、より一般的で意味のあるケース — **1 つの `database` が 1 回だけ宣言され、N 個の service から参照される** — は **診断が一切出ない**。偶発的な multi-file redeclaration という proxy だけがトリガーになる。

```krs
// 単一ファイル・1 回宣言・2 service が共有 → 現状は診断なし
system Shop {
  service OrderService  { /* ... resource OrderDB.Orders ... */ }
  service ReportService { /* ... resource OrderDB.Orders ... */ }
  database OrderDB { table Orders }
}
```

「共有 DB smell が surface されるかどうか」が **DB を何ファイルで宣言したか** に依存し、**何 service が依存しているか** に依存しないのは違和感がある。

## 現状（インベントリ）

| 観点 | 現状 |
| --- | --- |
| `domain-dispersal` (info) | `packages/core/src/resolver/warnings.ts` の `detectDomainDispersal()`。同一 system 内で同じ domain id が ≥2 service 配下に登場すると emit。`analyze(file)` は **merge 後の `KrsFile`** を受ける |
| `infra-redeclared-across-files` (info) | `packages/core/src/fs/import-resolver.ts`。merge フェーズで同一 infra id が複数ファイル宣言のときに emit。**fan-in は見ない** |
| Warning register | `packages/core/src/types/warnings.ts`。`WarningKind` union + `WarningParamsByKind` + `INFO_WARNING_KINDS`（`warningSeverity()` で info 判定） |
| service→infra 解決 | `resource X.Y` は `ResourceNode.ref = { parent: "X", child: "Y" }`（`ast.ts`）。`view-extract.ts` の `deriveInfraEdges()` が service subtree の resource ref を walk し、`ref.parent` が scope 内 infra id なら synthetic edge を張る |
| `[external]` 表現 | `BaseNodeFields.tags` 内の文字列 `"external"`（`node.tags.includes("external")`） |
| 統治原則 | ADR-20260514-02 が「流派が smell と呼ぶ構造は info で事実通知」「register は事実 vs 流派判断で決める」を確定済み。「このリストは今後も伸びる」と明記 |

## 制約・前提

- ADR-20260514-02 / TPL-20260514-08 の判定樹に従う。今回の対象（共有 DB）は ADR が名指しした典型例なので register は **`info`** で確定。新たな流派 prescription を追加するわけではない。
- 文言は事実先行（"N services depend on this store"）。規定的な表現（"You should split..."）にはしない。
- `analyze()` は merge 後 `KrsFile` を見るので、ファイル数に依らず実共有で判定できる（Issue の狙いそのもの）。
- 後方互換: 新 info の追加。既存 error/warning の severity は変えない。`info` は render をブロックしない。
- out of scope: `infra-redeclared-across-files` の廃止・統合。`[shared]` 抑制タグの導入（ADR-20260514-02 で却下済み）。

## 検討した選択肢

### 案1: `domain-dispersal` と対称な新 Warning kind を追加する（採用）

`packages/core/src/types/warnings.ts` の `WarningKind` に `shared-infra-fan-in` を追加し、`detectSharedInfraFanIn(file)` を `analyze()` に登録する。`detectDomainDispersal()` と同じ scope 戦略（per-system + top-level services）で、service の resource ref を走査して `infraId → Set<serviceId>` を作り、`size ≥ 2` で emit する。

**メリット**

- `domain-dispersal`（構造的に同型: 同一 id が ≥2 service 配下）と実装・register・文言の三点で対称。読者・実装者の認知コストが最小。
- merge 後 `KrsFile` を見る `analyze()` 経路なので「ファイル数非依存」が自然に出る。
- i18n / render-warning / `never` 網羅チェックに乗り、抜けをコンパイラが強制。

**デメリット**

- resource ref 走査ロジックが `view-extract.ts` の `deriveInfraEdges()` と一部重複する（後述の実装指針で共有 helper を検討）。

### 案2: `infra-redeclared-across-files` を拡張して fan-in も同 code で出す

既存 info code に fan-in 検出を相乗りさせる。

**デメリット**

- 観察している事実が異なる（宣言冗長 vs 実共有）。params 形（`blockId`/`blockKind` のみ）も合わず、利用側が 2 ケースを判別できない。TPL-20260514-08 の「事実 1 行」原則に反する。却下。

### 案3: view 抽出時（`deriveInfraEdges`）の synthetic edge から検出する

レンダリング経路で fan-in edge を数える。

**デメリット**

- 診断は view 非依存であるべき（system view を開かなくても出てほしい）。`analyze()` は全 view 共通の前段。view 経路に診断を置くと LSP / CLI の単純な warning 収集から漏れる。却下。

## 比較

| 観点 | 案1 | 案2 | 案3 |
| --- | --- | --- | --- |
| 既存パターンとの対称性 | ◎（domain-dispersal） | △ | ✕ |
| 事実の分離（TPL-08） | ◎ | ✕ | ○ |
| view 非依存 | ◎ | ◎ | ✕ |
| 実装重複 | resource walk 一部重複 | なし | なし |

## Related TPLs

- [TPL-20260514-08](../test-perspectives/TPL-20260514-08-diagnostic-register-fact-vs-style.md) — 新規 diagnostic の register 判定樹。本設計はそのチェックリストに従い `info` を選択（共有 DB = 外部流派が smell と呼ぶ構造）。新規 TPL は起こさない（concepts 表への**行追加**であって新規 section ではないため、本 TPL の back-ref で足りる）。
- [TPL-20260514-07](../test-perspectives/TPL-20260514-07-infra-redeclared-across-files.md) — 隣接する infra 診断。本設計は当該診断を**併存維持**し、観察対象が異なること（宣言冗長 vs 実共有）を concepts 表で明示する。

## 現時点の方針

**案1 を採用する** — `domain-dispersal` と対称な新 Warning kind `shared-infra-fan-in` を `info` register で追加する。ADR-20260514-02 が名指しした共有 DB smell を、宣言ファイル数ではなく実際の service 依存数で surface する。

確定した設計判断:

- **kind 名**: `shared-infra-fan-in`（database / queue / storage を横断。"database" 限定にしない）
- **params**: `{ infraId: string; infraKind: "database" | "queue" | "storage"; services: string[] }`
- **severity**: `info`（`INFO_WARNING_KINDS` に追加）
- **閾値**: 同一 scope 内で同一 infra に resolved dependency を持つ service が **≥2**
- **`[external]` infra は集計から除外** — Database-per-Service smell は「自システムが所有する store」に関する信号。境界外の managed 第三者 store を共有すること自体は同種の信号ではなく、ノイズを増やすため除外する（#1570 のオープン質問に対する決定）。
- **scope**: `domain-dispersal` と同じく per-system + top-level services。system 境界はまたがない（cross-system 共有は意図的）。
- **`infra-redeclared-across-files` は併存維持** — 観察する事実が別物。concepts 表は両者を残し、`infra-redeclared-across-files` の説明を「宣言の冗長性」、新診断を「実際の共有（Database-per-Service smell）」と書き分ける。
- **文言**: 事実先行 3 行構成（事実 + 流派文脈 + concept 節リンク）。`domain-dispersal` の文言を踏襲。

### 実装の指針

1. `packages/core/src/types/warnings.ts`:
   - `WarningKind` に `"shared-infra-fan-in"` を追加
   - `WarningParamsByKind` に `{ infraId; infraKind; services }` を追加
   - `INFO_WARNING_KINDS` に追加
2. `packages/core/src/resolver/warnings.ts`:
   - `detectSharedInfraFanIn(file)` を実装。`detectDomainDispersal` の scope 走査を踏襲。scope 内の infra ノード（`database`/`queue`/`storage`、`tags.includes("external")` は除外）を id→kind/loc で index 化 → service subtree の `resource` ref を走査し `ref.parent` が infra index にあれば `infraId → Set<serviceId>` に積む → `size ≥ 2` で emit（loc は infra 宣言位置）
   - resource ref 走査は `view-extract.ts` の `collectResourceRefs` と重複するため、共有 helper への切り出しを実装時に検討（過度な抽象化は避け、small util で可）
   - `analyze()` に `warnings.push(...detectSharedInfraFanIn(file))` を登録
3. `packages/i18n/src/render-warning.ts` + `en.ts` / `ja.ts`:
   - `case "shared-infra-fan-in"`：message（"`<kind>` "X" is shared by N services" 相当）+ details（依存 service id 列 + 流派文脈 1 行）
   - キー: `warning.sharedInfraFanIn.message` / `warning.sharedInfraFanIn.checkDatabasePerService`
4. `docs/concepts.md` / `docs/concepts.ja.md`：fact-vs-style 表に新行を追加し、`infra-redeclared-across-files` 行の説明を「宣言の冗長性」に調整
5. `docs/spec/tags-annotations.md`（診断一覧があれば）に追記
6. AT: `docs/acceptance/` に新規ファイル。TC は:
   - 単一ファイルで 1 DB を 2 service が共有 → app WarningPanel に ℹ で 1 件（i18n ja/en 目視）
   - render はブロックされない（error 0）
7. ADR 昇格: 実装完了後、本 Design Doc を `docs/adr/1570-shared-infra-fan-in-diagnostic.md` 等として昇格し、同 PR で本ファイルを削除する。ADR-20260514-02 を `related_to` に置く（覆さず、その register を拡張する追加なので `supersedes` は使わない）。

### 影響範囲・マイグレーション

- 既存ユーザーへの影響: 新規 info の追加のみ。既存図の render・既存診断の severity は不変。共有 DB を持つ既存 `.krs` には新たに ℹ が 1 件出る（事実通知、抑制は editor/LSP の severity 設定）。
- ドキュメント更新: `docs/concepts.md` / `docs/concepts.ja.md`、必要なら `docs/spec/tags-annotations.md`。
- テスト・examples への影響: `examples/` に共有 DB を持つサンプルがあれば ℹ が出るが、info なので AT/snapshot を壊さない範囲。実装時に確認する。
