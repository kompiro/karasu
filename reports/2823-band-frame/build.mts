// SPIKE #2823: build the band-frame look comparison report.
// Run: pnpm exec tsx reports/2823-band-frame/build.mts <svgDir>
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pair, reportFragment, reportPage } from "../../scripts/report/index.ts";
const dir = process.argv[2]!;
const svg = (v: string, th: string, view: string) => readFileSync(join(dir, `${v}-${th}.${view}.svg`), "utf8");
const bg = (th: string) => (th === "light" ? "light" : "dark") as "light" | "dark";
const options = {
  title: "ghost band frame looks",
  lang: "ja",
  subtitle: "帯の枠を Design Doc どおり ghost: false と専用の描画分岐で描いた spike（PR #3882 For Reviewers 1）",
  meta: ["spike/2823-band-frame-drawing", "Issue #2823", "PR #3882"],
  sections: [
    {
      title: "分かったこと",
      body: `<ul>
<li><b>A</b>（PR #3882 のまま: <code>ghost: true</code> + <code>ghostBand</code>、ghost の祖先の枠と同じ描画）と <b>B</b>（Design Doc どおり: <code>ghost: false</code> + <code>ghostBand</code>、<code>containerStyleOf</code> を通さない専用の分岐で「ghost system の枠と同じ muted の枠」を描く）は、ダーク・ライトとも <b>ピクセル単位で同じ</b>だった（差分 0）。Design Doc が指定した見た目がいまの描画と同じなので、分岐を分けただけでは見た目は変わらない。</li>
<li>専用の分岐を持つと、帯の枠にだけ別の見た目を与えられる。<b>C</b> はその一例で、枠全体を薄くせず、破線と <code>textMuted</code> のタイトルをそのままの濃さで描き、枠の中にごく薄い地を敷いた。中の ghost のカードと線は今と同じ muted のまま。外部ドメインの名前が読めるようになる。</li>
<li>B / C の代わりに要るもの: <code>ghost: false</code> の帯の枠を「焦点の枠」と取り違えないよう、<code>containers.find((c) =&gt; !c.ghost)</code> の 5 か所（layout-edges 3・ghost-layout 1・ghost-band 1）を帯の枠を除く形にする必要がある（spike では帯の枠が焦点の枠より後ろに積まれるので今は当たらない）。draw.io の書き出しも帯の枠を ghost として扱う分岐が要る（spike で足した）。</li>
</ul>`,
    },
    ...(["dark", "light"] as const).map((th) => ({
      title: `合成モデルのエンティティビュー（${th}）: A と C`,
      body: pair(
        { label: "A / B（PR のまま。B は同じ）", svg: svg("A", th, "fixture-entity"), background: bg(th) },
        { label: "C（専用の分岐で、タイトルを読める濃さに）", svg: svg("C", th, "fixture-entity"), background: bg(th) },
      ),
    })),
    {
      title: "合成モデルの service ビュー（dark）: A と C",
      body: pair(
        { label: "A / B", svg: svg("A", "dark", "fixture-service"), background: "dark" },
        { label: "C", svg: svg("C", "dark", "fixture-service"), background: "dark" },
      ),
    },
    {
      title: "Dify IdentityAccess（dark）: A と C",
      body: pair(
        { label: "A / B", svg: svg("A", "dark", "dify-identity"), background: "dark" },
        { label: "C", svg: svg("C", "dark", "dify-identity"), background: "dark" },
        "16 個の外部ドメインの枠。C ではドメイン名を拡大せずに読める。",
      ),
    },
  ],
};
writeFileSync(new URL("./index.html", import.meta.url), reportPage(options));
writeFileSync(new URL("./artifact.html", import.meta.url), reportFragment(options));
console.log("ok");
