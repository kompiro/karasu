# keystone: primary path（A/B/C）と主 surface

- **日付**: 2026-06-28
- **ステータス**: 検討中（壁打ち進行中）
- **関連**:
  - 引き金: post-v1.0 horizon（`docs/roadmap.md`）の keystone 節 / planning [#1814](https://github.com/kompiro/karasu/issues/1814)
  - 関連 ADR: [ADR-20260626-01](../adr/20260626-01-karasu-nest-hosted-preview.md)（karasu-nest）
  - 関連 Issue: [#1783](https://github.com/kompiro/karasu/issues/1783)（nest brainstorm）/ [#638](https://github.com/kompiro/karasu/issues/638)（Chat user testing）
  - 派生する柱: comprehension [#1817](https://github.com/kompiro/karasu/issues/1817) / notation watch r2 [#1816](https://github.com/kompiro/karasu/issues/1816)

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

（現時点の暫定: 以下の A/B/C 評価は **adoption 目的**を仮置きして書く。目的が違えば差し替える。）

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

### 暫定 straw man

**B primary / C を B の配布層 / A を B の品質下支え**。

- B = 中心動線（AI 生成 → nest で読む/drill-down → 書きにくい所だけ人が直す）。
- C = 共有の誘い（短い URL/OGP で B へ送客。taka 統合 contract は discussion #1786 に記録済み）。
- A = 品質の床（notation watch は「言語を伸ばす」のではなく「B の reverse 品質を支える」文脈に従属。promotion gate の据え置き規律と整合）。

## 未解決の問い（壁打ちで詰める）

1. **目的関数**は adoption / learning / personal-use のどれが主か（ゼロ番目の問い）。これで枠が変わる。
2. momentum（B/C 寄り）は**意図的**か。A（手書き architect 像）を co-primary に残したいか。
3. solo 運用前提で、VS Code / LSP / app を**保守モードに落として** nest+core に集中する覚悟はあるか（surface portfolio の含意）。
4. 「B が効いている」と判定する**プロダクトバー**（#1783 の good-enough overview をテスト可能にしたもの）は何か。

## 関連・前提

- 動かさない非ゴール: `docs/concepts.md`（sequence/time #23/#28 ほか）。本決定は非ゴール線を動かさない。
- surface portfolio は keystone が主 surface を示した後の**独立判断**（本書では結論まで出さない）。
- 決定したら本書を **ADR（topic: project）に昇格**し、`docs/roadmap.md` の keystone 節を decision で更新する。
