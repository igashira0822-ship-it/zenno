import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { Resvg } from "@resvg/resvg-js";

// OGP画像(1200x630 PNG)を API不要で生成する（核4: 量産の最後の1マイル）。
// satori のフォント埋め込みを避け、自前SVGテンプレ + resvg のシステムフォント描画で
// 日本語を確実に出す（Windows同梱の Yu Gothic / Meiryo を使う）。

const W = 1200;
const H = 630;

type Theme = { bg1: string; bg2: string; fg: string; sub: string; accent: string };
const THEMES: Record<string, Theme> = {
  blue: { bg1: "#0f172a", bg2: "#1e3a8a", fg: "#ffffff", sub: "#cbd5e1", accent: "#38bdf8" },
  green: { bg1: "#052e16", bg2: "#166534", fg: "#ffffff", sub: "#dcfce7", accent: "#4ade80" },
  orange: { bg1: "#431407", bg2: "#9a3412", fg: "#ffffff", sub: "#ffedd5", accent: "#fb923c" },
  dark: { bg1: "#111113", bg2: "#27272a", fg: "#ffffff", sub: "#a1a1aa", accent: "#e4e4e7" },
};

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// 全角≒1.0 / 半角≒0.5 で幅を数え、maxUnits ごとに改行（簡易折返し）。
function wrap(text: string, maxUnits: number, maxLines: number): string[] {
  const lines: string[] = [];
  let cur = "";
  let units = 0;
  for (const ch of text) {
    if (ch === "\n") {
      lines.push(cur);
      cur = "";
      units = 0;
      if (lines.length >= maxLines) break;
      continue;
    }
    const w = ch.charCodeAt(0) > 0xff ? 1 : 0.5;
    if (units + w > maxUnits) {
      lines.push(cur);
      if (lines.length >= maxLines) {
        cur = "";
        break;
      }
      cur = ch;
      units = w;
    } else {
      cur += ch;
      units += w;
    }
  }
  if (cur && lines.length < maxLines) lines.push(cur);
  return lines;
}

export type OgOptions = {
  title: string;
  subtitle?: string;
  badge?: string;
  theme?: keyof typeof THEMES;
  out?: string;
};

const FONT = "Yu Gothic, Meiryo, sans-serif";

function buildSvg(o: OgOptions): string {
  const t = THEMES[o.theme ?? "blue"] ?? THEMES.blue;
  const fontSize = 72;
  const lineH = Math.round(fontSize * 1.3);
  const titleLines = wrap(o.title, 14, 4);
  const blockH = titleLines.length * lineH;
  const startY = Math.round(H / 2 - blockH / 2 + fontSize * 0.8);
  const titleTspans = titleLines
    .map((ln, i) => `<tspan x="80" y="${startY + i * lineH}">${esc(ln)}</tspan>`)
    .join("");

  const badge = o.badge
    ? `<rect x="80" y="74" rx="10" ry="10" width="${Math.min(640, 48 + o.badge.length * 26)}" height="58" fill="${t.accent}" opacity="0.18"/>
  <text x="106" y="113" font-family="${FONT}" font-size="32" font-weight="700" fill="${t.accent}">${esc(o.badge)}</text>`
    : "";

  const subtitle = o.subtitle
    ? `<text x="80" y="${H - 64}" font-family="${FONT}" font-size="34" fill="${t.sub}">${esc(wrap(o.subtitle, 30, 1)[0] ?? "")}</text>`
    : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${t.bg1}"/>
      <stop offset="1" stop-color="${t.bg2}"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect x="0" y="0" width="14" height="${H}" fill="${t.accent}"/>
  ${badge}
  <text font-family="${FONT}" font-size="${fontSize}" font-weight="800" fill="${t.fg}">${titleTspans}</text>
  ${subtitle}
</svg>`;
}

export function generateOgImage(o: OgOptions): { ok: boolean; message: string; path?: string } {
  if (!o.title?.trim()) return { ok: false, message: "title は必須です" };
  const svg = buildSvg(o);
  let png: Buffer;
  try {
    const r = new Resvg(svg, {
      fitTo: { mode: "width", value: W },
      font: { loadSystemFonts: true, defaultFontFamily: "Yu Gothic" },
    });
    png = r.render().asPng();
  } catch (e: any) {
    return { ok: false, message: `描画失敗: ${e?.message ?? String(e)}` };
  }
  const out = resolve(o.out ?? "og-image.png");
  try {
    writeFileSync(out, png);
  } catch (e: any) {
    return { ok: false, message: `保存失敗: ${e?.message ?? String(e)}` };
  }
  return { ok: true, message: `OGP画像を生成しました: ${out}（${W}x${H} PNG）`, path: out };
}
