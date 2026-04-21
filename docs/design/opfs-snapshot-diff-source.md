# OPFS 履歴スナップショットを diff 比較ソースにする

- **日付**: 2026-04-21
- **ステータス**: 検討中
- **関連**:
  - Issue #740（本 Issue）
  - Issue #650 (Closed), PR #725 — Phase 1 system-view diff
  - Issue #739 — diff viewer: paste .krs blob as comparison source
  - Issue #645 — "Diff-friendly text source" positive goal
  - [ADR-20260420-02](../adr/20260420-02-graphical-diff-viewer.md) — graphical diff viewer
  - `packages/app/src/fs/opfs-provider.ts`、`packages/app/src/fs/project-manager.ts`
  - `packages/app/src/state/app-reducer.ts`（`compareEntryPath`）
  - `packages/app/src/hooks/useSystemView.ts`（`compileSystemDiff` への橋渡し）

## 背景・課題

Phase 1 diff ビューア（#650 / PR #725）は「ワークスペース内の別ファイル」を比較対象として選ぶことしかできない。一方、karasu のブラウザデモ (`ProjectModeApp`) は OPFS でプロジェクトを保持しており、**git が存在しない**。そのためユーザーは「昨日の図」と「今の図」を比較する手段を持たない。

Issue #740 はこのギャップを埋める。OPFS 上に **時間的スナップショット**（タイムスタンプ + 任意ラベル + ファイル内容）を保持し、diff の比較ソース選択肢として「別ファイル」と並べて提示する。

### 解決したい具体例

- ブラウザデモで「今朝から何が変わった？」を 1 クリックで確認
- `index.krs` を編集中に「直前のリファクタ前に戻したい訳ではないが比較はしたい」
- ステークホルダーに「この 30 分でこれだけ進んだ」と時系列で見せる

### Issue 明記のスコープ

- OPFS / ブラウザ永続化レイヤーのみ — サーバ側ストレージは作らない
- スナップショットは **読み取り専用** — 「スナップショットから復元」は本 Issue の範囲外
- 自動キャプチャ（何らかのケイデンス）と明示 save の両方
- diff の比較ソース picker でファイルと並べて表示する
- diff バナーにラベルとタイムスタンプを出す

## 制約・前提

- 既存 `compareEntryPath: string | null` インタフェース — 3 ビュー（`useSystemView` / `useDeployView` / `useOrgView`）と `compileSystemDiff` 系が **パス文字列** で比較対象を受け取る前提になっている。
- OPFS クォータはブラウザ実装依存（Chrome は Storage API pressure 下で削除されうる）。クリティカルなデータではない扱いが適切。
- プロジェクト構造は `/projects/<uuid>/<file>`。スナップショットもこの配下に置くと `FileTree` に漏れうる。
- `ProjectManager` は単一 `/meta/projects.json` でメタデータを管理している。スナップショットのメタデータもどこかで持つ必要がある。
- 自動キャプチャはメインスレッドのエディタ編集イベントを契機にする必要があるが、高頻度編集でストレージを食い潰さないようデバウンスが必須。

### スコープ外

- スナップショットからの復元（restore-from-snapshot） — 別 Issue
- クロスプロジェクトのスナップショット比較
- スナップショットのエクスポート / インポート（将来の永続共有手段は別途検討）
- MemoryModeApp（単発バッファモード）での対応 — 本機能は ProjectMode 前提

## 検討した選択肢

### 軸A: スナップショットの粒度

#### A-1: プロジェクト単位（全ファイルをまとめて 1 スナップショット）

プロジェクト root 配下の全 `.krs` を 1 回でスナップショットする。

- **メリット**: 「ある時点の全体像」という意味論が明快。複数ファイル間の整合性がある状態を保てる。
- **デメリット**: diff 比較は常に「特定の 1 ファイル」に対して行う。スナップショット内の対応ファイルをパスで引く仕組みが追加で要る。ストレージ量も大きい。

#### A-2: ファイル単位（採用候補）

各 `.krs` ファイルに対し独立のスナップショット列を持つ。

