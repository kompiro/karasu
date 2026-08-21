# karasu-nest をギャラリーにする — 生成をやめ、投稿を預かる

- **日付**: 2026-08-09
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#2578](https://github.com/kompiro/karasu/issues/2578)（親: [#1990](https://github.com/kompiro/karasu/issues/1990)）
  - 再評価する ADR: [ADR-1990](../adr/1990-karasu-nest-pivot-server-reverse.md) 決定 1・3、[ADR-1783](../adr/1783-karasu-nest-hosted-preview.md)（statelessness）
  - 前提となる ADR: [ADR-1996](../adr/1996-karasu-nest-data-trust.md)（未了 6 件）、[ADR-2249](../adr/2249-permalink-generation-seam.md)、[ADR-2262](../adr/2262-nest-intake-and-completion.md)
  - 競合する提案: [#2378](https://github.com/kompiro/karasu/pull/2378)（server-side 生成を維持して公開範囲を広げる）
  - コード: `packages/nest/src/`

## 背景・課題

ADR-1990 は **server-side reverse** を決め、「ゼロ設定（App を入れる → 図が出る）が最大の差別化」と位置づけた。ピボットから 3 週間で、その手段のコストが推定ではなく実測になった。

- 1 ラン **$3.15**（#2226）。失敗しても同額で、[ADR-1994](../adr/1994-karasu-nest-free-tier-quota.md) の枠を 1 消費する
- [ADR-1996](../adr/1996-karasu-nest-data-trust.md) の未了 6 件（zero-retention 契約・privacy policy・ToS 責任制限・DPA・公開先・問い合わせ窓口）は**すべて法務**で、すべてブロッカー。ADR-1990 自身が「技術ではなくここが solo 運用の重り」と書いている
- 最初の 1 回が通るまでに 5 回以上の失敗と、[#2374](https://github.com/kompiro/karasu/issues/2374) / [#2379](https://github.com/kompiro/karasu/issues/2379) の起票を要した

本文書が検討するのは、**生成をサービスから外し、ユーザーが自分の環境で reverse した `.krs` を預かって共有するギャラリー**にする案である。

## 現状（インベントリ）

### ピボットの動機と、それを満たす手段

ADR-1990 が挙げた動機は 2 つで、どちらも **server-side 生成を必要としない**。

| 動機 | server-side 生成での解 | ギャラリーでの解 |
| --- | --- | --- |
| private repo が開けない（#1960） | installation token で fetch する | **問題が発生しない** — サービスはソースを見ない |
| repo に `.krs` が commit されていない | サービスが生成する | 投稿を受け付ける（commit 不要） |

**server-side 生成は目的ではなく手段として選ばれていた。** これが本文書の出発点である。

### いま `packages/nest` にあるもの

ギャラリーに転じたとき、何が残り何が消えるかを先に確定させる。

| モジュール | 役割 | ギャラリーでの扱い |
| --- | --- | --- |
| `store/` | 生成物の SHA-keyed キャッシュ、`owner/repo` ディレクトリ、purge | **残る**（保存対象が生成物から投稿物に変わるだけ） |
| `routes/repo.ts` | `GET /<owner>/<repo>` | **残る** |
| `routes/health.ts` | binding 報告 | 残る（項目は減る） |
| `github/` | App JWT・installation token・tarball 取得・PR 作成 | **大半が消える**。投稿の帰属確認に一部残る可能性 |
| `reverse/` | survey → decompose → synthesise → repair | **消える** |
| `redact/` | egress 前の資格情報置換 | **消える**（送る先が無い）。ただし投稿物の scan は別途要否を判断 |
| `generate/`, `quota/`, `meter/` | Workflow・枠・計測 | **消える** |
| `deliver/` | PR 還元 | **消える**（ユーザーが自分で commit する） |

`packages/nest` のおよそ半分が削除され、残るのは**保存と配信**である。

### 制約として効いている過去決定

- [ADR-1783](../adr/1783-karasu-nest-hosted-preview.md) は inline share をステートレスにした理由を「**DB・保存型 paste・モデレーション面を持たず**、運用負荷ゼロ」と書いた。ギャラリーはこの 3 つを持つ
- [ADR-2249](../adr/2249-permalink-generation-seam.md) は「2 つの面は実行時に接続されず、repo で合流する」と決めた。投稿を受け付けると**合流点が repo でなくなる**
- [ADR-2262](../adr/2262-nest-intake-and-completion.md) は起動権限を installation に閉じ、完了通知を PR 還元にした。生成が無ければ両方とも意味を失う

## 制約・前提

- **`.krs` は構造のみ**という性質は変わらない。投稿物を保存することは、生成物を保存することと同じ種類の行為である
- ローカル reverse の手段は既にある（`.claude/skills/reverse-architecture/SKILL.md`、`karasu` CLI、`docs/guide/reverse-engineering-with-ai.md`）。ADR-1783 の「reverse はドキュメントで案内」は生きている
- #2378 と両立しない。**どちらを採るかを決めてからでないと #2378 のレビューが宙に浮く**
- 本文書は ADR-1990 を supersede しうる。採らない場合も、**なぜ採らないか**を記録する必要がある（動機 2 つが server-side 抜きで満たせる事実は消えないので、この問いは再浮上する）

## 検討した選択肢

### A. ギャラリーへ転じる（生成を廃止）

サービスは投稿された `.krs` を預かり、閲覧・共有・permalink を提供する。生成はユーザーの環境で行う。

- 法務の重り 6 件が**消滅**する。data processor ではなくなる
- 推論費ゼロ。quota 機構（#1994 / #2382）が不要になる
- `packages/nest` の約半分が削除され、維持面が縮む
- **ゼロ設定を失う**。#1960 の「実質ローカルツールに収束」批判を正面から受ける
- **モデレーション面を持つ**（ADR-1783 が意図的に避けたもの）

### B. 現状維持（server-side 生成）

- ゼロ設定という差別化を保つ
- 法務 6 件が未了のまま。他人の private repo に向けられない状態が続く
- 1 ラン $3.15 をサービスが負担し続ける

### C. #2378 の方向（生成を維持し、public repo へ公開範囲を広げる）

- 起動を運用者に閉じたまま、読む人を増やす
- 法務の重りは**軽くなる**（public repo なら private コードの処理が無い）が消えはしない（ToS・privacy policy は public でも要る — ADR-1996 の却下記録）
- 推論費は残り、むしろリクエスト増で伸びる

### D. 段階案 — ギャラリーを土台に、生成を後付けする

投稿を基本とし、installation がある repo に限って server-side 生成も提供する。

- 移行が滑らか。生成を止めずに済む
- **両方の重りを背負う** — モデレーション面と data processor 責任が同時に発生する。ADR-1996 の 6 件は 1 件も減らない
- 「ゼロ設定が売り」と「投稿してもらう」が同居し、**サービスが何であるかの説明が 2 つになる**

## 比較

| 観点 | A ギャラリー | B 現状維持 | C 公開読取 | D 段階 |
| --- | --- | --- | --- | --- |
| ADR-1996 の未了 6 件 | **消滅** | 残る | 大半残る | 残る |
| 1 ラン $3.15 | ゼロ | 継続 | 継続（増える） | 継続 |
| ゼロ設定 | **失う** | 保つ | 保つ | 保つ |
| モデレーション面 | **持つ** | 持たない | 持たない | **持つ** |
| private repo | 発生しない | 法務待ち | 対象外 | 法務待ち |
| 維持コード量 | 約半減 | 現状 | 増える | 増える |
| #2378 との関係 | 排他 | — | それ自体 | 部分的に両立 |

## Related TPLs

- [TPL-2249](../test-perspectives/TPL-2249-resolution-stays-deterministic.md) — 解決は決定的である。投稿を受け付けると `owner/repo` が指すものが「repo の内容」から「誰かが投げたもの」に変わる。同じ URL が別のものを指しうる点は、この観点の直接の適用対象
- [TPL-1995](../test-perspectives/TPL-1995-generated-content-is-marked-at-its-seams.md) — 生成物の不確かさは印で表す。投稿物は誰が何で作ったか分からないので、`@draft` の供給源が消える
- [TPL-2254](../test-perspectives/TPL-2254-durable-record-points-at-durable-address.md) — 記録は長生きするアドレスを指す。投稿物と repo の commit の対応をどう保つか
- [TPL-2288](../test-perspectives/TPL-2288-background-work-platform-ceiling.md) — 生成が無くなれば適用対象も消える

## 現時点の方針

**まだ無い。** 下の問いが未解決で、どれも技術ではなく製品の判断に属する。

ただし 1 点だけ確定している: **#2378 のレビューはこの決着まで保留すべき**である。逆を向いた 2 つの提案を同時に進めると、どちらの前提も検証できない。

## 未解決の問い

1. **ゼロ設定を失う代償は、法務とコストの重りより大きいか。** ADR-1990 決定 1 の再評価そのもの。#1960 の批判が、`reverse-architecture` skill と CLI が揃ったいまも同じ強さで成立するか
2. **モデレーション負荷と data processor 負荷の、どちらが solo 運用に耐えるか。** 前者は投稿量に比例し、後者は固定費（契約・文書）である。量の見込みが要る
3. **ギャラリーは品質を保証するか。** server-side なら BC 粒度（ADR-2077）を担保できたが、投稿物にはできない。自分のシステムの自分のモデルなら保証は不要かもしれない
4. **`owner/repo` という鍵を使い続けるか。** 投稿物は repo の内容ではないので、同じ URL 空間を使うと TPL-2249 の意味で解決が非決定的になる。別の名前空間（投稿 id）にするか
5. **投稿者の帰属をどう確認するか。** 「その repo のモデルである」と名乗るのを誰でもできてよいか。GitHub OAuth で push 権限を確認するなら、`github/` の一部は残る
