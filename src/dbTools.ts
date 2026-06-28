import { tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { runSql } from "./supabase.js";

// 実行道具（核4）: Supabase SQL の純MCPツール。
const supabaseSql = tool(
  "supabase_sql",
  "Supabase の SQL を実行する（Management API・PAT認証）。SELECT等の読み取りは即実行。書き込み(INSERT/UPDATE/DELETE/DDL)は confirm=true が無いと実行せず内容を返す2段構え。本番DBなので確認を徹底すること。",
  {
    sql: z.string().describe("実行するSQL"),
    projectRef: z.string().optional().describe("Supabaseプロジェクトref（既定: SUPABASE_PROJECT_REF）"),
    confirm: z.boolean().optional().describe("書き込み系SQLの実行確認。read では不要"),
  },
  async (args) => ({
    content: [{ type: "text", text: await runSql(args.sql, args) }],
  }),
  { annotations: { readOnlyHint: false } }
);

export const dbServer = createSdkMcpServer({
  name: "db",
  version: "0.1.0",
  tools: [supabaseSql],
});