- **メリット**: 既存の `compareEntryPath`（単一ファイル比較）と自然に接続する。ストレージ効率が良い（編集していないファイルはコピーされない）。
- **デメリット**: 「プロジェクト全体の過去状態」という感覚的な意味論が失われる — ただし現行 diff が 1 ファイル比較なので、ここでは問題にならない。
- 将来的に「プロジェクト全体スナップショット」が必要になった場合は、個別ファイルスナップショットを同時刻で束ねるメタデータを追加すれば拡張可能。

### 軸B: ストレージレイアウト

ファイル単位（A-2）採用を前提に。

#### B-1: `/projects/<pid>/.snapshots/<filename>/<snapshot-id>.krs`

プロジェクト配下に隠しディレクトリ（`.` 始まり）を置き、ファイル名ごとに subdirectory を作る。

- **メリット**: プロジェクト削除時に連動して消える（`ProjectManager.deleteProject` が recursive delete なのでそのまま動く）。プロジェクトのエクスポート/インポートにも自然に含まれる。
- **デメリット**: `FileTree` が `.snapshots` を読み込んで表示してしまう可能性 — `readDir` の結果でフィルタする必要がある。ただし `.` プレフィックスで非表示の慣習は OS/Git と同じで既存フィルタの素直な拡張。

#### B-2: `/snapshots/<pid>/...`

プロジェクト外にグローバルに配置する。

- **メリット**: プロジェクト削除とスナップショット保持のポリシーを独立に決められる（例: プロジェクト誤削除時の救済）。
- **デメリット**: 削除時の整合性管理（孤児スナップショットの掃除）が追加で要る。「プロジェクトの一部」という意味論と齟齬。

**採用: B-1**。B-2 の「誤削除救済」は現状 `ProjectManager.deleteProject` に確認 UI が別途あるため、層を分ける利益より整合性負債の方が大きい。

### 軸C: スナップショットメタデータの保持場所

1 スナップショットは `{ id, createdAt, label?, trigger: "auto" | "manual", filePath }` を持つ。

#### C-1: メタデータファイル `/projects/<pid>/.snapshots/<filename>/index.json`

ファイルごとの `index.json` に `{ id, createdAt, label?, trigger }[]` を持つ。

- **メリット**: スナップショット本体と同じディレクトリで完結する。リスト取得が 1 回の `readFile` で済む。
- **デメリット**: 書き込み時の race — 同時に複数タブから書き込まれると壊れる。ただし同一プロジェクトを複数タブで開くのは現状非対応であり、最初のリリースでは許容できるリスク。

#### C-2: コンテンツ内埋め込み（ファイル名にタイムスタンプを入れて列挙する）

`<timestamp>-<label-slug>.krs` で命名し、`readDir` で得る。

- **メリット**: メタデータファイルが不要。race 耐性が高い。
- **デメリット**: ラベル（ユーザー任意文字）を安全にファイル名に入れるエスケープが必要。OPFS のファイル名制約も絡む。

**採用: C-1**。メタデータの構造（trigger や任意フィールド）を素直に表現できる利益が大きい。race はコメントで明示して後追い対応の余地を残す。

### 軸D: キャプチャのケイデンス

#### D-1: デバウンス自動キャプチャ（採用候補）

エディタ編集イベントから 5 分デバウンス（次の編集が 5 分来なければ確定してスナップショット作成）。加えて `beforeunload` / タブ切り替え時の明示 flush。

- **メリット**: 「何もせずとも過去数時間分は取れている」体験。デバウンスで書き込み頻度を抑える。
- **デメリット**: 「5 分」の選定が恣意的 — ユーザー設定可能にすることで緩和。

#### D-2: 固定インターバル（N 分ごと）

`setInterval` で絶対時刻で自動スナップショット。

- **デメリット**: 編集していない時間帯にも同一内容のスナップショットが量産される。効率と意味の両面で D-1 に劣る。

#### D-3: 明示的 save のみ

ユーザーのボタン操作でのみ。

- **デメリット**: 「自動で取れている」が Issue の提案に明記されており、明示のみでは要件を満たさない。D-1 と併用は必須。

**採用: D-1 + 明示保存ボタン**。デバウンス時間は当面固定 5 分。設定 UI は別 Issue。

### 軸E: 保持数・GC

#### E-1: 件数上限（ファイルあたり 20 件、超過した自動スナップショットから古い順に削除）（採用候補）

手動スナップショット（`trigger: "manual"`）は上限対象から除外する（ユーザー意図があるため）。

