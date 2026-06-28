import { tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { generateOgImage } from "./ogimage.js";

// 実行道具（核4）: OGP/SNSシェア用画像を生成する純MCPツール。API不要・確実。
const genOgImage = tool(
  "gen_og_image",
  "OGP/SNSシェア用の画像(1200x630 PNG)を生成する。API不要・システムの日本語フォントで描画。記事/LP/サイトの og:image に。SEO・CTR向け。",
  {
    title: z.string().describe("大見出し（必須・自動で折り返す）"),
    subtitle: z.string().optional().describe("小見出し（下部・1行）"),
    badge: z.string().optional().describe("左上のラベル（サイト名・カテゴリ等）"),
    theme: z.enum(["blue", "green", "orange", "dark"]).optional().describe("配色（既定 blue）"),
    out: z.string().optional().describe("出力先パス（既定 ./og-image.png）"),
  },
  async (args) => {
    const r = generateOgImage(args);
    return { content: [{ type: "text", text: r.message }] };
  },
  { annotations: { readOnlyHint: false } }
);

export const ogServer = createSdkMcpServer({
  name: "og",
  version: "0.1.0",
  tools: [genOgImage],
});
