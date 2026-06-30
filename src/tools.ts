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

// 敵対的検証ゲート: 自分の「候補」を GPT と Gemini に批判的に潰させ、欠陥・リスク・抜けを洗い出す。
// ai_council（同じ問いを両者に投げる）とは別物 — これは "あなたの答え" を検証する用途。
// 高リスク（後戻り高い分岐／本番デプロイ直前／契約・課金・セキュリティ・SQL）でコミット前にだけ使う。
const councilReviewTool = tool(
  "council_review",
  "自分の提案（設計・計画・回答・SQL・デプロイ手順など）を GPT と Gemini に『敵対的レビュー』させ、欠陥・リスク・抜け・誤り・前提崩れを重大度付きで洗い出す検証ゲート。ai_council が「同じ問いを両者に投げる」のに対し、これは「あなたの候補を批判的に検証する」。後戻りコストが高い分岐・本番デプロイ直前・契約/課金/セキュリティ/SQL の判断で、コミット/実行する直前にだけ使う。返ってきた各指摘は採用/棄却＋理由を付けて統合し、最終判断は自分（Claude）が下す（多数決にしない）。",
  {
    proposal: z.string().describe("検証したい候補（設計/計画/回答/SQL/手順など）を具体的に全文で"),
    context: z.string().optional().describe("背景・制約・前提（任意・あると精度が上がる）"),
  },
  async (args) => {
    const critiquePrompt =
      `次の提案を敵対的にレビューしてください。賛成・要約・励ましは不要。` +
      `具体的な欠陥・リスク・抜け・誤り・前提崩れだけを、各項目に重大度（高/中/低）を付けて箇条書きで。` +
      `重大な問題が無ければ「重大な問題なし」と明記し、その理由を一言添えてください。` +
      (args.context ? `\n\n## 背景・制約\n${args.context}` : "") +
      `\n\n## 提案\n${args.proposal}`;
    const [gpt, gemini] = await Promise.all([askGpt(critiquePrompt), askGemini(critiquePrompt)]);
    const text =
      `=== GPT (${config.openai.model}) の指摘 ===\n${gpt}\n\n` +
      `=== Gemini (${config.gemini.model}) の指摘 ===\n${gemini}\n\n` +
      `（各指摘に「採用/棄却＋理由」を付けて統合し、最終判断はあなた自身が下すこと。` +
      `多数決にしない。誤検出・弱い指摘は理由付きで棄却してよい。実コード・実環境と矛盾する指摘は現物を優先。）`;
    return { content: [{ type: "text", text }] };
  }
);

export const aiCouncilServer = createSdkMcpServer({
  name: "council",
  version: "0.1.0",
  tools: [askGptTool, askGeminiTool, councilTool, councilReviewTool],
});
