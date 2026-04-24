# Diff viewer: make the open file the comparison root

- **日付**: 2026-04-24
- **ステータス**: ドラフト
- **関連**:
  - Issue: [#811](https://github.com/kompiro/karasu/issues/811)
  - 親 Issue: [#765](https://github.com/kompiro/karasu/issues/765)（part A は [#800](https://github.com/kompiro/karasu/pull/800) で shipped）
  - ADR: [20260420-02-graphical-diff-viewer.md](../adr/20260420-02-graphical-diff-viewer.md), [20260422-06-diff-paste-input-ui.md](../adr/20260422-06-diff-paste-input-ui.md), [20260422-07-opfs-snapshot-diff-source.md](../adr/20260422-07-opfs-snapshot-diff-source.md)

## 背景・課題

karasu のプレビュー（通常モード・diff モード）は常にプロジェクトの `index.krs` を
エントリとして図を構築する。これはユーザーのメンタルモデルとズレる状況がある:

- エディタで `before.krs` を開いても、プレビューの図は `index.krs` ルートのまま
  変わらない。「今編集しているファイルの内容」と「見ている図」が食い違う。
- diff モードでは after-side が `index.krs` に固定されているため、
  「バージョン A にいて、バージョン B の姿を確認したい」という比較ができない
  （A を開いていても、常に "index.krs → 何か" の向きになる）。

Issue #811 の提案: **エディタで開いているファイルを「図のルート（after-side）」として扱う。**
別のファイルをファイルツリーから選ぶと、それが before-side になる。

## 調査サマリー（現状の実装）

設計の前提を揃えるため、コードベースを調べた結果:

| 観点 | 現状 |
|---|---|
| エントリパスの決定 | `ProjectModeApp.tsx:58` で `${rootPath}/index.krs` にハードコード |
| コア API | `compileProject(entryPath, fs, opts)` は任意のパスを受け付ける。`index.krs` 前提はない |
| `@import` 解決 | インポート元ファイルからの**相対パス**で再帰的に辿る（プロジェクトルート前提なし） |
| diff のノードマッチ | node id のみで突合。(file, id) ではない |
| viewPath ミスマッチ | 片側にしかないセグメントは空スライス → 差分で "added" 扱い |
| `currentFilePath` の用途 | エディタ対象 / snapshot / jump-to-editor のみ。**コンパイルエントリとしては未使用** |

→ **コアは既に任意ファイルをエントリにできる状態**。必要な変更は主にアプリ層。

## 制約・前提

- 本設計の対象は **Project モード**のみ。Serve モード・Memory モードは単一ファイル前提で問題ない。
- **1 プロジェクト内**でのファイル切り替えに閉じる（cross-FS は out of scope）。
- 既存のユースケース（`index.krs` を開いた状態でのプレビュー）を壊さない。
- 既存の snapshot / pasted ソース (#740, #739) との組み合わせで壊れない。
- Issue のタイトルは diff 限定だが、本文は通常モードの挙動にも言及している。
  本設計では **通常モードと diff モードを分けて扱う**（下記「スコープの二分」参照）。

## スコープの二分: 通常モード vs diff モード

Issue #811 の本文には 2 つの独立した要求が混在している:

**(a) 通常モード** — エディタで開いたファイルが、プレビューに直接反映される
**(b) diff モード** — エディタで開いたファイルが、diff の after-side になる

この 2 つは段階的に実装可能で、(a) を入れれば (b) は自動的に成立する
（diff の after-side は常に `entryPath` を使うため、`entryPath = currentFilePath`
になれば自然に「開いているファイルが after-side」になる）。

したがって、**本設計の中核は (a): 通常モードの entry を `currentFilePath` に切り替えること**。
(b) はその副次効果として得られる。

## 検討した選択肢

### 案1: `entryPath` を常に `currentFilePath` にする（最小変更案）

`ProjectModeApp.tsx` の 1 行を以下に変える:

```ts
// before
const entryPath = currentProject ? `${currentProject.rootPath}/index.krs` : null;

// after
const entryPath = currentFilePath ?? (currentProject ? `${currentProject.rootPath}/index.krs` : null);
```

**メリット**
- 変更が 1 行。既存のビュー・diff パイプラインに追加の if/else が入らない。
- ユーザーの「今開いているファイル = 図のルート」というメンタルモデルと素直に一致。
- diff の after-side が自動的に開いているファイルになる → Issue #811 (b) を満たす。
- cross-cutting な UI 変更が不要（swap ボタンもそのまま動く）。

**デメリット**
- 「プロジェクト全体像（index.krs）を見たい」が、他のファイルを開いている間は困難。
  → エディタに戻って `index.krs` を選ぶ必要がある。
- 初回ロード時に `currentFilePath` が null のままだと描画が空になる可能性
  （現状の `useProjectInitialization` が初期選択ファイルを立てるかの確認が必要）。
- `index.krs` が「プロジェクトルート」としての意味を失う
  → プロジェクト全体図は「index.krs を開いたときの図」と再定義される。

### 案2: "Project view" と "File view" を明示的に切り替える UI を追加

プレビュー上部に "Project" / "Current file" のトグルボタンを設けて、ユーザーが
どちらを entry にするか明示的に選ぶ。

**メリット**
- 既存の動作（`index.krs` ルート）を変えずに済む。後方互換性が高い。
- 「プロジェクト全体像」という概念を残せる。

**デメリット**
- UI が増える。ユーザーに「そもそも 2 つのモードがあること」を覚えさせる必要がある。
- Issue #811 のメンタルモデル（開いているファイル = ルート）と食い違う
  → 開いた直後にトグルを押さないと期待した表示にならない。
- diff モードで after-side 固定問題を解消するには別途フラグが必要（複雑度が上がる）。

### 案3: `currentFilePath` が index.krs 以外のときだけ上書き

```ts
const entryPath = (currentFilePath && !currentFilePath.endsWith("/index.krs"))
  ? currentFilePath
  : `${rootPath}/index.krs`;
```

**メリット**
- 「index.krs を選択中」＝「プロジェクト全体」というメンタルモデルを残しつつ、
  他のファイルを開くとそのファイルがルートになる。

**デメリット**
- `index.krs` という名前に特別な意味を持たせる。karasu の仕様には「index.krs」の
  特別扱いは本来なく、ファイル名の慣習でしかない → 仕様の歪みが生まれる。
- 別名の entry ファイル（例: `main.krs`）を使うプロジェクトで破綻する。

## 比較

| 観点 | 案1（open file = entry） | 案2（UI トグル） | 案3（index.krs 特別扱い） |
|---|---|---|---|
| 変更量 | 最小 | 中（UI + state） | 小 |
| メンタルモデル一致度 | ◎ | △ | ○（index.krs 前提で） |
| 後方互換性 | △（index.krs 全体表示の導線変更） | ◎ | ○ |
| diff (b) 自動解決 | ◎ | × | ◎ |
| 仕様の素直さ | ◎ | △ | ×（index.krs 特別化） |

## 現時点の方針

**案1 を採用する** — `entryPath = currentFilePath ?? rootPath/index.krs` に変更。
シンプルで Issue のメンタルモデルに素直に合致し、diff の after-side 問題も同時に解決する。

### Issue の 4 つの設計考慮点への回答

**Q1. Each side may have different @import graphs — how do we compose them?**
→ 現状のコアが既に正しく扱える。各側が独立して import 解決し、union を取る。
node id で突合されるので、同じ id のノードは変更候補、片側だけは add/removed と
マークされる。追加の合成ロジックは不要。

**Q2. Drill-down when structures disagree?**
→ 同じく現状のコアが扱える。`extractView(systems, viewPath)` は見つからないと
空を返し、diff は「片側空 → 全部 added」として描画する。UX として、
drill down したら相手側が見えなくなるケースでは "(removed in before)" のような
ラベルを表示することを将来検討してよいが、本 PR の範囲外。

**Q3. Swap button との関係**
→ **swap は引き続き有用**。理由:
- 通常時: after = 開いているファイル、before = 選んだファイル。
- swap 後: after = 選んだファイル、before = 開いているファイル（＝「相手を基準にしたらどう見えるか」を一時的に見たい）。
- エディタのファイルを変えずに方向だけ反転できる唯一の手段なので、redundant ではない。

**Q4. Snapshot / pasted source との組み合わせ**
→ **open file = after-side** というルールは snapshot/pasted ソースでも一貫させる。
つまり: snapshot や paste を選んだ瞬間、その時点で開いているファイルが after、
snapshot/paste が before。ユーザーが別のファイルに切り替えると after が動的に変わる
（この挙動は #740 の既存 snapshot 設計と矛盾しない）。

### 実装の指針

1. `ProjectModeApp.tsx:58` の `entryPath` 計算を `currentFilePath` 優先に変更。
2. `currentFilePath` が null の初期状態（プロジェクト切替直後など）でのフォールバック
   を `index.krs` とする。初期ロード直後に `useProjectInitialization` が
   `index.krs` を自動選択しているなら実質変化なし。要確認。
3. **非 .krs ファイル**（.krs.style など）を開いているときの扱い
   → `.krs` でなければコンパイルしない／`index.krs` にフォールバック、のどちらか。
   スタイルファイル編集中に図が消えるのは混乱を招くので、フォールバック推奨。
4. AT: `docs/acceptance/` に新規ファイル。TC は
   - 別ファイルを開くとプレビューがそのファイルルートに切り替わる
   - diff モードで after-side が開いているファイルと一致する
   - swap が引き続き期待通り動く
   - .krs 以外のファイルを開いたときの fallback 挙動
5. ADR 昇格: この design doc がマージ→実装完了後、`docs/adr/` に `entry-is-open-file.md` として昇格。

### 影響範囲・マイグレーション

- 既存ユーザーへの影響: プロジェクトを開いて最初に表示される図は `index.krs` ルート
  （現状と同じ）。別ファイルを開くと図が切り替わる（新規挙動）。
- ドキュメント更新: `docs/concepts.md` の "エントリ" 記述を「開いているファイル」に更新。
  `index.krs` は「プロジェクトを最初に開いたときのデフォルト」と位置づけ直す。
- テストデータ（examples/）の `index.krs` 依存箇所: 影響なし（examples は引き続き
  プロジェクト初期ファイルとして使われる）。

## 未解決の問い

1. **非 .krs ファイル（.krs.style, .md など）を編集中の挙動**:
   "最後に開いていた .krs ファイル" を保持するか、`index.krs` にフォールバックするか、
   または「現在のプレビューを維持（ファイルは切り替わるがルートは動かない）」か。
   ベストな UX はどれか。
2. **`currentFilePath` が null の状態が発生しうるか**:
   プロジェクト切替直後の `useProjectInitialization` を読んで、null 状態のフレーム
   が観測されるかを実測したい。observable なら 1 フレーム空画面になりうる。
3. **Issue #811 のタイトル「diff viewer:」という限定**:
   本設計は通常モードも含めて変えることを提案している。Issue のスコープを広げる
   判断でよいか、それとも diff モード限定に絞るべきか。
