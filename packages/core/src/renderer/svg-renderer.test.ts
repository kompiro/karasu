import { describe, it, expect } from "vitest";
import { render } from "./svg-renderer.js";
import { resolveStyles } from "../resolver/style-resolver.js";
import { extractView } from "../view/view-extract.js";
import { Parser } from "../parser/parser.js";
import { StyleParser } from "../parser/style-parser.js";

function renderFromSource(krs: string, style?: string): string {
  const parseResult = Parser.parse(krs);
  const sheets = style ? [StyleParser.parse(style).value] : [];
  const styles = resolveStyles(parseResult.value.systems, sheets);
  const viewSlice = extractView(parseResult.value.systems, []);
  return render(viewSlice, styles);
}

describe("SVG Renderer", () => {
  it("renders empty system", () => {
    const svg = renderFromSource('system "Empty" {}');
    expect(svg).toContain("<svg");
    expect(svg).toContain("No nodes to render");
  });

  it("renders a single node", () => {
    const svg = renderFromSource(`
system "Test" {
  service ECommerce "ECサイト"
}
    `);
    expect(svg).toContain("<svg");
    expect(svg).toContain("ECサイト");
    expect(svg).toContain("<rect");
  });

  it("renders multiple nodes with edges", () => {
    const svg = renderFromSource(`
system "Test" {
  user Customer "顧客"
  service Shop "ショップ"
  Customer -> Shop "購入"
}
    `);
    expect(svg).toContain("顧客");
    expect(svg).toContain("ショップ");
    expect(svg).toContain("購入");
    expect(svg).toContain("<line");
    expect(svg).toContain("marker-end");
  });

  it("applies styles from stylesheet", () => {
    const svg = renderFromSource(
      `
system "Test" {
  service ECommerce "ECサイト" [external]
}
      `,
      `
[external] {
  border-style: dashed;
  background-color: #1F2937;
}
      `,
    );
    expect(svg).toContain("stroke-dasharray");
    expect(svg).toContain("#1F2937");
  });

  it("renders user shape", () => {
    const svg = renderFromSource(
      `
system "Test" {
  user Customer "顧客"
}
      `,
      `
user {
  shape: user;
}
      `,
    );
    expect(svg).toContain("<circle");
    expect(svg).toContain("<path");
  });

  it("renders badge for annotated nodes", () => {
    const svg = renderFromSource(
      `
system "Test" {
  service Legacy "旧" @deprecated
}
      `,
      `
@deprecated {
  badge-color: #EF4444;
  badge-icon: "⚠";
  badge-label: "非推奨";
  opacity: 0.6;
}
      `,
    );
    expect(svg).toContain("#EF4444");
    expect(svg).toContain("非推奨");
    expect(svg).toContain('opacity="0.6"');
  });

  it("renders async edges as dashed", () => {
    const svg = renderFromSource(`
system "Test" {
  service A "A"
  service B "B"
  A --> B "非同期"
}
    `);
    expect(svg).toContain("stroke-dasharray");
    expect(svg).toContain("非同期");
  });

  it("renders description text", () => {
    const svg = renderFromSource(`
system "Test" {
  service ECommerce "ECサイト" "商品管理と注文処理"
}
    `);
    expect(svg).toContain("商品管理と注文処理");
  });

  it("renders system label", () => {
    const svg = renderFromSource(`
system "ECプラットフォーム" {
  service ECommerce "EC"
}
    `);
    expect(svg).toContain("ECプラットフォーム");
  });

  it("renders role text on user node", () => {
    const svg = renderFromSource(`
system "Test" {
  user Admin "管理者" "システムを運用する" [human] {
    role "システム管理者"
  }
}
    `);
    expect(svg).toContain("管理者");
    expect(svg).toContain("システムを運用する");
    expect(svg).toContain("システム管理者");
    expect(svg).toContain('font-style="italic"');
  });
});
