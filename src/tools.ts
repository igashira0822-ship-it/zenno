import { tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { askGpt, askGemini } from "./providers.js";
import { config } from "./config.js";

// Claude（中核の頭脳）が呼べる「他AIの道具」。
// これが "全部の頭脳を合体" の本体。Claude が自分の判断で呼ぶ。

const askGptTool = tool(
  "ask_gpt",
  "OpenAI GPT に質問・意見・別案を求める。セカンドオピニオンや別の発想が欲しいときに使う。",
  { prompt: z.string().describe("GPT に送る質問やお願い（具体的に書く）") },
  async (args) => ({
    content: [{ type: "text", text: await askGpt(args.prompt) }],
  })
);

const askGeminiTool = tool(
  "ask_gemini",
  "Google Gemini に質問・意見・別案を求める。巨大コンテキストや別視点が欲しいときに使う。",
  { prompt: z.string().describe("Gemini に送る質問やお願い（具体的に書く）") },
  async (args) => ({
    content: [{ type: "text", text: await askGemini(args.prompt) }],
  })
);

const councilTool = tool(
  "ai_council",
  "同じ問いを GPT と Gemini の両方へ同時に投げ、両者の回答を集めて返す。難しい設計判断・レビュー・重要な意思決定で、複数AIの意見を統合したいときに使う。",
  { prompt: z.string().describe("各AIに送る共通の問い") },
  async (args) => {
    const [gpt, gemini] = await Promise.all([
      askGpt(args.prompt),
      askGemini(args.prompt),
    ]);
    const text =
      `=== GPT (${config.openai.model}) の回答 ===\n${gpt}\n\n` +
      `=== Gemini (${config.gemini.model}) の回答 ===\n${gemini}\n\n` +
      `（上記2つの意見と、あなた自身（Claude）の考えを統合し、最良の結論を出してください）`;
    return { content: [{ type: "text", text }] };
  }
);

export const aiCouncilServer = createSdkMcpServer({
  name: "council",
  version: "0.1.0",
  tools: [askGptTool, askGeminiTool, councilTool],
});
