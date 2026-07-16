# keystone・permalink 用語集

> [English](glossary.md) · **日本語**（このファイル）

**keystone** 壁打ちで導入した load-bearing な用語と、**permalink family** の
恒久的な定義場所。これらは PRD
（[`docs/prd/keystone-primary-path.md`](prd/keystone-primary-path.md)）・
permalink epic（[#1826](https://github.com/kompiro/karasu/issues/1826)）・
[ロードマップ](roadmap.md)・各 ADR にまたがって使われる。用語は**ここを正典として
定義**し、他ドキュメントは定義を再掲せず**このページを参照**する（語彙の drift を防ぐ）。

これは [`docs/spec/glossary.md`](spec/glossary.ja.md)（**モデリング言語**の語彙 —
要素種別・タグ・診断など — の索引）とは別の用語集で、こちらは**製品方向と
permalink** の語彙を持つ。用語の機構が別の正典ドキュメント（permalink アンカー
contract・design doc・ADR）にある場合は、その詳細をリンクし、ここには定義だけを残す。

> Related TPLs: [TPL-20260716-01](test-perspectives/TPL-20260716-01-keystone-terms-single-home.md) — これらの用語は単一の正典（このページ）を持つ。PRD・ロードマップ・epic・spec はこのページを参照し、用語を再定義しない。各項目はリンク先の機構ドキュメントと矛盾してはならない。

## 製品方向（keystone 由来）

keystone 壁打ち（2026-06-28）で karasu の primary path を確定した際に導入。
検討の全容は PRD にあり、確定した決定は
[ロードマップの keystone 節](roadmap.md#keystone-primary-path-と主-surface決定済み-2026-06-28)
に要約されている。

- **read / record split（読む / 残す の分割）** — 2 つの surface の役割分担。
  **karasu-nest = 知らないシステムを*読む***（orientation のための funnel/utility）/
  **karasu 本体 = 自分のシステムを*残す***（retained 製品）。深い retention は*残す*側にある。
- **funnel / retained** — adoption の 2 段階。**funnel** = 獲得・awareness の面
  （web 面: app / nest）/ **retained** = 再訪する製品（in-repo authoring + 記録）。
  nest は funnel であって再訪の主軸ではない。
- **record-as-byproduct** — 構造の記録を「**設計判断の副産物**」として落とす原則。
  別立ての維持作業（chore）にしない。「システム変更 → 図を更新」を主 return trigger
  に*しない*ことで doc-rot を構造的に回避する（keystone 決定 #3）。
- **source of truth / 描画層** — source of truth は in-repo の `.krs` テキスト
  （version 管理）/ 描画・permalink は app / nest の URL 層。競合する複製ではなく、
  同じ `.krs` の別レイヤー。[モデリング用語集](spec/glossary.ja.md#コアコンセプト)
  の **Text as the source of truth** も参照。
- **supply → share → explore** — adoption funnel の仮説。`.krs` を*供給*し
  （例: reverse）、*共有*で拡散し、drill-down で*探索*する。funnel が retention を
  養う筋道についての仮説であって、出荷済み機能ではない。

## permalink family

karasu の permalink は、ADR / PR / docs が karasu の構造を*指す*ための住所。link
方向は **ADR → karasu**（karasu は decision metadata を持たない。判断は ADR 側に
住み、ADR が karasu permalink を指す — keystone 決定 #2）。family は permalink を
いくつかの独立した軸で分類する:

- **permalink（karasu の）** — 外部ドキュメントが karasu の構造を指すための住所。
  参照方向は常に **ADR → karasu**。
- **deep permalink** — model 全体ではなく*特定の構造要素・view*を指す（node id・
  drill-down `:target` anchor）。fragment アンカーの正典 contract は
  [`docs/spec/permalink.md`](spec/permalink.ja.md)。nest の inline share は
  `SharePayload.target` で要素の深さに到達する。
- **repo-backed permalink** — payload を URL に積む代わりに、GitHub repo の `.krs`
  （`/<owner>/<repo>`）を解決して描画する。nest Phase 2 形。
  [ADR-20260716-02](adr/20260716-02-repo-backed-ref-pinned-permalink.md) 参照。
- **ref-pinned permalink** — repo-backed permalink を特定の git ref / SHA に固定
  し、その時点の構造を immutable に描画する — ADR の point-in-time 記録に適合する
  形。[ADR-20260716-02](adr/20260716-02-repo-backed-ref-pinned-permalink.md)
  （SHA 強制と ref-less default HEAD の resolver）参照。
- **inline snapshot permalink** — 現行の nest `?s=` 形。model を URL 自体に凍結する
  （immutable だが repo 非連動・長い → taka で短縮）。repo-backed / ref-pinned が
  揃うまでの near-term の代替。

`deep` は*何を指すか*（粒度）の軸、`repo-backed` / `ref-pinned` /
`inline snapshot` は*payload をどこから引き・どう固定するか*の軸で、これらは
組み合わせ可能（例: deep かつ repo-backed かつ ref-pinned な permalink）。

## 関連項目

- [`docs/spec/glossary.md`](spec/glossary.ja.md) — モデリング言語の用語集
  （要素種別・関係・タグ・診断）。
- [`docs/spec/permalink.md`](spec/permalink.ja.md) — deep permalink アンカーの
  正典 contract。
- [`docs/roadmap.md`](roadmap.md) — keystone の決定と、そこから従属する柱。
- [`docs/prd/keystone-primary-path.md`](prd/keystone-primary-path.md) — これらの
  用語が導入された keystone 壁打ちの全容。
