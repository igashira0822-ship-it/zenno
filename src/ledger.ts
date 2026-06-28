// 多AI課金の可視化（核2の一部）。
// Anthropic分は SDK の result.total_cost_usd（セッション累計）を採用。
// GPT/Gemini分は usage トークン×単価で自前計上（providers.ts が記録）。
// 単価は概算（変動しうる）。未知モデルは「単価不明」としてトークンのみ集計。

type Price = { in: number; out: number }; // USD / 1M tokens

const PRICES: Record<string, Price> = {
  // ※ 概算（$/1M tokens）。正確な値は各社の料金表で要確認。
  // === 新世代（2026-06時点）===
  "gpt-5.5-pro": { in: 30, out: 180 }, // 真の最上位（Responses API専用・高額）
  "gpt-5.5": { in: 5, out: 30 }, // 推奨デフォルト
  "gpt-5.4": { in: 2.5, out: 15 },
  "gpt-5.4-mini": { in: 0.75, out: 4.5 },
  "gemini-3.1-pro-preview": { in: 2, out: 12 }, // 推奨デフォルト
  "gemini-3.5-flash": { in: 1.5, out: 9 },
  // === 既存（残置・フォールバック）===
  "gpt-5": { in: 1.25, out: 10 },
  "gpt-5-mini": { in: 0.25, out: 2 },
  "gpt-4o": { in: 2.5, out: 10 },
  "gpt-4o-mini": { in: 0.15, out: 0.6 },
  "gemini-2.5-pro": { in: 1.25, out: 10 },
  "gemini-2.5-flash": { in: 0.3, out: 2.5 },
  "gemini-1.5-pro": { in: 1.25, out: 5 },
};

type Acc = { calls: number; inTok: number; outTok: number; usd: number; unknownPrice: boolean };

class Ledger {
  private anthropicUsd = 0;
  private prov: Record<string, Acc> = {};

  /** result.total_cost_usd（累計）を採用。最大値を保持 */
  addAnthropic(cumulativeUsd: unknown): void {
    if (typeof cumulativeUsd === "number" && cumulativeUsd > this.anthropicUsd) {
      this.anthropicUsd = cumulativeUsd;
    }
  }

  addProvider(provider: string, model: string, inTok: number, outTok: number): void {
    const key = `${provider}:${model}`;
    const acc = (this.prov[key] ??= { calls: 0, inTok: 0, outTok: 0, usd: 0, unknownPrice: false });
    acc.calls += 1;
    acc.inTok += inTok || 0;
    acc.outTok += outTok || 0;
    const price = PRICES[model.toLowerCase()];
    if (price) acc.usd += ((inTok || 0) * price.in + (outTok || 0) * price.out) / 1_000_000;
    else acc.unknownPrice = true;
  }

  providerUsd(): number {
    return Object.values(this.prov).reduce((s, a) => s + a.usd, 0);
  }

  total(): number {
    return this.anthropicUsd + this.providerUsd();
  }

  summary(): string {
    const L: string[] = [];
    L.push(`Claude(中核): $${this.anthropicUsd.toFixed(4)}  ※SDK実測(累計)`);
    const keys = Object.keys(this.prov);
    if (keys.length === 0) {
      L.push(`他AI: 呼び出しなし`);
    } else {
      for (const k of keys) {
        const a = this.prov[k];
        const cost = a.unknownPrice ? "$?(単価不明)" : `$${a.usd.toFixed(4)}`;
        L.push(`${k}: ${cost}  (${a.calls}回, in ${a.inTok} / out ${a.outTok} tok)  ※概算`);
      }
    }
    L.push(`― 合計(概算): $${this.total().toFixed(4)}`);
    return L.join("\n");
  }
}

export const ledger = new Ledger();
