# 移行期のオーナーシップ重複と `duplicate-owner-assignment` の register

- **日付**: 2026-06-14
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#1566](https://github.com/kompiro/karasu/issues/1566)
  - PR: [#1584](https://github.com/kompiro/karasu/pull/1584)
  - 派生 Issue: [#1583](https://github.com/kompiro/karasu/issues/1583)（@migration_target 優先 / team アノテーション）
  - 関連 ADR: [ADR-20260323-03](../adr/20260323-03-organization-diagram.md)（organization / owns 導入。§6 で本診断の severity を規定）
  - 関連 TPL: [TPL-20260514-08](../test-perspectives/TPL-20260514-08-diagnostic-register-fact-vs-style.md)（診断 register は「事実か流派判断か」で決める）
  - コード: `packages/core/src/parser/parser.ts`（`indexTeams` / `buildOwnerIndex`）, `packages/core/src/types/ast.ts`

## 背景・課題

同じノードを複数の `team` が `owns` すると、parser の `indexTeams` が `duplicate-owner-assignment` を **error** severity で発行する（`parser.ts:1718`）。一方、論理面で構造的に類似した「同じものが移行中に 2 箇所へ属する」事象 — `domain-dispersal`（同一 domain が 2 service に登場）— は **info** で、karasu の「描くが規定しない（fact vs style）」ドクトリン（`docs/concepts.md`）に従っている。

この非対称が問題になるのは、まさに karasu が組織面の旗印に掲げる **逆コンウェイ戦略の最中**である。チームを引き直す過程で 2 チームが同じ境界を一時的に共同所有するのは正当な過渡状態だが、`owns` は即 error で弾く。

さらに **ADR と実装のドリフト**がある: ADR-20260323-03 §6 は「同一 ID を複数チームが owns → **warning**」と規定しているが、実装は **error**。どちらにせよ現状は「fact vs style」ドクトリンとも ADR とも食い違っている。

## 現状（インベントリ）

| 観点 | 現状 |
| --- | --- |
| 発行箇所 | parser の `indexTeams`（ownerIndex 構築中）。resolver の `analyze()` ではない |
| severity | **error**（ADR-20260323-03 §6 は warning と規定 → ドリフト） |
| 重複時の挙動 | `ownerIndex` は `Map<nodeId, teamId>` の **1:1**。最初に owns したチームが勝ち、後続は index に入らず捨てられる |
| 類似診断 | `domain-dispersal`（info, resolver, fact-vs-style register）/ `infra-redeclared-across-files`（info） |
| domain 側の移行対応 | `domain` は `@deprecated` / `@migration_target` 付きで同一 id の共存を許容し、`nodePathIndex` は migration 優先度で勝者を決める |
| 既存テスト | `parser.test.ts:1148` `"errors on duplicate owns across teams"`（severity error を assert） |

## 制約・前提

- **fact vs style ドクトリン**（TPL-20260514-08）: 新規/見直す診断の register は「モデル内部整合性のエラーか／流派から見た smell（fact）か／karasu が立場を取らない事項か」で決める。
- **`ownerIndex` は 1:1**: 1 ノードの owner は 1 つしか保持できない。重複を許しても「主たる owner」を 1 つ選ぶ必要がある（= 表示・クエリは 1 owner）。これは domain-dispersal が `nodePathIndex` で勝者を 1 つ選ぶのと同じ構造。
- parser diagnostic（`DiagnosticParamsByCode` + severity フィールド）と resolver warning（`WarningKind` + `warningSeverity` の info/warning register）は別系統。fact-vs-style register（info）は後者の機構に乗っている。
- out of scope: `owns` の意味自体の変更、organization 図レンダラーの大改修。

## 検討した選択肢

### 案A: severity を info に下げ、fact-vs-style register に載せる

`duplicate-owner-assignment` を info にし、`domain-dispersal` と同じ「事実を述べる」診断にする。メッセージは「N は複数チームが owns。表示・クエリでは <主owner> を採用」と事実先行に。`docs/concepts.md` の fact-vs-style 表に 1 行追加。

**メリット**

- 逆コンウェイの過渡的共同所有を「正当な事実」として通せる。
- `domain-dispersal` との対称が取れ、TPL-20260514-08 のドクトリンに整合。
- 変更が小さい。

**デメリット**

- `ownerIndex` 1:1 ゆえ 2 つ目の owner は静かに捨てられる（情報欠損）。info だと「捨てられた」ニュアンスが弱い → メッセージで明示する必要がある。
- ADR-20260323-03 §6（warning 規定）を更新する必要（新 ADR で上書き）。

### 案B: severity を warning に下げる（ADR 準拠）

ADR-20260323-03 §6 のとおり warning にする。

**メリット**

- ADR と一致。「2 つ目の owner が捨てられる」lossy さを warning で表現できる。

**デメリット**

- `domain-dispersal`（info）との非対称が残る。fact-vs-style ドクトリンでは「移行中の共同所有」は事実寄りで、warning は「直すべき」を含意しすぎる懸念。

### 案C: error 維持（現状）

**メリット**

- 変更なし。「owner は 1 つであるべき」を厳格に強制。

**デメリット**

- 逆コンウェイの過渡状態を表現できない（Issue の趣旨に反する）。ADR（warning 規定）とも食い違ったまま。却下寄り。

### 案D: 移行アノテーションでゲートする

`domain` の共存ルールに倣い、片方の team / 所有が migration アノテーションを持つときだけ重複を許す。

**メリット**

- 「意図的な移行」と「うっかり二重所有」を区別できる。

**デメリット**

- `owns <id>` 行や team にアノテーションを付ける構文が無く、新語彙が要る。重い。今回のスコープを超える（将来の拡張候補）。

## 比較

| 観点 | A: info | B: warning | C: error | D: annotation-gate |
| --- | --- | --- | --- | --- |
| fact-vs-style 整合 | ◎ | △ | ✗ | ○ |
| 逆コンウェイ過渡状態 | ◎ | ○ | ✗ | ◎ |
| lossy さの表現 | △（文言で補う） | ○ | — | ○ |
| ADR 整合 | 新 ADR で更新 | 既存 ADR と一致 | 食い違い | 新 ADR |
| 変更量 | 小 | 小 | 0 | 大 |

## 関連 TPLs

- [TPL-20260514-08](../test-perspectives/TPL-20260514-08-diagnostic-register-fact-vs-style.md) — 診断 register を fact/style で決める。本件は「移行中の共同所有」を事実とみなすか否かの判断であり、まさにこの観点の適用。

（新規 proactive TPL は不要 — 既存 TPL-20260514-08 が本決定の観点を既にカバー。）

## 現時点の方針

**案A（info + fact-vs-style register）を推す** — `domain-dispersal` との対称が取れ、逆コンウェイの過渡的共同所有を正当な事実として通せる。`ownerIndex` 1:1 ゆえ主 owner を 1 つ選ぶ点は domain-dispersal が `nodePathIndex` で勝者を選ぶのと同型。lossy さはメッセージで明示する（「<主owner> を採用、他は表示されない」）。ADR-20260323-03 §6 は新 ADR で更新する。

ただし「2 つ目の owner が捨てられる」lossy さを重く見るなら案B（warning）も妥当。最終 severity はレビューで確定する。

### 実装の指針（案A 前提）

1. parser `indexTeams`（`parser.ts`）: `duplicate-owner-assignment` の severity を `error` → **`info`** に変更。メッセージを事実先行に（主 owner を明示）。owner index の勝者は **first-wins を維持**（移行先優先は #1583）。
2. 実装箇所は parser diagnostic のまま（Q3）。resolver warning への移設はしない（owner index は parser 構築時に作るため）。
3. i18n: `diagnostic.duplicateOwnerAssignment.message`（en/ja）を事実先行に更新。
4. `docs/concepts.md` / `concepts.ja.md` の fact-vs-style 表に `duplicate-owner-assignment` を 1 行追加（流派の文脈: 「単一所有を前提とする組織論では重複所有を smell とする」）。
5. tests: `parser.test.ts:1148` を新 severity に更新。重複許容で両 team がパースされ、ownerIndex は主 owner を保持することを assert。
6. ADR: 実装完了後、本 Design Doc を `docs/adr/1566-ownership-during-migration.md` に昇格（`related_to: ADR-20260323-03`、§6 の severity を更新する旨を明記）。元 Design Doc は同 PR で削除。
7. changeset: 公開 CLI（`karasu`）が診断を表示するため minor。

### 影響範囲・マイグレーション

- 既存ユーザー: これまで重複 owns が error でブロックされていたものが info/warning になり、render が通るようになる（緩和方向、後方互換）。
- ドキュメント: `docs/concepts*.md` の fact-vs-style 表、ADR-20260323-03 の §6 を上書きする新 ADR。
- ownerIndex の主 owner 選択（first-wins）は維持。

## 決定事項（レビュー反映）

- **Q1 → info（案A）**: `duplicate-owner-assignment` を info にし、fact-vs-style register に載せる。`domain-dispersal` と対称。lossy さ（2 つ目の owner 不表示）はメッセージで明示する。ADR-20260323-03 §6（warning 規定）は新 ADR で上書き。
- **Q2 → 別 Issue に分離（[#1583](https://github.com/kompiro/karasu/issues/1583)）**: `@migration_target` 優先の勝者選択は `team` ブロックのアノテーション対応が前提（現状 `TeamNode` は annotation 非対応）。本 PR は **first-wins を維持**し、移行先優先は #1583 で後続実装。
- **Q3 → parser diagnostic のまま severity 変更**: 検出は parser の `indexTeams` のまま、severity フィールドを `error` → `info` に変更（resolver warning への移設はしない — owner index は parser 構築時に作るため）。

以上で本設計の論点は確定。次段は ADR 昇格（実装 PR のクリーンアップ時）。
