import { existsSync } from "node:fs";

// .env があれば読み込む（依存パッケージ不要 / Node 標準）
try {
  if (existsSync(".env")) process.loadEnvFile(".env");
} catch {
  // 古い Node 等で loadEnvFile が無い場合は無視（環境変数を直接使う）
}

type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export const config = {
  // === 中核（Claude）===
  // 認証は2通り: ① サブスク(OAuth)=追加課金なし ② APIキー=従量課金。
  // SDKの優先順位ではAPIキーが上なので、サブスクで使うならAPIキーは設定しないこと。
  anthropicKey: process.env.ANTHROPIC_API_KEY ?? "",
  oauthToken: process.env.CLAUDE_CODE_OAUTH_TOKEN ?? "",
  // 既定は 'best'：組織にFable5アクセス権があればFable5、無ければ最新Opusへ自動降格。
  //   → サブスクで「使えるなら使う／ダメでも課金ゼロのOpusに落ちる」安全運用。
  // 確実にFable5固定: ZENNO_MODEL=claude-fable-5（※30日データ保持必須・ZDR不可・Opusの約2倍課金）。
  model: process.env.ZENNO_MODEL ?? "best",
  // refusal(200+stop_reason:refusal)/過負荷/モデル未提供時の退避先（SDK: Options.fallbackModel）。
  fallbackModel: process.env.ZENNO_FALLBACK_MODEL ?? "claude-opus-4-8",
  // ultracode相当の深さ。Fable5は xhigh/max 対応。既定 xhigh（定型作業は ZENNO_EFFORT=medium 等に）。
  effort: (process.env.ZENNO_EFFORT ?? "xhigh") as Effort,
  // default | acceptEdits | plan | bypassPermissions など
  permissionMode: process.env.ZENNO_PERMISSION ?? "bypassPermissions",
  // Anthropic分の自動コスト上限（USD）。超えると停止。未設定なら無制限。
  maxUsd: process.env.ZENNO_MAX_USD ? Number(process.env.ZENNO_MAX_USD) : undefined,
  // 検証ゲート: "warn"=編集が起きたターンの後に決定的チェック(tsc/lint)を走らせ警告 / "off"
  verify: (process.env.ZENNO_VERIFY ?? "warn") as "warn" | "off",
  // 出力高速化（Fast mode・Opus 4.8/4.7/4.6）: 同じOpusを最大2.5倍速で出力。品質は落ちない（小さいモデルに降格しない）。
  // premium pricing・fast専用レート制限（混雑時はSDKがstandardへ自動退避）。既定ON、ZENNO_FAST=0 で無効化。
  fast: process.env.ZENNO_FAST !== "0",

  // === 合体する他AI ===
  openai: {
    key: process.env.OPENAI_API_KEY ?? "",
    // 既定=改修ゼロで即動作する最高グレード(chat/completions対応)。
    // 真の最上位 gpt-5.5-pro はResponses API専用＆高額($30/$180)＆低速。
    //   pro指定時は providers.ts が自動で /v1/responses に切替える。
    model: process.env.OPENAI_MODEL ?? "gpt-5.5",
  },
  gemini: {
    key: process.env.GEMINI_API_KEY ?? "",
    // API利用可能な最高能力。要・課金有効キー(Pro系は無料枠なし)。
    model: process.env.GEMINI_MODEL ?? "gemini-3.1-pro-preview",
  },

  // === 本番DB（Supabase）===
  // Management API（PAT認証）で SQL を実行するための個人アクセストークンと既定プロジェクトref。
  supabase: {
    pat: process.env.SUPABASE_ACCESS_TOKEN ?? "",
    projectRef: process.env.SUPABASE_PROJECT_REF ?? "",
  },
};
