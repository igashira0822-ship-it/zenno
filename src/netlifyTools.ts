import { tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { netlifyDeploy } from "./netlify.js";

// 実行道具（核5）: Netlify デプロイの純MCPツール（deployTools.ts と同設計）。
const deployNetlify = tool(
  "netlify_deploy",
  "Netlify にデプロイする（導入済みの netlify CLI を実行）。既定はドラフト(プレビュー)で即実行。prod=true（本番）は confirm=true が無いと実行せず警告だけ返す2段構え。zip圧縮はせず CLI が dir を直接アップロードするので zip破壊罠を踏まない。publishフォルダは netlify.toml/リンク設定に従う。",
  {
    dir: z.string().optional().describe("デプロイ対象プロジェクトフォルダ（既定: 現在の作業フォルダ）"),
    prod: z.boolean().optional().describe("true で本番デプロイ(--prod)。既定 false=ドラフト"),
    confirm: z.boolean().optional().describe("本番デプロイの実行確認。prod=true のとき必須"),
  },
  async (args) => {
    const r = netlifyDeploy(args);
    return { content: [{ type: "text", text: r.message }] };
  },
  { annotations: { readOnlyHint: false } }
);

export const netlifyServer = createSdkMcpServer({
  name: "netlify",
  version: "0.1.0",
  tools: [deployNetlify],
});
