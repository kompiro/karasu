import type { ResolvedNodeStyle, ShapeKind } from "../types/style.js";

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderShape(
  x: number,
  y: number,
  width: number,
  height: number,
  style: ResolvedNodeStyle
): string {
  const shape = typeof style.shape === "string" ? style.shape : "box";
  const fill = escapeXml(style.backgroundColor);
  const stroke = escapeXml(style.borderColor);
  const strokeWidth = style.borderWidth;
  const strokeDash =
    style.borderStyle === "dashed"
      ? ' stroke-dasharray="8 4"'
      : style.borderStyle === "dotted"
        ? ' stroke-dasharray="2 2"'
        : "";

  switch (shape) {
    case "box":
      return renderBox(x, y, width, height, fill, stroke, strokeWidth, strokeDash, style.borderRadius);
    case "person":
      return renderPerson(x, y, width, height, fill, stroke, strokeWidth, strokeDash);
    case "cylinder":
      return renderCylinder(x, y, width, height, fill, stroke, strokeWidth, strokeDash);
    case "queue":
      return renderQueue(x, y, width, height, fill, stroke, strokeWidth, strokeDash);
    case "hexagon":
      return renderHexagon(x, y, width, height, fill, stroke, strokeWidth, strokeDash);
    case "cloud":
      return renderCloud(x, y, width, height, fill, stroke, strokeWidth, strokeDash);
    default:
      return renderBox(x, y, width, height, fill, stroke, strokeWidth, strokeDash, style.borderRadius);
  }
}

function renderBox(
  x: number, y: number, w: number, h: number,
  fill: string, stroke: string, sw: number, dash: string, radius: number
): string {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${radius}" ry="${radius}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"${dash}/>`;
}

function renderPerson(
  x: number, y: number, w: number, h: number,
  fill: string, stroke: string, sw: number, dash: string
): string {
  const cx = x + w / 2;
  const headR = Math.min(w, h) * 0.13;
  const headCy = y + headR + 2;
  const gap = 3;
  const shoulderTop = headCy + headR + gap;
  const bodyBottom = y + h;
  const shoulderW = w * 0.45;
  const torsoW = w * 0.7;
  const shoulderH = (bodyBottom - shoulderTop) * 0.25;
  const torsoTop = shoulderTop + shoulderH;
  const cornerR = 4;

  // Single outline: shoulder trapezoid flowing into torso with rounded bottom
  const bodyPath = [
    `M${cx - shoulderW / 2} ${shoulderTop}`,
    `L${cx + shoulderW / 2} ${shoulderTop}`,
    `L${cx + torsoW / 2} ${torsoTop}`,
    `L${cx + torsoW / 2} ${bodyBottom - cornerR}`,
    `Q${cx + torsoW / 2} ${bodyBottom} ${cx + torsoW / 2 - cornerR} ${bodyBottom}`,
    `L${cx - torsoW / 2 + cornerR} ${bodyBottom}`,
    `Q${cx - torsoW / 2} ${bodyBottom} ${cx - torsoW / 2} ${bodyBottom - cornerR}`,
    `L${cx - torsoW / 2} ${torsoTop}`,
    `Z`,
  ].join(" ");

  return [
    `<circle cx="${cx}" cy="${headCy}" r="${headR}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"${dash}/>`,
    `<path d="${bodyPath}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"${dash}/>`,
  ].join("\n");
}

function renderCylinder(
  x: number, y: number, w: number, h: number,
  fill: string, stroke: string, sw: number, dash: string
): string {
  const ry = Math.min(h * 0.12, 15);
  const bodyH = h - ry * 2;

  return [
    `<path d="M${x} ${y + ry} L${x} ${y + ry + bodyH} A${w / 2} ${ry} 0 0 0 ${x + w} ${y + ry + bodyH} L${x + w} ${y + ry} A${w / 2} ${ry} 0 0 1 ${x} ${y + ry}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"${dash}/>`,
    `<ellipse cx="${x + w / 2}" cy="${y + ry}" rx="${w / 2}" ry="${ry}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"${dash}/>`,
  ].join("\n");
}

function renderQueue(
  x: number, y: number, w: number, h: number,
  fill: string, stroke: string, sw: number, dash: string
): string {
  const rx = Math.min(w * 0.1, 15);
  const bodyW = w - rx * 2;

  return [
    `<path d="M${x + rx} ${y} L${x + rx + bodyW} ${y} A${rx} ${h / 2} 0 0 1 ${x + rx + bodyW} ${y + h} L${x + rx} ${y + h} A${rx} ${h / 2} 0 0 0 ${x + rx} ${y}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"${dash}/>`,
    `<ellipse cx="${x + rx + bodyW}" cy="${y + h / 2}" rx="${rx}" ry="${h / 2}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"${dash}/>`,
  ].join("\n");
}

function renderHexagon(
  x: number, y: number, w: number, h: number,
  fill: string, stroke: string, sw: number, dash: string
): string {
  const inset = w * 0.2;
  const points = [
    `${x + inset},${y}`,
    `${x + w - inset},${y}`,
    `${x + w},${y + h / 2}`,
    `${x + w - inset},${y + h}`,
    `${x + inset},${y + h}`,
    `${x},${y + h / 2}`,
  ].join(" ");
  return `<polygon points="${points}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"${dash}/>`;
}

function renderCloud(
  x: number, y: number, w: number, h: number,
  fill: string, stroke: string, sw: number, dash: string
): string {
  // Simplified cloud shape using bezier curves
  const cx = x + w / 2;
  const cy = y + h / 2;
  const rx = w / 2;
  const ry = h / 2;

  const path = [
    `M${x + rx * 0.3} ${cy + ry * 0.3}`,
    `C${x - rx * 0.1} ${cy + ry * 0.8}, ${x + rx * 0.1} ${cy + ry}, ${cx} ${cy + ry * 0.7}`,
    `C${cx + rx * 0.3} ${cy + ry}, ${x + w + rx * 0.1} ${cy + ry * 0.6}, ${x + w - rx * 0.2} ${cy}`,
    `C${x + w + rx * 0.1} ${cy - ry * 0.5}, ${cx + rx * 0.5} ${cy - ry}, ${cx} ${cy - ry * 0.7}`,
    `C${cx - rx * 0.3} ${cy - ry * 0.9}, ${x - rx * 0.1} ${cy - ry * 0.3}, ${x + rx * 0.3} ${cy + ry * 0.3}`,
    `Z`,
  ].join(" ");

  return `<path d="${path}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"${dash}/>`;
}