- **メリット**: OPFS クォータ圧迫の上限が予測可能。「手動ラベル付き」は意図的保持対象という意味論。
- **デメリット**: 具体的な数字（20）はチューニングで変わりうるが、定数で実装し後で調整可能にする。

#### E-2: 時間ベース（24 時間以降は間引き）

古い自動スナップショットは密度を減らす。

- **デメリット**: 実装が複雑。初期リリースでは E-1 で十分。

**採用: E-1**。24 時間以降の間引きは将来の拡張余地として残す。

### 軸F: 比較ソース識別子の表現

`compareEntryPath: string | null` が既存インタフェース。スナップショットも文字列で表すか拡張するか。

#### F-1: `snapshot://` スキーム（採用候補）

`snapshot:///projects/<pid>/.snapshots/<filename>/<snapshot-id>.krs` のような URI 風識別子を `compareEntryPath` に入れる。

- **メリット**: `string | null` のシェイプを保持できる。`FileSystemProvider.readFile` 相当の層で URI をディスパッチする 1 箇所の変更で済む。
- **デメリット**: `FileSystemProvider` インタフェースが URI を受ける前提でない場合、ラッパーが必要。実際には `useSystemView` 系が `beforeEntryPath: string` を `readFile(beforeEntryPath)` に渡す形なので、`readFile` をスキーム対応にするか、事前に snapshot content を一時ファイルに materialize するかの二択。

#### F-2: 型を `CompareSource = { kind: "file"; path: string } | { kind: "snapshot"; snapshotId: string }` に拡張

- **メリット**: 型が意図を説明し、ケース追加に強い（paste（#739）も同じ仕組みで載る）。
- **デメリット**: 既存 3 ビュー hook と `compileSystemDiff` の signature を全て変更する — 変更範囲が大きい。

**採用: F-2（中期的には正）、F-1（短期の実装コスト）**。

推奨: 本 Issue では **F-2** を採る。#739（paste）が控えており、そこでも同じ拡張が必要になる。2 回変更するより 1 回で済ませる。

### 軸G: UI — 比較ソース picker

現状の picker が何かを先に確認する必要がある。`FileTree.tsx:149` の `compare-with-current` コンテキストメニューが今のエントリポイント。

#### G-1: 既存 FileTree コンテキストメニューを拡張

ファイルの隣に「履歴から比較...」を追加し、選択するとスナップショット一覧モーダル。

- **メリット**: 既存 UI に馴染む。
- **デメリット**: スナップショットは「ファイルに付く」ものなので、どのファイルで開くかという文脈が要る。

#### G-2: diff バナー（既に表示されている）にソース切替ドロップダウン

diff 実行中のバナーに「比較ソース: <path> ▼」を置き、ドロップダウンでファイル/スナップショットを選ぶ。

- **メリット**: diff モード中のコンテキストで完結する。
- **デメリット**: diff モード「開始」時のソース選択は依然 FileTree 経由。

**採用: G-1 + G-2 の両対応**。開始は FileTree から、切替は diff バナーから。本 Issue では G-1 の最小実装（「比較対象を履歴から選ぶ」モーダル）を先に出す。

## 比較

|軸|案|採否|主な理由|
|---|---|---|---|
|A 粒度|A-2 ファイル単位|採用|`compareEntryPath` と自然接続、ストレージ効率|
|B レイアウト|B-1 `/projects/<pid>/.snapshots/...`|採用|プロジェクト削除と連動、孤児問題なし|
|C メタデータ|C-1 `index.json`|採用|構造化メタデータを素直に保持|
|D ケイデンス|D-1 デバウンス + 明示保存|採用|Issue 要件を満たし冗長スナップショットを避ける|
|E 保持|E-1 件数上限（auto 20、manual 無制限）|採用|実装単純、意図保持を尊重|
|F 識別子|F-2 `CompareSource` 型拡張|採用|#739 も同じ拡張を要求するため今が変更の機会|
|G UI|G-1 FileTree → snapshot モーダル|採用|既存 picker を段階的に拡張|

## 採用案の概略

### データモデル（`packages/app/src/fs/snapshot-manager.ts` 新規）

