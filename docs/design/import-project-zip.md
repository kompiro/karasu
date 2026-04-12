# Import Project from ZIP

- **日付**: 2026-04-12
- **ステータス**: 検討中
- **関連**: [Export Project as ZIP](./export-project-zip.md), [ProjectSelector UI 操作設計](./project-selector-operations.md), [Issue #462](https://github.com/kompiro/karasu/issues/462)

## 背景・課題

[Export Project as ZIP (#461)](https://github.com/kompiro/karasu/issues/461) により、OPFS プロジェクトを `.zip` ファイルとしてダウンロードできるようになった。
しかし、エクスポートした ZIP を再度 ProjectMode に読み込む手段がない。
Import 機能を追加することで、以下のユースケースが完結する：

- **バックアップ復元**: エクスポートした ZIP から再ロード
- **プロジェクト共有**: 他者から受け取った ZIP を自分の ProjectMode に取り込む
- **環境移行**: CLI・VS Code 拡張で編集したプロジェクトを ZIP 経由でブラウザに持ち込む

## 制約・前提

- ブラウザ内で完結する（サーバーサイド処理なし）
- ファイル書き込みは既存の `FileSystemProvider.writeFile()` API を使い、OPFS 実装に直接依存しない
- ZIP の解凍ライブラリは Export で導入済みの **fflate** を再利用する（依存追加なし）
- ドラッグ＆ドロップは v1 スコープ外。`<input type="file">` のプログラム的起動のみ
- `.krs` / `.krs.style` 以外のファイルは **サイレントに無視**（エラーを投げない）
- プロジェクト名が衝突する場合は上書きせず **「name (2)」形式の別名で作成**

## 検討した選択肢

### A. fflate（`unzipSync`）

Export と同じライブラリ。`unzipSync(data: Uint8Array): Unzipped` で ZIP を展開し、
戻り値はパスをキー・`Uint8Array` を値とするレコードになる。

```ts
import { unzipSync, strFromU8 } from "fflate";

const unzipped = unzipSync(zipBytes);
// { "my-project/index.krs": Uint8Array, "my-project/services/ecommerce.krs": Uint8Array }
for (const [path, data] of Object.entries(unzipped)) {
  const content = strFromU8(data);
  // ...
}
```

- 追加依存なし（既にインストール済み）
- 同期 API でシンプル
- バンドルサイズ増加なし（Export で既に含まれる）

### B. JSZip

- 追加依存が必要（~100 KB、fflate の約 8 倍）
- Issue には JSZip と記載があるが、Export 実装が fflate を選択したため不整合が生じる

### C. ネイティブ `DecompressionStream`

- ZIP 形式のパース（セントラルディレクトリ等のヘッダ解釈）を自前実装する必要がある
- 実装コストが高く、壊れやすい

## 比較

| 観点            | fflate（再利用）  | JSZip     | ネイティブ  |
| --------------- | ----------------- | --------- | ----------- |
| 追加依存        | ◎ なし            | ✕ 追加要  | ◎ なし      |
| バンドル増加    | ◎ なし（既存）    | ✕ ~100 KB | ◎ なし      |
| 実装コスト      | ◎ 低い            | ○ 低い    | ✕ 高い      |
| Export との一貫性 | ◎                | ✕         | ◎           |

## 現時点の方針

### ZIP 解凍: fflate を再利用

`unzipSync` で同期的に展開する。ブラウザ内での ZIP サイズは想定数十 KB〜数 MB 程度であり、
メインスレッドブロックは許容範囲内と判断する。

### トップレベルディレクトリのストリッピング

Export が生成する ZIP のパス構造は `{projectName}/{relativePath}` となっている（例: `my-project/index.krs`）。
Import 時は、全ファイルが共通のトップレベルディレクトリを持つ場合にそのプレフィックスを除去し、
プロジェクトルート相対のパスとして扱う。

```
ZIP内パス: my-project/services/ecommerce.krs
→ OPFS パス: /projects/{newId}/services/ecommerce.krs
```

共通プレフィックスがない ZIP（フラット構造）はそのまま展開する。

### プロジェクト名の導出

以下の優先順位でプロジェクト名を決定する：

1. **ZIP 内にトップレベルディレクトリが1つあり、全ファイルがその配下にある場合**  
   → そのディレクトリ名をプロジェクト名とする  
   （Export が `{projectName}/file.krs` 構造で ZIP を生成するため、バックアップからの復元時に元のプロジェクト名を自動復元できる）

2. **フラット構造など、共通トップレベルがない場合**  
   → ZIP ファイル名から拡張子を除いた文字列をフォールバックとする

```
# ケース1: Export が生成した ZIP（バックアップ復元）
my-project.zip
  my-project/index.krs
  my-project/services/ecommerce.krs
→ プロジェクト名: "my-project"（ディレクトリ名から導出）

# ケース2: ファイル名が変わっていても元のプロジェクト名を復元できる
backup-2026-04-12.zip
  my-project/index.krs
  my-project/services/ecommerce.krs
→ プロジェクト名: "my-project"（ディレクトリ名から導出）

# ケース3: フラット構造の ZIP
archive.zip
  index.krs
  services/ecommerce.krs
→ プロジェクト名: "archive"（ファイル名フォールバック）
```

この導出ロジックは `parseZipForImport` 内で行い、戻り値に `detectedName` を含める。
呼び出し側は `detectedName ?? deriveFromFileName(file.name)` の順で名前を決定する。

### 名前の衝突解消

同名プロジェクトが既に存在する場合、`name (2)`・`name (3)` と連番で別名を付ける。

```ts
function disambiguateName(name: string, existingNames: string[]): string {
  if (!existingNames.includes(name)) return name;
  let n = 2;
  while (existingNames.includes(`${name} (${n})`)) n++;
  return `${name} (${n})`;
}
```

### ファイル選択 UX

`<input type="file" accept=".zip">` をレンダリングして `ref.current.click()` でプログラム的に起動する。
ファイル選択後 `onChange` で `File` オブジェクトを取得し、`file.arrayBuffer()` → `Uint8Array` に変換して解凍する。

```tsx
const importRef = useRef<HTMLInputElement>(null);
// ボタンクリック
const handleImportClick = () => importRef.current?.click();
// ファイル選択後
const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
  const file = e.target.files?.[0];
  if (file) onImportProject(file);
  e.target.value = ""; // 同じファイルを再選択可能にリセット
};
```

### API 設計

`ProjectSelector` に `onImportProject: (file: File) => void` コールバックを追加する。
これは既存の `onExportProject: () => void` と同じパターン。

`ProjectModeApp` 側でのハンドラは以下のフロー：

```
handleImportProject(file: File)
  ├─ file.arrayBuffer() → Uint8Array
  ├─ parseZipForImport(bytes)              // utils/import-project-zip.ts
  │    ├─ unzipSync(bytes)
  │    ├─ detectTopLevelDir(unzipped)      // 共通トップレベルを検出
  │    ├─ stripTopLevelDir(unzipped)       // プレフィックス除去
  │    ├─ filter .krs / .krs.style
  │    └─ returns { files, detectedName? }
  ├─ name = detectedName ?? stripExtension(file.name)
  ├─ disambiguateName(name, projects.map(p => p.name))
  ├─ pm.createProject(finalName, files)    // ProjectManager 既存 API を再利用
  ├─ dispatch({ type: "ADD_PROJECT", project })
  └─ navigateToProject(project)
```

`parseZipForImport` / `disambiguateName` は
`packages/app/src/utils/import-project-zip.ts` に独立したユーティリティ関数として配置する。

### UI 配置

`ProjectSelector` のアクション行に `↑ Import` ボタンを追加する。
Import は常に（プロジェクト未選択時も）操作可能なため、`+ New` ボタンと同じ行に配置する。

```
[ 鴉 ] [ ECプラットフォーム ▼ ] [ + New ] [ ↑ Import ] [ ✎ Rename ] [ ↓ Export ] [ ✕ Delete ]
```

## アーキテクチャ図

```
ProjectModeApp
  └─ handleImportProject(file: File)
       ├─ file.arrayBuffer() → Uint8Array
       ├─ parseZipForImport(bytes)              ← utils/import-project-zip.ts
       │    ├─ unzipSync(bytes)                 ← fflate
       │    ├─ detectTopLevelDir()              ← 共通トップレベルを検出
       │    ├─ stripTopLevelDir()               ← プレフィックス除去
       │    ├─ filter allowed extensions
       │    └─ returns { files, detectedName? }
       ├─ name = detectedName ?? stripExt(file.name)
       ├─ disambiguateName(name, existingNames) ← utils/import-project-zip.ts
       └─ pm.createProject(finalName, files)    ← fs/project-manager.ts

ProjectSelector
  ├─ props: onImportProject: (file: File) => void
  ├─ <input type="file" accept=".zip" style="display:none" ref={importRef} />
  └─ <button onClick={importRef.current?.click()}>↑ Import</button>
```

## 未解決の問い

なし
