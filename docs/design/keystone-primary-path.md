# keystone: primary path（A/B/C）と主 surface

- **日付**: 2026-06-28
- **ステータス**: 検討中（壁打ち進行中）
- **関連**:
  - 引き金: post-v1.0 horizon（`docs/roadmap.md`）の keystone 節 / planning [#1814](https://github.com/kompiro/karasu/issues/1814)
  - 関連 ADR: [ADR-20260626-01](../adr/20260626-01-karasu-nest-hosted-preview.md)（karasu-nest）
  - 関連 Issue: [#1783](https://github.com/kompiro/karasu/issues/1783)（nest brainstorm）/ [#638](https://github.com/kompiro/karasu/issues/638)（Chat user testing）
  - 派生する柱: comprehension [#1817](https://github.com/kompiro/karasu/issues/1817) / notation watch r2 [#1816](https://github.com/kompiro/karasu/issues/1816)

## 用語集（この doc / 後続の特殊用語）

> 本壁打ちで導入した load-bearing な用語。ADR 昇格時、permalink 系は恒久的な定義場所
> （nest/permalink の design doc か共通用語集）へ移すこと。

- **read / record split**: nest = 知らないシステムを*読む*（funnel/utility）/ karasu 本体 = 自分のシステムを*残す*（retained 製品）。
- **funnel / retained**: funnel = 獲得・awareness の面（web: app/nest）/ retained = 再訪する製品（in-repo authoring + 記録）。
- **record-as-byproduct**: 構造の記録を「設計判断」の副産物として落とす原則。別途の維持作業（chore）にしないことで doc-rot を構造的に回避（#1 の決定）。
- **permalink（karasu の）**: ADR/PR/docs が karasu の構造を*指す*住所。link 方向は **ADR→karasu**（karasu は decision metadata を持たない、#2 の決定）。次の属性で分類:
  - **deep permalink**: model 全体ではなく*特定の構造要素・view*を指す（現 nest share は model 全体止まり）。
  - **repo-backed permalink**: payload を URL に積む inline 形ではなく、GitHub repo の `.krs` を解決して描画する nest Phase 2 形（`/<owner>/<repo>`）。
  - **ref-pinned**: 特定の git ref/SHA に固定し、その時点の構造を immutable に描画（ADR の point-in-time 記録に適合）。
  - **inline snapshot permalink**: 現行の nest `?s=`。model を URL に凍結（immutable だが repo 非連動・長い → taka で短縮）。
- **source of truth / 描画層**: source = in-repo の `.krs`（version 管理）/ 描画・permalink = app/nest URL。同じ `.krs` の別レイヤー。
- **supply → share → explore**: adoption funnel の仮説（reverse 等で `.krs` 供給 → 共有で拡散 → drill-down で探索）。

## 背景・課題

v1.0 freeze 後、投資先（notation / nest / comprehension / interop / surface）が散り始めた。
post-v1.0 の優先度を決める **keystone** は「karasu を誰の何のための道具と置くか」= primary path の決定で、
これが決まると surface portfolio・interop・AI authoring の優先度が自動的に並ぶ。本書はその決定の壁打ちを残す。

## ゼロ番目の問い: 目的関数（adoption か learning か）

A/B/C の「primary path」という枠は **adoption（採用を増やす）を目的**と暗黙に仮定している。
だが [project purpose] によれば karasu は **Claude Code 学習が主目的の一つ**でもある。
目的が learning / personal-use なら「どの path がユーザーを獲得するか」は最適化対象ではなく、
「何を作るのが面白い/学びになるか」で選ぶ（あるいは選ばなくてよい）。
**path を評価する前に目的関数を確定する**必要がある。

| 目的 | keystone の意味 | 評価軸 |
| --- | --- | --- |
| **adoption** | 採用を増やす入口を選ぶ | market fit・on-ramp の摩擦・差別化 |
| **learning**（Claude Code 等） | 学びの大きい題材を選ぶ | 技術的な新規性・実装の面白さ |
| **personal-use** | 自分が使う道具を磨く | 自分の実利用頻度 |

**決定（2026-06-28）: adoption を主目的とする**（[project purpose] の learning より採用を優先）。以降は adoption 前提で評価する。

## 検討した選択肢（adoption 仮置き）

| path | karasu の正体 | 既存の足場 | 主 surface |
| --- | --- | --- | --- |
| **A. authoring tool** | architect が書く道具 | editor app / VS Code / LSP / notation / cookbook | VS Code / app |
| **B. AI-readable lens** | AI が生成し人が読むレンズ | nest reverse / translate / Chat（#638） | karasu-nest |
| **C. shareable medium** | 図を URL で配るメディア | nest share / taka / OGP / `/render` | karasu-nest + taka |

### 評価軸と所見

- **AI 時代の on-ramp**: #1783 で「LLM 生成 karasu は overview には十分」が実証された。
  A（手書き）は「LLM に聞けばいい」と競合し摩擦が高い。B は AI が生成する所に人を迎えに行く → **B 有利**。
- **solo-maintainer の経済性** [project purpose]: 6 surface（app/docs-site/VSCode/CLI/LSP/nest）を薄く維持するのは1人運用に重い。
  B/C は nest（1面）+ core に集約でき、A は app+VSCode+LSP の維持を要する → **B/C 有利**。
- **差別化の活用**: karasu の差別化は論理/物理分離・3-face・drill-down。B はそれが効くから overview が良い（差別化を**活用**）。
  C の静止画（OGP/PNG）は drill-down を潰す（差別化を**平坦化**）→ C は B の*誘い*であって体験ではない。
- **B のリスク**: 生成品質依存（#1783 で domain/org は弱い）+ 大規模図の認識（comprehension の壁）。
  → 緩和策が **comprehension 柱（#1817）+ cookbook（#1818）+ render-existing-first** で、いずれも既に queue 済み（整合）。
- **momentum**: 直近投資（nest/taka/OGP/comprehension）は B/C。ただし**意図的か drift か**の確認が必要。

### 訂正: nest は funnel、retained core は karasu 本体（A）

> 壁打ちで判明（2026-06-28）: 「B(nest) = retained core」は**誤り**だった。
> nest は karasu を**知り・馴染んでもらう awareness の場**であって、再訪を促す主軸ではない。
> retained core は **karasu 本体（A）= 自分が関わるシステムの構造を明らかにし、検討結果を残す道具**。

adoption の funnel として並べ直す:

- **awareness/utility = nest（B read + C share）**: 具体 JTBD は「**自分が知らないシステムを読み始めるための地図**」
  — 未知の OSS / 参加直後の codebase を dive する前の orientation。共有図は OGP で広がる。
  未知システムに出会うたびの反復需要を持つ**実用ツール**であり、その実用が karasu を知る funnel になる。
  → **読む / 残す の分割**: nest = 知らないシステムを**読む**、karasu 本体 = 自分のシステムを**残す**。深い retention は後者。
- **activation**: 自分が関わるシステムに karasu を試す。
- **retention（保持・製品）= karasu 本体（A）**: システムの構造を clarify し、**検討結果を残す**（living な architecture record）。
  再訪の trigger = システムが変わった / 設計判断をした / 他人に説明する。

retention の hook は「**残す**」= rot しない text-based な living architecture record。
ADR が*決定*に対してするものを、karasu は*構造*に対してする、という位置づけ。

**既存資産が既にこの線を指している**: 進化/差分の thread（`docs/guide/03-evolution.md` /
`docs/design/diff-open-file-as-entry.md` / app の compare mode = `useAppViews` の
`compareEntryPath`・snapshot overlay）。「変わったら戻ってくる」retention を支える土台が既にある。

### sharpened straw man（訂正版）

- **製品の核 = A**: karasu 本体（clarify + 残す living architecture record）。retention はここ。
- **funnel = nest（B read + C share）**: awareness/acquisition。再訪の主軸ではない。supply（reverse 品質 + cookbook
  [#1818](https://github.com/kompiro/karasu/issues/1818)）は funnel の**デモ内容**を支えるが、retained workflow は自分のシステムの authoring/recording。
- **surface は1点集中でなく pipeline**（#3 の決定）: **VS Code/CLI で書く（source=in-repo `.krs`）→ nest で描画/permalink 化（repo-backed が理想）→ ADR が指す**。
  app/nest は funnel*だけ*でなく **retained record の描画/permalink 層**でもある（permalink 先は repo 相対参照ではなく app/nest URL）。
  両 adoption 段階に効く leverage 点は **nest の permalink/描画層**（deep + repo-backed + ref-pin。near-term は inline `?s=` snapshot + taka 短縮）。

## 未解決の問い（壁打ちで詰める）

1. ~~目的関数~~ → **adoption に決定（2026-06-28）**。
2. ~~retention は nest~~ → **訂正（2026-06-28）: nest は funnel/utility（知らないシステムを読む地図）。
   retained core は karasu 本体（自分のシステムを残す）**。read（nest）/ record（karasu）の分割で確定。
3. ~~return trigger~~ → **決定（2026-06-28）: 主軸 = 設計判断のとき**（during-work）。
   原則: **記録は判断の副産物**にし、「システム変更→更新」という chore を主軸にしない（doc-rot を構造的に回避）。
   副次 = 他人への説明（05-communicating）/ 久しぶりの再理解（diff/compare）。
4. ~~「残す」の射程~~ → **決定（2026-06-28）: (a) 構造のみ + link 方向は ADR→karasu**。
   karasu は decision metadata を持たず、**構造要素・view への stable な deep permalink を出す責務**だけ持つ。
   根拠は ADR 側に住み、ADR がその permalink を指す（「どの判断で生まれたか」は ADR からの backlink で答える）。
   - 派生要件: 要素/view への **deep permalink**（既存: node id・drill-down `:target` anchor。nest share は model 全体止まりで element-deep 未対応）。
   - caveat: rename で permalink が切れる → 既存 `adr:check-assumptions`（ADR→code の存在検査）を **ADR→karasu permalink にも拡張**して dangling 検出。
5. ~~surface portfolio~~ → **決定（2026-06-28）: 1点集中でなく pipeline**（in-repo で書く → nest で描画/permalink → ADR が指す）。
   permalink 先は **app/nest URL**（repo 相対参照ではない）。leverage 点 = nest の **deep/repo-backed/ref-pinned permalink**（near-term は inline `?s=` + taka）。
   派生: 用語集の permalink 系は恒久化先が要る。nest Phase 2（#1786）が retained の背骨に格上げ。

## 関連・前提

- 動かさない非ゴール: `docs/concepts.md`（sequence/time #23/#28 ほか）。本決定は非ゴール線を動かさない。
- surface portfolio は keystone が主 surface を示した後の**独立判断**（本書では結論まで出さない）。
- 決定したら本書を **ADR（topic: project）に昇格**し、`docs/roadmap.md` の keystone 節を decision で更新する。
