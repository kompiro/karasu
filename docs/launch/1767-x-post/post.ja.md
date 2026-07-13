# X (Twitter) ローンチ投稿ドラフト — #1767

長文アナウンス（Zenn / #1765）にリンクする短い X 投稿と、`.krs` の例と生成図を
並べた画像を添付する。**投稿自体は人手で行う**（本リポジトリは下書きと画像のみを提供）。

- 長文記事（JA / Zenn）: https://zenn.dev/kompiro/articles/f5540c537f5277
- 長文記事（EN / dev.to、参考）: https://dev.to/kompiro/introducing-karasu-a-text-based-system-architecture-modeling-language-11cd
- 親 Issue: #1317（Phase 3 hard launch） / この Issue: #1767

---

## 添付画像

`assets/karasu-launch.png`（1600×900）を添付する。

**画像の代替テキスト（X の「説明を追加」に貼る / アクセシビリティ）:**

> karasu のエディタ画面。左に `.krs` のコード（決済プラットフォームの system / service /
> domain 定義）、右にそこから自動生成されたシステム構成図。テキストで書いたモデルから
> 論理ビューが生成される様子を示している。

---

## 本文（そのまま投稿できる短縮版・約 110 文字）

```
テキストでアーキテクチャを書く OSS「karasu（鴉）」を公開しました 🐦‍⬛
.krs で書くと、論理ビューと物理（deploy）ビューが同じモデルから生成されます。
👇 紹介記事
https://zenn.dev/kompiro/articles/f5540c537f5277
```

> URL は X 上で 23 文字換算。上記は非課金アカウントの 140 文字制限に収まる。

## 本文（長尺版・X Premium もしくはスレッド 1 投稿目）

```
テキストでシステムアーキテクチャを書く OSS「karasu（鴉）」を公開しました 🐦‍⬛

C4 Model に着想を得つつ、論理構造と物理構造を分離して表現するのが特徴です。
.krs に system / service / domain / usecase を書くと、
・システム構成図（論理ビュー）
・デプロイ図（物理ビュー）
・チーム所有図（org ビュー）
が同じ 1 つのモデルから生成されます。ブラウザ / VS Code / CLI で動きます。

紹介記事 👇
https://zenn.dev/kompiro/articles/f5540c537f5277

#OSS #アーキテクチャ #TypeScript
```

> スレッド 2 投稿目の候補: アプリを今すぐ試せるリンク（https://karasu.pages.dev/）や
> deploy / org ビューの画像を足す。

---

## 任意の追加投稿先（人手判断・デフォルトは見送り）

Issue #1767 の受け入れ条件は「X 投稿を公開／任意の投稿先は実施または明示的に見送り」。
以下はいずれも**任意**。実施するかは投稿者が判断する。

- [ ] Hacker News（Show HN）— 例: `Show HN: karasu – a text-based system architecture modeling language`
- [ ] /r/programming
- [ ] lobste.rs

> 判断メモ: まずは X + 長文記事で反応を見て、必要なら後日 Show HN 等を追う運用でよい。
> 見送る場合は Issue にその旨を残してクローズする。

---

## 画像の再生成

`assets/` の生成手順は [`README.md`](README.md) を参照。
