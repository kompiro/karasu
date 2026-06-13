---
id: TPL-20260510-17
title: "外部から来る input は trust boundary を越える前に validate / canonicalize する"
status: active
date: 2026-05-10
applicable_to:
  - "HTTP / WebSocket / IPC / CLI 引数 / VS Code message など、外部から渡される値を受け取る handler"
  - "受け取った値で path / URL / SQL / shell command / serialized 文字列を組み立てる箇所"
  - "ファイルシステム参照 / ネットワーク参照 / プロセス起動 など system resource にアクセスする経路"
known_consumers:
  - karasu-serve
  - vscode-extension
  - project-zip-import
  - link-property-rendering
related_to: []
discovered_from:
  - issue: "#168"
  - root_cause_file: "packages/cli/src/serve.ts:41"
  - issue: "#1526"
  - issue: "#1527"
  - root_cause_file: "packages/app/src/utils/import-project-zip.ts"
  - issue: "#1525"
  - root_cause_file: "packages/core/src/parser/parser.ts"
topic: cli
scope:
  packages:
    - cli
    - vscode
    - app
    - core
---

# TPL-20260510-17: 外部から来る input は trust boundary を越える前に validate / canonicalize する

## 観点

karasu の `karasu serve` のような HTTP API、VS Code 拡張の message handler、CLI 引数など、**信頼境界（trust boundary）の外から渡される値** を path / URL / shell command / DB クエリの組み立てにそのまま使うと、**path traversal / injection / SSRF などの古典的な脆弱性** に直結する。

「内部実装の都合上 path がそのまま使える形になっている」「`.krs` 拡張子を後付けするから traversal は限定的」のような **副次的緩和** を理由に validation を省くと、後で実装が変わったときに脆弱性が顕在化する。**validation は payload の意味（path らしい / id らしい）に依らず、trust boundary を越える時点で機械的に行う** のが原則。

#168 では `GET /api/file/:name` の `name` が `join(dir, name + ".krs")` にそのまま渡され、`../../etc/passwd` のような入力が外側のディレクトリに resolve できる構造になっていた。`.krs` 拡張子付与により実害は限定的だったが、validation の不在自体が security smell。修正は `resolve` してから `startsWith(safeDir + sep)` で外に出ないことを確認する形（`packages/cli/src/serve.ts:41` の現在の実装）。

#1526 / #1527 で同じ観点が **app の ZIP インポート** で再観測された。アップロードされた `.zip` も trust boundary の外の input である。エントリ名（`../../x.krs` / 絶対パス / バックスラッシュ）を `/projects/<id>/<path>` にそのまま書くと、in-memory provider の `normalizePath` が `..` を畳んでプロジェクト外へ脱出する（zip-slip）。さらに **アーカイブは「巨大入力」の一形態**であり、`unzipSync` が全エントリをメモリ展開する前に **エントリ名のサニタイズ** と **解凍前のサイズ/件数キャップ**（解凍爆弾対策）を境界で機械的に行う必要がある（`packages/app/src/utils/import-project-zip.ts`）。

#1525 では **ユーザー由来の URL を `<a href>` に描画する経路** で同じ観点が再観測された。`.krs` の `link` URL がスキーム未検証のまま app / VS Code webview の `href` に渡っており、`javascript:` URL がクリックで実行可能だった（React は javascript: href をブロックしない。dev 警告のみ）。修正は **パース時にスキーム allowlist（http/https/mailto）で警告を出すが link は AST に保持し（Format でユーザーのソースを消さない）、`<a href>` を出す各レンダラー（app の detail panel / VS Code webview の host 側）で `isSafeLinkUrl` フィルタを掛けて除外する**（`packages/core/src/parser/link-url.ts`）。「parse で落とす」とソースが消える破壊的編集になるため、**サニタイズは「描画の境界」で行い、モデルは faithful に保つ**のが定石。

## 想定される失敗モード

