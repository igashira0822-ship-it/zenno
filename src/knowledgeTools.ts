import { tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { findByName, matchByCwd, formatContext, formatList, upsertProject } from "./registry.js";
import { loadPreferences, appendMemory } from "./preferences.js";

// 核1: プロジェクト横断の固有知識を Claude が読むための道具。
// セッション中の切替は systemPrompt を入れ替えられないため、ツールとして呼ばせる
// （設計図のアーキテクチャ非互換の解決策）。

const loadProjectContext = tool(
  "load_project_context",
  "指定プロジェクト（または現在の作業フォルダ）の固有知識（パス/技術/デプロイ/本番URL/固有の注意点）を読み込む。作業開始前、または別プロジェクトへ切り替えたとき最初に呼ぶ。",
  {
    project: z
      .string()
      .optional()
      .describe("プロジェクト名や別名。省略時は現在の作業フォルダから自動判定する"),
  },
  async (args) => {
    const p = args.project ? findByName(args.project) : matchByCwd(process.cwd());
    if (!p) {
      const msg = args.project
        ? `「${args.project}」に一致する登録プロジェクトがありません。list_projects で一覧を確認してください。`
        : `現在の作業フォルダ（${process.cwd()}）は登録プロジェクトの外です。project名を指定するか list_projects を使ってください。`;
      return { content: [{ type: "text", text: msg }] };
    }
    return { content: [{ type: "text", text: formatContext(p) }] };
  },
  { annotations: { readOnlyHint: true } }
);

const listProjects = tool(
  "list_projects",
  "登録済みの全プロジェクト一覧（名前・概要・パス）を返す。どのプロジェクトの固有知識が使えるか確認するときに使う。",
  {},
  async () => ({ content: [{ type: "text", text: formatList() }] }),
  { annotations: { readOnlyHint: true } }
);

// 自己強化: 横断ナレッジ＆ユーザー設定（preferences.md）の読み取り。起動時に自動注入もされる。
const loadUserPreferences = tool(
  "load_preferences",
  "プロジェクトを跨ぐ横断ノウハウ・ユーザーの好み・ハマりどころ（preferences.md）を読み込む。起動時に自動注入されるが、最新を確認したいとき明示的に呼ぶ。",
  {},
  async () => ({
    content: [{ type: "text", text: loadPreferences().trim() || "（preferences.md はまだ空です）" }],
  }),
  { annotations: { readOnlyHint: true } }
);

// 自己強化の心臓: IGSH が会話で学んだことを自分で永久保存する。
const remember = tool(
  "remember",
  "新しく学んだユーザーの好み・横断ノウハウ・落とし穴・有効な手順を preferences.md に永久保存する（append-only）。次回起動から自動で前ロードされる。プロジェクト固有の確定事実（パス/技術/デプロイ/本番URL）は対象外。",
  {
    category: z
      .enum(["preference", "note", "gotcha", "workflow"])
      .describe("preference=ユーザーの好み / note=横断ノウハウ / gotcha=落とし穴 / workflow=手順"),
    title: z.string().describe("短い見出し（後で探しやすい言葉で）"),
    content: z.string().describe("具体的な内容。なぜそうか・どう適用するかまで書く"),
    project: z.string().optional().describe("関連するプロジェクト名（あれば）"),
  },
  async (args) => {
    const r = appendMemory(args.category, args.title, args.content, args.project);
    return { content: [{ type: "text", text: r.message }] };
  },
  { annotations: { readOnlyHint: false } }
);

// 自己強化: プロジェクト固有の確定事実（path/stack/deploy/prod 等）を IGSH 自身が更新する。
const updateProject = tool(
  "update_project",
  "プロジェクト固有の確定事実（パス/技術/パッケージ管理/デプロイ/本番URL/固有の注意点）を projects.json に登録・更新する。指定フィールドだけ更新し未指定は既存維持。last_verified は自動で今日。確定した事実だけ書く（推測は書かない）。横断ノウハウや好みは remember を使う。",
  {
    name: z.string().describe("プロジェクト名。既存と一致すれば更新、なければ新規（新規は path 必須）"),
    path: z.string().optional().describe("ローカルの絶対パス"),
    summary: z.string().optional().describe("一行概要"),
    stack: z.string().optional().describe("技術スタック"),
    pkg: z.string().optional().describe("パッケージ管理（pnpm/npm 等）"),
    deploy: z.string().optional().describe("デプロイ方法"),
    prod: z.string().optional().describe("本番URL"),
    aliases: z.array(z.string()).optional().describe("別名（指定すると置換）"),
    gotchas: z.array(z.string()).optional().describe("固有の注意点（指定すると置換）"),
  },
  async (args) => {
    const r = upsertProject(args);
    return { content: [{ type: "text", text: r.message }] };
  },
  { annotations: { readOnlyHint: false } }
);

export const knowledgeServer = createSdkMcpServer({
  name: "knowledge",
  version: "0.2.0",
  tools: [loadProjectContext, listProjects, loadUserPreferences, remember, updateProject],
});
