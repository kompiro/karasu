---
type: tooling
---

# AT: spike の PoC レポートを private な Claude Artifact として publish する（#2436）

- **日付**: 2026-08-19
- **関連 Issue**: [#2436](https://github.com/kompiro/karasu/issues/2436)
- **Related TPLs**: [TPL-2254](../test-perspectives/TPL-2254-durable-record-points-at-durable-address.md)（記録は、記録より長生きするアドレスを指す）
- **対象ファイル**:
  - `scripts/report/html.ts`（`reportFragment` / `reportContent`）
  - `scripts/report/demo.ts`（`index.html` と `artifact.html` を両方書く）
  - `reports/README.md` / `docs/process.md`（レポートの読み方）

> spike のレポートは preview URL からも CI からも取り出せず、読むには当人が checkout するしかなかった。読み手は回した本人ひとりなので、配信経路を repo の恒久設定や CI に作らず、publish 用の形（document の骨格を持たない HTML）を生成器が書き、それを private な Artifact として読む。

## 受け入れ条件

### AC-1: 生成物がそのまま publish できる

- [x] AT-A: publish 用の形に `<!doctype>` / `<html>` / `<head>` / `<body>` が含まれない（host 側の骨格と二重にならない）

  > ✅ Automated — `scripts/report/html.test.ts` › reportFragment › carries no document skeleton for the host's to nest inside

- [x] AT-B: 先頭が `<title>` で、タイトルがエスケープされている（host はファイルの先頭からしか title を読まない）

  > ✅ Automated — `scripts/report/html.test.ts` › reportFragment › opens with the title, which the host reads from the head of the file

- [x] AT-C: 自己完結している（外部 stylesheet / script / 画像を参照せず、スタイルはインライン、`dataUri()` の画像はそのまま残る）。publish 先は外部ホストへの通信を一切許さないので、これが表示可否をそのまま決める

  > ✅ Automated — `scripts/report/html.test.ts` › reportFragment › is self-contained — inline styles, no external stylesheet, script, or image

- [x] AT-D: 見出し・provenance の pill・各セクションの中身が完全版と同じである（骨格の有無だけが差分）

  > ✅ Automated — `scripts/report/html.test.ts` › reportFragment › shows the same header and sections as the full document

### AC-2: file:// で開く従来の経路が壊れていない

- [x] AT-E: `reportPage()` は従来どおり `<!doctype html>` から始まる完全な document を返し、自己完結している

  > ✅ Automated — `scripts/report/html.test.ts` › reportPage › is a complete document with the title escaped ／ is self-contained — no external stylesheet, script, or image

- [x] AT-F: セクションのアンカー付与（重複見出しの positional fallback、ASCII を持たない見出しの fallback、明示 `id`）が変わらない

  > ✅ Automated — `scripts/report/html.test.ts` › reportPage › emits every section body, untitled ones without a heading ／ falls back to a positional anchor when the heading has no ascii ／ does not repeat an anchor when two sections share a heading

### AC-3: publish 用の形も mainline に紛れ込まない

- [x] AT-G: `reports/<topic>/artifact.html` が gitignore される（追跡されるのは `reports/README.md` だけという線が、出力が 2 つになっても保たれる）

  > ✅ Automated — `scripts/report/gitignore.test.ts` › reports/ gitignore rule › ignores generated output at reports/demo/artifact.html

### 手動確認

- [ ] M-1: `pnpm report:demo` を実行すると `reports/demo/index.html` と `reports/demo/artifact.html` の両方が書かれ、後者を Claude Artifact として publish するとレポートがブラウザで読める（ヘッダ・before/after の 2 カラム・スタイルが崩れていない）
- [ ] M-2: `pnpm report:demo --screenshot` で生成したレポートを publish すると、data URI で埋め込んだ PNG が表示される
- [ ] M-3: publish された Artifact が既定で private である（共有は明示的に選んだときだけ起きる）
- [ ] M-4: `reports/demo/index.html` をブラウザで file:// から開くと、従来どおり表示される
