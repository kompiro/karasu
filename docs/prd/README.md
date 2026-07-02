# docs/prd/

PRD（Product Requirements Document）= 製品の**方針・要件**（何を・なぜ作るか）を残す文書。

## `docs/design/` との違い（ライフサイクル）

| | `docs/design/` | `docs/prd/` |
| --- | --- | --- |
| 内容 | **技術設計**（どう作るか・制約・代替案） | **製品要件/方針**（何を・なぜ） |
| 出口 | **ADR 昇格を基本**とし、昇格時に元ファイルを**削除** | **ADR にせず persist**。要件を **GitHub Issue に展開**し、結論を `docs/roadmap.md` へ反映 |
| 寿命 | transient（作業中ファイルのみ） | 残る |

PRD は ADR 化されないため、`docs/design/`（「作業中ファイルのみ」が不変条件）に置くとその前提を破る。製品方針の壁打ち結果はここに置く。

## 運用

- ファイル名: `docs/prd/<kebab-case-name>.md`。
- 冒頭に **種別: PRD**・**ステータス**・**関連**（展開先 Epic/Issue、roadmap 節）を置く。
- 決定が固まったら要件を Issue（Epic + children）に展開し、結論を `docs/roadmap.md` に反映する。
