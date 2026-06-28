import { config } from "./config.js";
import { ledger } from "./ledger.js";

// 他の生産AIへの薄いラッパー。SDKに依存せず fetch だけで呼ぶ。
// キー未設定・APIエラーは「投げず」に説明文字列で返す → Claude が状況を理解して続行できる。
// pro系は応答が長時間化するため余裕のあるタイムアウトを設定。

const TIMEOUT_MS = 6 * 60_000;

export async function askGpt(prompt: string): Promise<string> {
  if (!config.openai.key) {
    return "[GPT 未接続] OPENAI_API_KEY が設定されていません。.env に追加すると GPT を合体できます。";
  }
  const model = config.openai.model;
  // pro系 / o系 は Chat Completions 非対応（Responses API 専用）→ 自動切替。
  const useResponses = /pro\b/i.test(model) || /^o\d/i.test(model);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    if (useResponses) {
      const res = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.openai.key}`,
        },
        body: JSON.stringify({ model, input: prompt }),
        signal: ctrl.signal,
      });
      if (!res.ok) return `[GPT エラー ${res.status}] ${(await res.text()).slice(0, 800)}`;
      const data: any = await res.json();
      const u = data?.usage ?? {};
      ledger.addProvider("GPT", model, u.input_tokens ?? 0, u.output_tokens ?? 0);
      const text: string =
        data?.output_text ??
        (Array.isArray(data?.output)
          ? data.output
              .flatMap((o: any) => o?.content ?? [])
              .map((c: any) => c?.text ?? "")
              .join("")
          : "");
      return text || "[GPT: 応答が空でした]";
    }

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.openai.key}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
      }),
      signal: ctrl.signal,
    });
    if (!res.ok) return `[GPT エラー ${res.status}] ${(await res.text()).slice(0, 800)}`;
    const data: any = await res.json();
    const u = data?.usage ?? {};
    ledger.addProvider("GPT", model, u.prompt_tokens ?? 0, u.completion_tokens ?? 0);
    return data?.choices?.[0]?.message?.content ?? "[GPT: 応答が空でした]";
  } catch (e: any) {
    return e?.name === "AbortError"
      ? "[GPT タイムアウト] 応答が長時間化しました。OPENAI_MODEL を gpt-5.5 等に下げるか再試行を。"
      : `[GPT 例外] ${e?.message ?? String(e)}`;
  } finally {
    clearTimeout(timer);
  }
}

export async function askGemini(prompt: string): Promise<string> {
  if (!config.gemini.key) {
    return "[Gemini 未接続] GEMINI_API_KEY が設定されていません。.env に追加すると Gemini を合体できます。";
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/` +
      `${config.gemini.model}:generateContent?key=${config.gemini.key}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      return `[Gemini エラー ${res.status}] ${(await res.text()).slice(0, 800)}`;
    }
    const data: any = await res.json();
    const um = data?.usageMetadata ?? {};
    ledger.addProvider("Gemini", config.gemini.model, um.promptTokenCount ?? 0, um.candidatesTokenCount ?? 0);
    const text: string =
      data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join("") ?? "";
    return text || "[Gemini: 応答が空でした]";
  } catch (e: any) {
    return e?.name === "AbortError"
      ? "[Gemini タイムアウト] 応答が長時間化しました。再試行してください。"
      : `[Gemini 例外] ${e?.message ?? String(e)}`;
  } finally {
    clearTimeout(timer);
  }
}
