// SPIKE #2823: build the before/after report.
// Run: pnpm exec tsx reports/2823-ghost-band/build.mts <beforeDir> <afterDir> <fixturePrefixBefore> <fixturePrefixAfter>
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pair, reportFragment, reportPage, escapeHtml } from "../../scripts/report/index.ts";

const [beforeDir, afterDir, fxBefore, fxAfter] = process.argv.slice(2) as [string, string, string, string];
const read = (p: string) => readFileSync(p, "utf8");
type Row = { id: string; corpus: string; kind: string; path: string; ghosts: number; edges: number; w: number; h: number; inBand: boolean };
const before: Row[] = JSON.parse(read(join(beforeDir, "survey.json")));
const after = new Map((JSON.parse(read(join(afterDir, "survey.json"))) as Row[]).map((r) => [r.id, r]));
const ratio = (r: Row) => (r.w / r.h).toFixed(2);

const view = (id: string, caption: string) =>
  pair(
    { label: "before (main)", svg: read(join(beforeDir, `${id}.svg`)) },
    { label: "after (spike)", svg: read(join(afterDir, `${id}.svg`)) },
    caption,
  );

const worst = [...before].sort((a, b) => b.w / b.h - a.w / a.h).slice(0, 15);
const table = `<table>
<thead><tr><th>ビュー</th><th>ghost</th><th>before</th><th>after</th></tr></thead>
<tbody>${worst
  .map((r) => {
    const a = after.get(r.id)!;
    return `<tr><td>${escapeHtml(`${r.corpus} ${r.path}`)}</td><td>${r.ghosts}</td><td>${r.w} × ${r.h}（${ratio(r)}）</td><td>${a.w} × ${a.h}（${ratio(a)}）${a.inBand ? "" : " ⚠"}</td></tr>`;
  })
  .join("\n")}</tbody></table>`;
const outBefore = before.filter((r) => !r.inBand).length;
const outAfter = [...after.values()].filter((r) => !r.inBand);

const options = {
  title: "ghost band spike",
  lang: "ja",
  subtitle: "外部ドメインごとの枠・向きで上下・幅予算で折り返し（design PR #3842 のスライス A）",
  meta: ["spike/2823-ghost-band-frames", "Issue #2823", "PR #3842"],
  sections: [
    {
      title: "この spike で作ったもの",
      body: `<ul>
<li>ghost を「外部ドメイン × 帯の側」でまとめ、2 件以上なら muted の枠に入れる（枠のタイトルがドメイン名、中のカードの subLabel は消える）。1 件だけなら今と同じ subLabel 付きのカード。</li>
<li>incoming（相手が自ドメインを参照）が多い ghost は焦点の枠の上、outgoing が多いか同数なら下。</li>
<li>帯は <code>max(幅予算, 焦点の枠の幅)</code> で折り返し、枠もカードも相手の x の平均で並べる。</li>
<li><b>線はスライス A のまま直線</b>（routing chain に通すのはスライス B）。上の帯から来る線が焦点の枠のタイトルや他の枠を横切るのはそのため。</li>
<li>帯の枠は既存の ghost 祖先の枠（<code>ghost: true</code>）として描いている。design の <code>ghostBand</code> 印・専用の描画分岐は spike では作っていない。</li>
</ul>`,
    },
    {
      title: "合成モデル：エンティティビュー（Shop › Commerce › Ordering）",
      body: view0(),
    },
    {
      title: "合成モデル：service ビューの ghost domain（Shop › Commerce）",
      body: pair(
        { label: "before (main)", svg: read(`${fxBefore}.service.svg`) },
        { label: "after (spike)", svg: read(`${fxAfter}.service.svg`) },
        "ghost domain は外部 service ごとの枠になる。Finance（Billing / Ledger）は Commerce を参照するので上、Fulfillment（Shipping / Warehouse）は Commerce が参照するので下。Growth は Marketing の 1 件だけなので枠を作らず「(Growth)」の subLabel 付きカード。",
      ),
    },
    {
      title: "Dify：IdentityAccess（ghost 101 件）",
      body: view(
        "dify.entity.Dify.ApiBackend.IdentityAccess",
        "ほぼ全部が IdentityAccess を参照する側なので上の帯に積まれる。帯の枠は 16 個、単独カードが数枚。ハブ（Tenant / Account）に線が集まる密度は #3804。",
      ),
    },
    {
      title: "Dify：Workflow（両方向の ghost を含む）",
      body: view("dify.entity.Dify.ApiBackend.Workflow", "上の帯に 1 件、下の帯に 3 件の両方向 ghost がある。"),
    },
    {
      title: "Twenty：Files（ghost 10 件でも 5.2 : 1 だったビュー）",
      body: view("twenty-krs.entity.Twenty.TwentyServer.Files", ""),
    },
    {
      title: "3 モデルの縦横比",
      body: `<p>ghost を持つビュー ${before.length} 件のうち、縦横比が 16:9〜9:16 の外にあるもの：before ${outBefore} 件 → after ${outAfter.length} 件${outAfter.length ? `（${outAfter.map((r) => `${escapeHtml(r.path)} ${ratio(r)}`).join(", ")}。折り返しが起きない 1 段の帯で、1.78 は 16:9 の 1.778 をわずかに超えただけ）` : ""}。</p>
<p>before で最も横長の 15 件：</p>${table}`,
    },
  ],
};

function view0() {
  return pair(
    { label: "before (main)", svg: read(`${fxBefore}.entity.svg`) },
    { label: "after (spike)", svg: read(`${fxAfter}.entity.svg`) },
    "上の帯：Billing の枠（Invoice / Payment / Refund → Order）、Marketing の枠（Coupon / Campaign → Cart）、単独カードの Shipment (Shipping) と Points (Loyalty)。Points は Order・Cart を参照し（2 本）、Order から参照される（1 本）両方向の ghost で、incoming が多いので上。下の帯：Customers の枠（Customer / Address / Wishlist）、Catalog の枠（Product / Price / SKU）、単独カードの Carrier (Shipping)。Shipping は上下に 1 件ずつなので枠を作らずカード 2 枚。Wishlist は Cart と 1 本ずつの両方向で同数なので下。",
  );
}

writeFileSync(new URL("./index.html", import.meta.url), reportPage(options));
writeFileSync(new URL("./artifact.html", import.meta.url), reportFragment(options));
console.log("ok");
