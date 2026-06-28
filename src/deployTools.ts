import { tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { vercelDeploy } from "./deploy.js";

// 実行道具（核4）: Vercel デプロイの純MCPツール。
const deployVercel = tool(
  "vercel_deploy",
  "Vercel にデプロイする（導入済みの vercel CLI を実行）。preview は即実行。prod=true（本番）は confirm=true が無いと実行せず警告だけ返す2段構え（自律実行の暴走防止）。本番前は差分・ビルド成否を必ず確認すること。",
  {
    dir: z.string().optional().describe("デプロイ対象フォルダ（既定: 現在の作業フォルダ）"),
    prod: z.boolean().optional().describe("true で本番デプロイ(--prod)。既定 false=プレビュー"),
    confirm: z.boolean().optional().describe("本番デプロイの実行確認。prod=true のとき必須"),
  },
  async (args) => {
    const r = vercelDeploy(args);
    return { content: [{ type: "text", text: r.message }] };
  },
  { annotations: { readOnlyHint: false } }
);

export const deployServer = createSdkMcpServer({
  name: "deploy",
  version: "0.1.0",
  tools: [deployVercel],
});
