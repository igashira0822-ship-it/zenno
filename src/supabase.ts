import { config } from "./config.js";

// 実行道具（核4）: Supabase の SQL を Management API（PAT認証）で実行する薄いラッパー。
// providers.ts と同じ流儀: 未設定・APIエラーは「投げず」説明文字列で返す。
// 安全設計（ユーザー合意）:
//   - 読み取り(SELECT/EXPLAIN/SHOW/WITH...SELECT)は即実行
//   - 書き込み(INSERT/UPDATE/DELETE/DDL)は confirm:true が無いと実行せず内容を返す2段構え
//   - 判定は「迷ったら write」（安全側）。本番DBなので暴走を止めるのが最優先。

const TIMEOUT_MS = 60_000;

const READ_HEAD = /^\s*\(*\s*(with|select|explain|show|table|values)\b/i;
const WRITE_KW =
  /\b(insert|update|delete|drop|alter|create|truncate|grant|revoke|merge|call|do|vacuum|reindex|refresh|set|comment)\b/i;
const DANGER = /\b(drop\s+(database|schema|table)|truncate)\b/i;
const NO_WHERE_DML = /\b(delete|update)\b(?![\s\S]*\bwhere\b)/i;

/** 迷ったら write（安全側）。複数文はいずれかが write なら write。 */
export function classifySql(sql: string): "read" | "write" {
  const stmts = sql
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const s of stmts) {
    if (WRITE_KW.test(s)) return "write";
    if (!READ_HEAD.test(s)) return "write";
  }
  return "read";
}

export async function runSql(
  sql: string,
  opts: { projectRef?: string; confirm?: boolean }
): Promise<string> {
  if (!sql?.trim()) return "[Supabase] SQL が空です。";
  if (!config.supabase.pat) {
    return "[Supabase 未接続] SUPABASE_ACCESS_TOKEN（Personal Access Token）が未設定です。.env に追加してください。";
  }
  const ref = opts.projectRef || config.supabase.projectRef;
  if (!ref) {
    return "[Supabase] project ref が不明です。引数 projectRef か SUPABASE_PROJECT_REF を設定してください。";
  }

  const kind = classifySql(sql);
  if (kind === "write" && opts.confirm !== true) {
    const warn = DANGER.test(sql) ? "（DROP/TRUNCATE 等の高危険SQLを含む）" : "";
    const nw = NO_WHERE_DML.test(sql) ? "（WHERE の無い DELETE/UPDATE＝全行操作の疑い）" : "";
    return (
      `⚠ 書き込み系SQLです${warn}${nw}。本番DB(${ref})を変更します。\n` +
      `内容を確認し、実行するなら confirm:true を付けて再度呼んでください。\n--- SQL ---\n${sql.slice(0, 1000)}`
    );
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.supabase.pat}`,
      },
      body: JSON.stringify({ query: sql }),
      signal: ctrl.signal,
    });
    const text = await res.text();
    if (!res.ok) return `[Supabase エラー ${res.status}] ${text.slice(0, 1000)}`;
    let rows: unknown;
    try {
      rows = JSON.parse(text);
    } catch {
      rows = text;
    }
    const n = Array.isArray(rows) ? rows.length : 0;
    const preview = typeof rows === "string" ? rows : JSON.stringify(rows, null, 2);
    return `✅ ${kind === "read" ? "取得" : "実行"}成功（${ref}・${n}行）\n${preview.slice(0, 2500)}`;
  } catch (e: any) {
    return e?.name === "AbortError" ? "[Supabase タイムアウト]" : `[Supabase 例外] ${e?.message ?? String(e)}`;
  } finally {
    clearTimeout(timer);
  }
}
