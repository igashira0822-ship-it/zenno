import { readFileSync, writeFileSync } from "node:fs";
import { knowledgeReadPath, knowledgeWritePath } from "./knowledgePaths.js";

// プロジェクト横断の固有知識（核1）。
// projects.json は MEMORY.md 由来の「読み取り専用キャッシュ（安定事実のみ）」。
// 設計図の注意を反映:
//  - 揮発フィールド（次のタスク等）はキャッシュに入れない
//  - last_verified で古さを明示し、14日超は警告マーク
//  - cwd判定は longest-prefix（suumo-scraper と suumo-scraper/electron-app を誤選択しない）

export type Project = {
  name: string;
  aliases?: string[];
  path: string;
  summary?: string;
  stack?: string;
  pkg?: string;
  deploy?: string;
  prod?: string;
  gotchas?: string[];
  last_verified?: string;
};

type Registry = { _note?: string; _seeded?: string; projects: Project[] };

let cache: Project[] | null = null;

function readRaw(): Registry {
  try {
    const data = JSON.parse(readFileSync(knowledgeReadPath("projects.json"), "utf8")) as Registry;
    if (!Array.isArray(data.projects)) data.projects = [];
    return data;
  } catch {
    return { projects: [] };
  }
}

export function loadProjects(): Project[] {
  if (cache) return cache;
  cache = readRaw().projects;
  return cache;
}

/** undefined のキーを落とす（既存値を undefined で消さないため）。 */
function clean<T extends object>(o: T): Partial<T> {
  const r: any = {};
  for (const k in o) if ((o as any)[k] !== undefined) r[k] = (o as any)[k];
  return r;
}

/** プロジェクト固有の確定事実を追記/更新（指定フィールドのみ・既存は維持）。 */
export function upsertProject(
  p: Partial<Project> & { name: string }
): { ok: boolean; message: string; created: boolean } {
  if (!p.name?.trim()) return { ok: false, message: "name は必須です", created: false };
  const raw = readRaw();
  const i = raw.projects.findIndex((x) => x.name.toLowerCase() === p.name.toLowerCase());
  const today = new Date().toISOString().slice(0, 10);
  let created = false;
  if (i === -1) {
    if (!p.path) return { ok: false, message: "新規プロジェクトには path が必須です", created: false };
    raw.projects.push({ ...clean(p), name: p.name, path: p.path, last_verified: today } as Project);
    created = true;
  } else {
    raw.projects[i] = { ...raw.projects[i], ...clean(p), last_verified: today };
  }
  try {
    writeFileSync(knowledgeWritePath("projects.json"), JSON.stringify(raw, null, 2) + "\n", "utf8");
  } catch (e: any) {
    return { ok: false, message: `書き込み失敗（asar等で不可かも）: ${e?.message ?? String(e)}`, created: false };
  }
  cache = null; // 次回 loadProjects で再読込
  return {
    ok: true,
    message: `${created ? "新規追加" : "更新"}しました: ${p.name}（last_verified=${today}）`,
    created,
  };
}

const norm = (p: string) => p.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();

/** 現在の作業フォルダに最も深く一致するプロジェクト（longest-prefix） */
export function matchByCwd(cwd: string): Project | null {
  const c = norm(cwd);
  let best: Project | null = null;
  let bestLen = -1;
  for (const p of loadProjects()) {
    const pp = norm(p.path);
    if (!pp.startsWith("c:/") && !pp.startsWith("f:/") && !pp.startsWith("d:/")) continue; // 実パスのみ
    if (c === pp || c.startsWith(pp + "/")) {
      if (pp.length > bestLen) {
        best = p;
        bestLen = pp.length;
      }
    }
  }
  return best;
}

/** 名前・別名・概要での検索（完全一致優先→部分一致） */
export function findByName(q: string): Project | null {
  const s = q.trim().toLowerCase();
  if (!s) return null;
  const ps = loadProjects();
  for (const p of ps) {
    if (p.name.toLowerCase() === s) return p;
    if (p.aliases?.some((a) => a.toLowerCase() === s)) return p;
  }
  for (const p of ps) {
    if (p.name.toLowerCase().includes(s)) return p;
    if (p.aliases?.some((a) => a.toLowerCase().includes(s))) return p;
    if (p.summary?.toLowerCase().includes(s)) return p;
  }
  return null;
}

function staleTag(last?: string): string {
  if (!last) return " [検証日不明・要確認]";
  const then = new Date(last + "T00:00:00");
  if (Number.isNaN(then.getTime())) return "";
  const days = Math.floor((Date.now() - then.getTime()) / 86_400_000);
  return days > 14 ? ` [⚠要再検証: ${days}日前(${last})]` : ` [検証: ${last}]`;
}

/** Claude に注入する1プロジェクトの文脈ブロック */
export function formatContext(p: Project): string {
  const L: string[] = [];
  L.push(`# プロジェクト: ${p.name}${staleTag(p.last_verified)}`);
  if (p.summary) L.push(p.summary);
  if (p.path) L.push(`- パス: ${p.path}`);
  if (p.stack) L.push(`- 技術: ${p.stack}`);
  if (p.pkg) L.push(`- パッケージ管理: ${p.pkg}`);
  if (p.deploy) L.push(`- デプロイ: ${p.deploy}`);
  if (p.prod) L.push(`- 本番: ${p.prod}`);
  if (p.gotchas?.length) {
    L.push(`- 固有の注意点:`);
    for (const g of p.gotchas) L.push(`    • ${g}`);
  }
  L.push(`（この情報は古くなりうる。実コード・実環境と矛盾したら現物を優先し、その旨をユーザーに伝えること。前提として無条件には信用しない）`);
  return L.join("\n");
}

/** プロジェクト一覧（1行ずつ） */
export function formatList(): string {
  const ps = loadProjects();
  if (!ps.length) return "（登録プロジェクトなし）";
  return ps
    .map((p) => `- ${p.name}: ${p.summary ?? p.stack ?? ""}  (${p.path})`)
    .join("\n");
}
