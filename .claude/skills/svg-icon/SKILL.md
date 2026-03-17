---
name: svg-icon
description: >
  Design and create SVG icons for the karasu architecture modeling tool.
  Trigger when the user says: "アイコンを作って", "SVGアイコン", "アイコンデザイン",
  "design icon", "create svg icon", or similar phrases requesting SVG icon creation.
---

# SVG Icon Design Skill

karasu プロジェクト用の SVG アイコンをデザイン・作成する。

## 前提

- アイコンは `packages/core/` のレンダラーで使用される想定
- SVG は手書きで最適化し、不要な属性やメタデータを含めない
- 視認性を最優先とし、パスの簡潔さよりも見た目の明瞭さを重視する

## デザイン原則

1. **視認性（最優先）**: 小さいサイズ（16x16〜48x48）でも判別できる明瞭な形状。パスが複雑になっても視認性を優先する
2. **一貫性**: 既存アイコンがあればそのスタイル（線幅・角丸・塗り方）に合わせる
3. **モノクロ対応**: 色なしでも意味が伝わる形状にする（色は `fill="currentColor"` や CSS で制御）
4. **適度な詳細**: 意味を明確に伝えるために必要な詳細は積極的に加える。過度な簡略化よりも認識しやすさを優先

## 手順

1. ユーザーにどのようなアイコンが必要か確認する（用途・モチーフ・サイズ）
2. 既存のアイコンがあれば確認してスタイルを合わせる
3. SVG コードを作成する
4. 以下の最適化チェックを行う：
   - viewBox が適切に設定されているか
   - 不要な `xmlns` 以外の名前空間がないか
   - 不要な小数点以下の桁数が削減されているか（パスの複雑さ自体は視認性のために許容）
   - `fill="currentColor"` または適切なスタイル制御が使われているか
5. ユーザーに SVG コードを提示し、必要に応じて調整する

## SVG テンプレート

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <!-- icon paths here -->
</svg>
```

## 出力ルール

- viewBox のサイズはデフォルト `0 0 24 24`（ユーザー指定があればそれに従う）
- `width` / `height` 属性を明示する
- インラインスタイルではなく属性でスタイルを指定する
- コメントでアイコンの意図を簡潔に記載する
- ファイルに保存する場合は適切なディレクトリをユーザーに確認する
