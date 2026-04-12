# ADR-0082: Import Project from ZIP — `fflate` 再利用 + トップレベル除去

- **日付**: 2026-04-12
- **ステータス**: 決定済み
- **関連**: Issue #462, [ADR-0068](0068-export-project-zip.md), [ADR-0051](0051-project-selector-operations.md)

## 背景

ADR-0068（#461）により OPFS プロジェクトを `.zip` ファイルとしてダウンロードできるようになったが、エクスポートした ZIP を再度 ProjectMode に読み込む手段がなかった。Import を追加することで以下が実現する：

- **バックアップ復元**: エクスポートした ZIP から再ロード
- **プロジェクト共有**: 他者から受け取った ZIP を自分の ProjectMode に取り込む
- **環境移行**: CLI・VS Code 拡張で編集したプロジェクトを ZIP 経由でブラウザに持ち込む

## 決定

### 1. `fflate` を再利用（追加依存なし）

Export で既に導入済みの `fflate` の `unzipSync(data): Unzipped` を使う。戻り値はパスをキー・`Uint8Array` を値とするレコードになる。同期 API で、バンドルサイズ増加なし。

```ts
import { unzipSync, strFromU8 } from "fflate";
const unzipped = unzipSync(zipBytes);
for (const [path, data] of Object.entries(unzipped)) {
  const content = strFromU8(data);
  // ...
}
```

### 2. トップレベルディレクトリのストリッピング

Export が生成する ZIP は `{projectName}/{relativePath}` 構造のため、全ファイルが共通のトップレベルディレクトリを持つ場合にそのプレフィックスを除去する：

```
ZIP内パス: my-project/services/ecommerce.krs
→ OPFS パス: /projects/{newId}/services/ecommerce.krs
```

共通プレフィックスがない ZIP（フラット構造）はそのまま展開する。

### 3. プロジェクト名の導出

1. **トップレベルディレクトリが 1 つあり全ファイルがその配下にある場合**: そのディレクトリ名を採用（バックアップからの復元時に元のプロジェクト名が自動復元される）
2. **フラット構造など共通トップレベルがない場合**: ZIP ファイル名（拡張子除去）をフォールバック

### 4. 名前の衝突解消

同名プロジェクトが既にあれば `name (2)` / `name (3)` と連番で別名を付ける（`disambiguateName` ユーティリティ）。**上書きはしない**。

### 5. ファイル選択 UX

`<input type="file" accept=".zip">` をレンダリングして `ref.current.click()` でプログラム的に起動。選択後 `file.arrayBuffer()` → `Uint8Array` で解凍。ドラッグ＆ドロップは v1 スコープ外。

### 6. API

`ProjectSelector` に `onImportProject: (file: File) => void` を追加（既存の `onExportProject` と同じパターン）。`ProjectModeApp` 側のフロー：

```
handleImportProject(file)
  ├─ file.arrayBuffer() → Uint8Array
  ├─ parseZipForImport(bytes)              // utils/import-project-zip.ts
  │    ├─ unzipSync
  │    ├─ detectTopLevelDir + stripTopLevelDir
  │    ├─ filter .krs / .krs.style
  │    └─ returns { files, detectedName? }
  ├─ name = detectedName ?? stripExtension(file.name)
  ├─ disambiguateName(name, projects.map(p => p.name))
  ├─ pm.createProject(finalName, files)
  └─ navigateToProject(project)
```

`parseZipForImport` / `disambiguateName` は `packages/app/src/utils/import-project-zip.ts` に独立ユーティリティとして配置。

### 7. UI 配置

`ProjectSelector` のアクション行に `↑ Import` ボタンを追加。プロジェクト未選択時でも使えるため `+ New` と同じ行に常時表示：

```
[ 鴉 ] [ ECプラットフォーム ▼ ] [ + New ] [ ↑ Import ] [ ✎ Rename ] [ ↓ Export ] [ ✕ Delete ]
```

### 8. 除外ルール

`.krs` / `.krs.style` 以外のファイルはサイレントに無視（エラーを投げない）。

## 理由

- **`fflate` 再利用**: 追加依存なし・バンドルサイズ増加なし。Export と Import で同じライブラリを使う一貫性。JSZip（案B）は ~100 KB の追加依存で不整合
- **トップレベル除去の自動化**: Export が生成する `{projectName}/...` 構造を自動的にプロジェクトルートにマップすることで、バックアップ復元が「そのままインポートするだけ」で完結する
- **ディレクトリ名からの名前復元**: ユーザーが ZIP ファイル名を変更していても元のプロジェクト名が保持される（例: `backup-2026-04-12.zip` 内の `my-project/` → プロジェクト名 `my-project`）
- **衝突時の別名付与**: 上書きすると誤ってユーザーデータを破壊する可能性がある。`name (2)` 形式で安全に併存させる
- **サイレント無視**: `.krs` / `.krs.style` 以外は Import スコープ外として扱うことでエラー処理が単純になり、将来のファイル種別追加にも柔軟
- **`ProjectManager.createProject` 既存 API の再利用**: ADR-0050 で `files?` オプション引数を追加済みなので、新規 API を増やさずに既存フローに乗せられる

## 却下した案

### 案B: JSZip

追加依存が必要（~100 KB）で fflate の約 8 倍。Issue には JSZip と記載があったが、Export 実装が fflate を選択したため不整合を避けた。

### 案C: ネイティブ `DecompressionStream`

ZIP 形式のパース（セントラルディレクトリ等のヘッダ解釈）を自前実装する必要があり、実装コストが高く壊れやすい。