- Path traversal / directory escape（`../`, `..\\`, URL-encoded 変種）
- Symlink 経由の境界突破（string-level の `startsWith` チェックは symlink を解決しないので、symlink 越しに外を指される）
- shell / SQL injection（`exec(\`cmd ${userInput}\`)` 系）
- SSRF（`fetch(userProvidedUrl)` の host 検証なし）
- prototype pollution / deserialization 攻撃（`JSON.parse` した object をそのまま deep-merge する等）

これらは **「機能が壊れる」形では観測されない**。攻撃者が見つけるか、security review で見つけるしか発見経路がない。

## チェックリスト

外部入力を受け取る handler を実装・修正するとき、以下を確認する:

- [ ] **trust boundary（HTTP/IPC/CLI/message handler の入口）** を明示的に意識し、入力を「未検証 (tainted)」として扱っているか
- [ ] path を組み立てる場合、`resolve()` で正規化したうえで **`startsWith(safeDir + sep)`** など bounds check を入れているか。**符号化バリエーション**（URL-encoded `../`, NUL バイト, Windows separator）も拒否されるか
- [ ] symlink / hardlink によるバイパスの可能性が評価されているか。strict が必要なら `realpath` を取って再検証するか、symlinks 自体を禁止する
- [ ] shell / SQL / serialized 文字列を組み立てる場合、**string interpolation ではなく parameterized API** を使っているか（`spawn(cmd, args[])` / prepared statement）
- [ ] 拒否時の挙動（404 / null 返却 / error throw）が **副作用を起こさず明確** か。silently 別のものを返さないか
- [ ] ユーザー由来の URL を `href` / `window.open` / `src` に渡す場合、**スキーム allowlist**（http / https / mailto）を通しているか。escape（XSS 対策のエンコード）はスキームを検証しない別物であり、`javascript:` / `data:` URL は escape を素通りする。WHATWG `new URL()` でパースすればブラウザの href 解釈（大文字小文字・タブ/改行除去）と一致した判定になる
- [ ] negative test（traversal 試行 / injection 試行 / null byte / 巨大入力）が回帰テストに **必ず 1 件** 含まれているか

## 既知の対処パターン

- `resolve(dir)` で base を canonicalize → `join(safeDir, name)` で resolve → `startsWith(safeDir + sep)` で範囲確認、の三段で path 系の trust boundary をガードする（#168 の修正パターン）
- shell command は `child_process.spawn(cmd, [args])` のように **command と args を分離**、`exec` のような string interpolation を使わない
- HTTP handler は **入力 schema validator**（zod 等）を境界で挟む。schema を通らない入力は handler 本体に届かない構造を維持
- 仕様書 / OpenAPI / API doc に **「trust boundary はここ」** を明示する。consumer 側が「ここから先は信用できる値」を理解できる
- security review チェックリストに「新しい handler は negative test を持っているか」を加え、PR レビュー時に機械的に確認
- **アーカイブ（ZIP 等）を取り込む経路** では、(1) 各エントリ名を「相対・`..` を含まない・絶対でない・バックスラッシュを含まない」と検証してから書き込み先を組み立て、(2) **解凍前に** ヘッダの uncompressed size とエントリ数で per-file / total / count キャップを当てて解凍爆弾を弾く（fflate なら `unzipSync(data, { filter })` で展開前に判定できる）。`#1526` / `#1527` の実装パターン

## 派生元 spec

- `docs/spec/syntax.md` — Node Properties 節の link URL スキーム制約（#1525 で追記。`link-url-scheme-not-allowed` 警告の規定）

## 関連テスト

- `packages/cli/src/serve.test.ts`（path traversal の negative test を含む）
- `packages/app/src/utils/import-project-zip.test.ts`（zip-slip / 解凍爆弾・エントリ数キャップの negative test を含む — #1526 / #1527）
- `packages/core/src/parser/parser.test.ts`（link URL scheme allowlist の negative test — #1525）
