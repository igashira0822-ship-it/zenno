import { tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { checkSite, fetchPage } from "./web.js";

// 実行道具（核5）: Web 実機検証 / 取得の純MCPツール。読み取り専用・副作用なし。
const checkSiteTool = tool(
  "check_site",
  "本番サイト等のURLを実際に叩いて死活確認する。HTTP状態・最終URL(リダイレクト後)・<title>・応答時間を返す。expect を渡すと本文にその文字列が含まれるか照合する（デプロイ後の反映確認・本番URLの生存監視に）。",
  {
    url: z.string().describe("確認するURL（http(s)://〜）"),
    expect: z.string().optional().describe("本文に含まれるべき文字列（あれば一致/不一致を判定）"),
    timeoutMs: z.number().optional().describe("タイムアウト(ms)。既定15000"),
  },
  async (args) => {
    const r = await checkSite(args);
    return { content: [{ type: "text", text: r.message }] };
  },
  { annotations: { readOnlyHint: true } }
);

const fetchPageTool = tool(
  "fetch_page",
  "URLのページ本文を取得し、HTMLを可読テキストへ変換して返す（上限つき）。内容確認・調査・差分把握に。書き込みはしない。",
  {
    url: z.string().describe("取得するURL（http(s)://〜）"),
    max: z.number().optional().describe("返すテキストの最大文字数（既定4000・上限20000）"),
  },
  async (args) => {
    const r = await fetchPage(args);
    return { content: [{ type: "text", text: r.message }] };
  },
  { annotations: { readOnlyHint: true } }
);

export const webServer = createSdkMcpServer({
  name: "web",
  version: "0.1.0",
  tools: [checkSiteTool, fetchPageTool],
});
