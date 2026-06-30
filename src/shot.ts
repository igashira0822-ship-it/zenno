import { tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

// 実行道具（核6）: URL の見た目をスクショして「画像のまま」返す視覚検証。
//   撮影の実体は Electron(BrowserWindow) の能力。engine 経由で注入する（CaptureFn）。
//   CLI には注入されない＝「GUI版のみ」と素直に縮退（重依存 Playwright を持ち込まない）。
//   画像は MCP の image コンテンツで返すので、Claude 自身がレンダリング結果を視覚的に確認できる。

export type CaptureResult = { ok: boolean; base64?: string; path?: string; message: string };
export type CaptureFn = (
  url: string,
  o: { width?: number; height?: number; waitMs?: number; out?: string }
) => Promise<CaptureResult>;

export function createShotServer(capture?: CaptureFn) {
  const shotTool = tool(
    "screenshot_url",
    "URLを埋め込みブラウザで開いて実際の見た目をPNGで撮影し、画像をそのまま返す（Claudeが視覚的に確認できる）。レイアウト崩れ・描画確認・デプロイ後の見た目検証に。GUI版(IGSHアプリ)でのみ動作。",
    {
      url: z.string().describe("撮影するURL（http(s)://〜）"),
      width: z.number().optional().describe("ビューポート幅px（既定1280）"),
      height: z.number().optional().describe("ビューポート高px（既定800）"),
      waitMs: z.number().optional().describe("読み込み後に待つms（JS描画待ち・既定800）"),
      out: z.string().optional().describe("PNG保存先パス（省略時はuserDataに自動命名）"),
    },
    async (args) => {
      if (!capture) {
        return { content: [{ type: "text", text: "スクショはGUI版(IGSHアプリ)でのみ利用できます（CLIでは不可）。" }] };
      }
      if (!/^https?:\/\//i.test((args.url ?? "").trim())) {
        return { content: [{ type: "text", text: `URL は http(s):// で始めてください: ${args.url || "(空)"}` }] };
      }
      const r = await capture(args.url, args);
      if (!r.ok) return { content: [{ type: "text", text: r.message }] };
      const content: any[] = [];
      if (r.base64) content.push({ type: "image", data: r.base64, mimeType: "image/png" });
      content.push({ type: "text", text: r.message });
      return { content };
    },
    { annotations: { readOnlyHint: true } }
  );

  return createSdkMcpServer({ name: "shot", version: "0.1.0", tools: [shotTool] });
}
