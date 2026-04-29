# `karasu diff` CLI command

- **日付**: 2026-04-29
- **ステータス**: 検討中
- **関連**:
  - Issue [#1020](https://github.com/kompiro/karasu/issues/1020) — Add `karasu diff` CLI command for git-driver use
  - 実装 PR [#1022](https://github.com/kompiro/karasu/pull/1022)
  - 関連 ADR:
    - [ADR-20260420-02](../adr/20260420-02-graphical-diff-viewer.md) — graphical diff viewer
    - [ADR-20260422-06](../adr/20260422-06-diff-paste-input-ui.md) — paste-based diff input
    - [ADR-20260422-07](../adr/20260422-07-opfs-snapshot-diff-source.md) — OPFS snapshot diff
    - [ADR-20260427-03](../adr/20260427-03-diff-open-file-as-entry.md) — open file as entry

## 背景・課題

`.krs` はテキストフォーマットなので、git の diff はそのまま動く。だが「ノードが消えた」「edge の向きが逆になった」といった構造的な変更を **テキスト diff から目で読み取るのは難しい**。実例として、edge ブロックを並び替えただけの diff でも数十行の差分になり、レビューアーは脳内で図を再構築しないと意味が掴めない。

karasu には既にこの問題への解として **アプリ内 graphical diff viewer**（[ADR-20260420-02](../adr/20260420-02-graphical-diff-viewer.md)）があり、`data-diff-state="added | removed | changed | unchanged"` を SVG ノード/エッジに付与する rendering primitive を持っている。入力経路も整備されている — paste（[ADR-20260422-06](../adr/20260422-06-diff-paste-input-ui.md)）と OPFS snapshot（[ADR-20260422-07](../adr/20260422-07-opfs-snapshot-diff-source.md)）。

しかし **CLI 入口が無い**。GitHub / GitLab の PR review では、レビューアーがアプリを起動して 2 つの revision を貼り付ける必要があり、ワークフローが断絶する。CLI から呼べれば `git diff` driver / `git difftool` 経由で **コードレビュー画面に直接グラフィカル diff を出す** ことができる。

## 制約・前提

- `.krs` の語彙・構文は変えない
- 既存 `compile*Diff` API（`compileSystemDiff` / `compileDeployDiff` / `compileOrgDiff`）を再利用する。CLI 専用の diff レンダラーを新設しない
- git external-diff / textconv の慣習に乗る形にする（stdin 対応、return code は 0、stdout に SVG）
- `@import` を含む `.krs` でも動作する（FileSystemProvider 経由で resolve）
- 既存 `karasu render` のオプション設計（`-o`, `--view`）と整合する

## 検討した選択肢

### 案 A: CLI 専用に AST 比較 + 専用レンダラーを新設

- 概要: テキスト → AST → AST diff → 独自 SVG レンダラー、というパスを CLI 内に閉じて作る。
- メリット: アプリのレンダリングパスから切り離せる。
- 致命的なデメリット:
  - 既にアプリ側で diff レンダリングが完成している（`data-diff-state` 出力 + style 統合）。同じ機能を 2 経路持つことになり、変更が片方にしか反映されない drift が発生する。
  - 既存 `compileSystemDiff` 等は `FileSystemProvider` 経由なので CLI から自然に呼べる。新設する理由が無い。
- **却下**。

### 案 B: 既存 `compile*Diff` API を呼ぶ CLI ラッパー（採用）

- 概要: `karasu diff <before> <after>` で `compileSystemDiff` 等を呼び、SVG を stdout に出す。`-` は stdin から読み取り tempfile に書き出してから FileSystemProvider に渡す。
- メリット:
  - in-app diff viewer と CLI が同じレンダリングパスを共有する。1 箇所の修正が両方に反映される。
  - 既存 `karasu render` と同じパターン（`NodeFileSystemProvider` の使い回し、`-o` / `--view` の同名オプション）でユーザーの学習コストが低い。
  - ファイル渡しなので `@import` も既存 resolver で正しく解決される。
- デメリット:
  - stdin → tempfile shim が要る（後述）。
- **採用**。

### 案 C: 全 3 view を 1 つの SVG に bundle して出す

- 概要: `karasu render` の `buildAllViewsSvgProject`（タブ付きの全ビュー bundled SVG）の diff 版を作る。
- メリット: 1 コマンドで system / deploy / org をまとめて見られる。
- 却下理由（v1 では）:
  - core 側に bundled diff 関数（`buildAllViewsSvgDiff` 相当）が無い。新設はスコープ拡大。
  - git external-diff / textconv は 1 ファイル単位の SVG が扱いやすい。bundled SVG は逆に PR コメントの埋め込み等で扱いづらい。
  - **follow-up にする**。需要が確認できてから。

### 案 D: `textconv` だけで済ませる

- 概要: `karasu render` を `[diff "krs"] textconv = karasu render` で textconv に登録する。git は両ファイルを SVG にレンダリングしてから **テキスト diff を取る**。
- メリット: 新コマンド不要。
- 致命的なデメリット:
  - 結果は **2 つの SVG のテキスト diff**。座標が変われば全行差分になる。実用にならない。
  - そもそもユーザーが欲しいのは「グラフィカル diff」。textconv で実現できるのは「テキスト diff のための pre-render」だけ。
- **却下**（ただし help text には「textconv で SVG プレビューを出す代替手段はある」程度には触れる価値あり）。

## 比較

| 観点 | A: 独自レンダラー | B: 既存 API ラッパー | C: bundled view | D: textconv のみ |
|---|---|---|---|---|
| 実装サイズ | 大 | 小（CLI 1 ファイル + テスト） | 中（core に bundle 関数追加） | 0 |
| in-app との整合 | 二重持ち | 完全一致 | 完全一致 | 部分一致 |
| 機能性 | 同等以上だが drift 懸念 | 必要十分 | プラス全 view 統合 | テキスト diff のみで NG |
| follow-up 余地 | 限定 | bundled 化 / drawio 形式 | drawio 形式 | — |

→ **B が圧倒的に妥当**。C は需要次第で follow-up。

## 現時点の方針

案 B を採用。

- `packages/cli/src/diff.ts` を新設し、`compileSystemDiff` / `compileDeployDiff` / `compileOrgDiff` を view 切り替えで呼び分ける。
- 既存 `NodeFileSystemProvider`（`packages/cli/src/render.ts` でエクスポート済み）を再利用し、CLI 専用の FS provider は作らない。
- stdin token は `-`。両方 `-` はエラーで exit 1。
- stdin 側は対側のディレクトリに mkdtemp で `.karasu-diff-XXXXXX/` を作って `before.krs` / `after.krs` の名前で書き出す。`finally` で削除する。これにより stdin 側の relative `@import` も対側のプロジェクトルートから解決される。
- `--view` の既定は `system`。`render` の既定（all-views bundled）と違うが、bundled 版の diff API が無いため。
- help text に git external-diff / `git difftool` の設定例を載せる。

## アクセプタンステスト

`docs/acceptance/1020-karasu-diff-cli.md` 参照。

- [x] 2 ファイル指定で `data-diff-state` 入り SVG を stdout に出す
- [x] `-` で stdin から読み取れる（before / after どちらも）
- [x] 両方 `-` はエラー、ファイル無しはエラー
- [x] `-o` でファイル書き出し（stdout は空）
- [x] `--view system | deploy | org` 切り替え
- [x] 既存 `compile*Diff` を直接呼ぶ（独自レンダラーなし）
- [ ] git external-diff / wrapper script で実環境動作確認（手動）

## 影響範囲

| 領域 | 影響 |
|---|---|
| `packages/cli/src/diff.ts`（新規） | `diff(before, after, options)` 関数 + stdin shim |
| `packages/cli/src/index.ts` | `karasu diff` コマンド登録 + help text |
| `packages/cli/src/diff.{test,e2e.test}.ts`（新規） | 計 10 件のテスト |
| `docs/acceptance/1020-karasu-diff-cli.md`（新規） | AT 記録 |
| 既存 `karasu render` 等 | 変更なし |
| `packages/core` | 変更なし（既存 API を呼ぶだけ） |
| アプリ側 | 変更なし |

## フォローアップ

- **bundled all-views diff**: follow-up Issue [#1025](https://github.com/kompiro/karasu/issues/1025) に切り出した。core に `buildAllViewsSvgDiffProject` を追加して CLI 既定値を bundle に切り替える形を想定している。

## 未対応として確定した論点

- **tempfile leak on SIGKILL**: 通常パスでは `finally` で `.karasu-diff-XXXXXX/` を削除する。`SIGKILL` で強制終了された場合のみ leak するが、Node の `exit` イベントは SIGKILL では発火しないので捕捉手段が無い。OS tempdir に作る案は stdin 側 `@import` の解決を壊すため不可（対側のディレクトリから resolve する設計を捨てる必要がある）。起動時 cleanup は並列実行のレースが煩雑で割に合わない。実害は隠しディレクトリが 1 つ残る程度なので **明示的に未対応とする**。実害が観測されたら `karasu cleanup` 相当のサブコマンドで対応する判断にする。

## ADR 化

PR [#1022](https://github.com/kompiro/karasu/pull/1022) のマージ後、本ドキュメントを ADR に昇格させる予定（`docs/adr/YYYYMMDD-NN-karasu-diff-cli.md`、`topic: cli`）。
