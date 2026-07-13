# X ローンチ投稿アセット — #1767

OSS ローンチ（[#1317](https://github.com/kompiro/karasu/issues/1317) Phase 3）の
X（Twitter）投稿用アセット。投稿本文の下書きと、添付する例＋生成図の画像を持つ。

> **投稿自体は人手で行う。** このディレクトリは下書きと画像を提供するだけで、
> X への投稿・任意の追加投稿先（HN 等）の実施可否は投稿者が判断する。

## 中身

| ファイル | 内容 |
| --- | --- |
| [`post.ja.md`](post.ja.md) | X 投稿の下書き（短縮版 / 長尺版）、画像の代替テキスト、任意の追加投稿先チェックリスト |
| [`assets/karasu-launch.png`](assets/karasu-launch.png) | 添付画像（1600×900）。karasu のエディタ画面を模し、左に `.krs`、右に生成された system view を並べる |
| `assets/system-view.svg` | 画像右側に埋め込む system view。`examples/ja/payment-platform`（dark テーマ）から `karasu render` 相当で生成 |
| `assets/payment-platform.excerpt.krs` | 画像左側に表示する `.krs` の抜粋（`examples/ja/payment-platform/system.krs` を短縮したもの。画像との唯一の真実） |
| `assets/crow.png` | タイトルバーの鴉アイコン（`packages/app/public/karasu-logo-1200w.png` からの切り出し） |
| [`generate.ts`](generate.ts) | 上記アセットから `karasu-launch.png` を再生成するスクリプト |

## なぜ payment-platform か

karasu の差別化点は「**論理構造と物理構造を分離**」して 1 つのテキストモデルから
複数ビューを生成すること。`payment-platform` は system / service / domain / usecase に
加えて `[external]` サービスと `deploy` ブロックを含み、この特徴を一枚で示せる。
投稿本文は日本語（Zenn 記事にリンク）のため、図も `examples/ja/...` の日本語ラベル版を使う。

エディタペインの配色は実物と一致させている（`packages/app/src/components/EditorPane.tsx`
の `karasu-dark` テーマ: keyword `#7dd3fc` / annotation `#fbbf24` / string `#86efac` /
operator `#f472b6`、エディタ背景 `#0f172a` は図の背景と同一）。

## 画像の再生成

```bash
# 1) system view の SVG を更新する場合（例を変えたとき）
#    examples/ja/payment-platform を dark テーマで system ビュー出力し
#    assets/system-view.svg に保存する（@import 行は style として解決）。

# 2) 合成画像を生成（Playwright の Chromium が必要。日本語描画に CJK フォントが要る）
#    例: Debian 系なら `sudo apt-get install -y fonts-noto-cjk`
pnpm --filter @karasu-tools/e2e exec tsx \
  "$(git rev-parse --show-toplevel)/docs/launch/1767-x-post/generate.ts"

# 3) レティナ出力を投稿用の 1600×900 に縮小
convert docs/launch/1767-x-post/assets/karasu-launch@2x.png \
  -resize 1600x900 docs/launch/1767-x-post/assets/karasu-launch.png
```

`payment-platform.excerpt.krs` を編集すると、次回生成時に画像の左ペインへ反映される。
