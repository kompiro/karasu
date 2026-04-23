---
id: ADR-20260422-07
title: OPFS 履歴スナップショットを diff 比較ソースにする
status: accepted
date: 2026-04-22
topic: project
depends_on:
  - ADR-20260420-02
related_to:
  - ADR-20260422-06
scope:
  packages:
    - app
  domains:
    - rendering
    - testing
---

# ADR-20260422-07: OPFS 履歴スナップショットを diff 比較ソースにする

- **日付**: 2026-04-22
- **ステータス**: 決定済み
- **関連**:
  - Issue #740 (Closed), PR #786 (実装)
  - ADR-20260420-02 — グラフィカル diff ビューア（本 ADR の上位文脈）
  - ADR-20260422-06 — Diff ペースト入力の UI 配置とストレージ方式（`CompareSource` union の姉妹ケース）
  - Design Doc: `docs/design/opfs-snapshot-diff-source.md`
  - Acceptance Test: `docs/acceptance/0060-opfs-snapshot-diff.md`
  - `packages/app/src/fs/snapshot-manager.ts`
  - `packages/app/src/fs/compare-source.ts`
  - `packages/app/src/components/SnapshotPickerModal.tsx`
  - `packages/app/src/hooks/useSnapshotAutoCapture.ts`

## 背景

Phase 1 の graphical diff viewer（ADR-20260420-02）は「ワークスペース内の別ファイル」だけを比較対象に取っていた。ProjectMode は OPFS を唯一のストアとして運用しており **git が存在しない** ため、「昨日の `index.krs` と今の `index.krs` を比べたい」というブラウザデモの素直な要求に応えられなかった。

Issue #740 はこのギャップを埋める。OPFS 上に時間的スナップショット（タイムスタンプ + 任意ラベル + ファイル内容）を保持し、diff の比較ソースに「ファイル」「ペースト」と並べて出す。

## 決定

以下の 7 軸で選択肢を比較し、実装した（詳細は design doc 参照）。

| 軸 | 採用案 | 要点 |
|----|--------|------|
| A 粒度 | A-2 ファイル単位 | `compareEntryPath` と自然接続、ストレージ効率 |
| B ストレージ配置 | B-1 `/projects/<pid>/.snapshots/<relPath>/` | プロジェクト削除と連動、孤児なし |
| C メタデータ | C-1 `index.json` / ファイル | 構造化メタデータを素直に保持 |
| D キャプチャ | D-1 + D-3 デバウンス 5 分 + 明示保存 | Issue 要件を満たし冗長スナップショットを避ける |
| E 保持数 | E-1 auto 20 件上限・manual 無制限 | クォータ圧迫を予測可能にし、意図保持を尊重 |
| F 識別子 | F-2 `CompareSource` 判別 union | ADR-20260422-06（paste）と共用し、1 回の変更で両者を載せる |
| G UI | G-1 + G-2 FileTree メニュー + diff バナー | 開始は FileTree から、ラベル/タイムスタンプはバナーで明示 |

## 理由

- **`CompareSource` union 化（F-2）が将来の拡張路を閉じない**: #739（paste）・#740（snapshot）がほぼ同時に着地する構造になり、それぞれが `compareEntryPath: string` を独自拡張すると整合性負債が 2 箇所に出る。単一の discriminated union にしておけば、後続の比較ソース（git ref、URL 指定、etc.）も同じ 1 箇所に足せる。
- **ファイル単位粒度（A-2）が診断と整合**: 既存 `compile*Diff` は `beforeEntryPath: string` を受け取る。プロジェクト全体スナップショットを粒度にすると、中から対応する 1 ファイルを引くレイヤーが余計に要る。ファイル単位は今の 3 view hook にそのまま繋がる。
- **overlay FS でスナップショット内 import を解決**: 物理的に `/.snapshot-view/<id>/` を仮想マウントし、スナップショット本体はオーバーレイのコンテンツ、import 相対解決はワークスペースへのパススルーにした。これで「スナップショットは捕捉時点のファイル内容 + 現在の import 依存で再評価される」セマンティクスが得られ、古い import の掘り起こしが必要な場合も別 Issue に分離できる。
- **auto 20 件 / manual 無制限（E-1）が意図と負担を両立**: 自動保存は「直近を気軽に眺める」体験、手動ラベルは「ユーザが残したいと思った時点」を保持する体験。前者だけを GC 対象にすることで、ブラウザのストレージ圧力と「なくしたくないもの」を切り分けられる。
- **内容ハッシュによる dedupe**: 編集が止まって 5 分経つたびにデバウンスが fire する設計上、同一内容の連続 auto キャプチャが発生しうる。`SnapshotManager` 側で FNV-1a による最新レコードハッシュ比較を行い、スキップする。

## 却下した案

- **A-1 プロジェクト単位スナップショット**: 「ある時点の全体像」という意味論は綺麗だが、diff 比較は常に 1 ファイル。スナップショット内の対応ファイルを引く層を追加で書くコストが、得られる意味論に見合わなかった。将来必要になれば、個別ファイルスナップショットを同時刻で束ねるメタデータを足す拡張で届く。
- **B-2 プロジェクト外のグローバル `.snapshots/`**: プロジェクト削除とスナップショット保持を独立にできる利点があるが、孤児の GC が常時必要になる。現行 `ProjectManager.deleteProject` が recursive delete を行っている以上、プロジェクト配下に置くほうが整合性を壊しにくい。
- **C-2 ファイル名にタイムスタンプ・ラベルをエンコード**: メタデータファイルを省ける race 耐性はあるが、ユーザラベルのファイル名安全エスケープが必要になる。`index.json` の race は同時多タブを禁止している現状では問題化せず、素直な拡張余地を残す選択が優る。
- **D-2 固定インターバル (N 分ごと)**: 編集していない時間帯にも同一内容のスナップショットが量産される。デバウンスより効率が悪く意味も薄い。
- **F-1 `snapshot://` スキームを `compareEntryPath: string` に押し込む**: 文字列シェイプを保って最小差分で載せられるが、後続の比較ソースが増えるたびに `FileSystemProvider.readFile` 周辺が URI アウェアに膨れる。`CompareSource` union に寄せるほうが意図が型で説明される。
- **G-1 単独（FileTree コンテキストメニューだけ）**: diff モード中にソースを別スナップショットへ切り替える導線がなくなる。最小実装は G-1 で出し、切替 UI（G-2）は diff バナーのラベル/タイムスタンプ提示とあわせて同時に入れた。