```ts
interface SnapshotRecord {
  id: string;            // uuid
  filePath: string;      // project-relative, e.g. "index.krs"
  createdAt: string;     // ISO
  label?: string;        // user-provided
  trigger: "auto" | "manual";
  sizeBytes: number;     // for future GC heuristics
}

interface SnapshotIndex {
  version: 1;
  records: SnapshotRecord[];  // newest first
}

class SnapshotManager {
  constructor(private fs: FileSystemProvider, private projectRoot: string) {}
  async capture(filePath: string, content: string, opts: { trigger: "auto" | "manual"; label?: string }): Promise<SnapshotRecord>;
  async list(filePath: string): Promise<SnapshotRecord[]>;
  async read(filePath: string, snapshotId: string): Promise<string>;
  async delete(filePath: string, snapshotId: string): Promise<void>;
  // E-1 GC：auto trigger のみを対象に件数上限超過を古い順削除
  private async gcIfNeeded(filePath: string): Promise<void>;
}
```

### 比較ソース型拡張

```ts
type CompareSource =
  | { kind: "file"; path: string }
  | { kind: "snapshot"; filePath: string; snapshotId: string };
  // paste（#739 で追加予定）: | { kind: "inline"; content: string };
```

`app-reducer.ts` は `compareEntryPath: string | null` を `compareSource: CompareSource | null` に置換。3 ビュー hook と `compileSystemDiff` も追随。`beforeContent` 取得は「source → content 解決」を 1 箇所（`resolveCompareSource(fs, snapshotManager, source)`）に集約。

### 自動キャプチャ

- `useProjectInitialization` またはエディタ変更ハンドラの近くに `useSnapshotAutoCapture(filePath, content)` を追加
- デバウンス 5 分、`beforeunload` で flush
- 連続編集の同一直近スナップショットと内容が同じなら skip（内容ハッシュ比較）

### UI フロー

1. FileTree コンテキストメニュー「履歴から比較...」
2. モーダルで対象ファイルの `SnapshotRecord[]` をタイムスタンプ降順で一覧（ラベル・trigger バッジ付き）
3. 選択 → `dispatch({ type: "set-compare-source", source: { kind: "snapshot", ... } })`
4. `AppShell` の diff バナー表示を拡張 — ラベルとタイムスタンプを表示
5. 明示保存ボタンは後続（最小リリースはコンテキストメニュー「現在状態をスナップショット」で足りる）

### 段階的リリース

1. **Phase 1**: `SnapshotManager` 本体と vitest（ブラウザ OPFS 依存は memfs provider でモック）。`CompareSource` 型への移行（既存 `kind: "file"` のみ実装、機能変化なし）。
2. **Phase 2**: 自動キャプチャ配線 + 明示保存コンテキストメニュー。UI なしで OPFS を devtools で覗けば確認できる状態。
3. **Phase 3**: スナップショット picker モーダル + diff バナー拡張。

本 Issue の完了は Phase 3 まで。PR は Phase ごとに分けられるが、最小 1 PR でも可（コミット分割で追跡性確保）。

## アクセプタンステスト

`docs/acceptance/` に追加する受け入れテスト項目（人間確認が必要なもののみ）:

- AT-1: ProjectMode でファイルを編集すると、5 分後に自動スナップショットが 1 件作成される（devtools で OPFS 確認 or list API）
- AT-2: FileTree コンテキストメニュー「現在状態をスナップショット」からラベル付き手動スナップショットが作成できる
- AT-3: 「履歴から比較...」メニューからスナップショットを選ぶと diff ビューが開き、バナーにラベルとタイムスタンプが表示される
- AT-4: 自動スナップショットが 20 件を超えると、最古の auto トリガーから消え、manual は残る
- AT-5: プロジェクトを削除すると `.snapshots` ディレクトリも消える

## 未解決の論点（実装中に決める）

- デバウンス時間（5 分）の初期値妥当性 — 実運用で調整
- 同一内容連続スキップのハッシュアルゴリズム（軽量さ優先で FNV-1a か `sha-256` の先頭のみ）
- 将来の「プロジェクト全体スナップショット」をまたいだ diff への布石をどこまで今入れるか — 初期は入れない
- `.snapshots` ディレクトリを FileTree から隠すフィルタの実装位置（`readDir` レベル or `FileTree` 表示レベル）
