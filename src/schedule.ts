import { tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

// 実行道具（核6）: 定期実行スケジューラ。登録ジョブを GUI 常駐ランナーが予定時刻で
//   決定的に実行（LLM非介在）→ OS通知＋ログ保存。永続化と常駐実行は Electron 側（SchedulerApi 注入）。
//   ここはジョブ表現・schedule 解析・実行判定（純関数）と、登録/一覧/削除の MCP ツールを持つ。
//   schedule 書式: "every:30m" / "every:2h" / "daily:HH:MM"。

export type Job = {
  id: string;
  schedule: string;
  command: string;
  cwd?: string;
  createdAt: number;
  lastRun?: number;
  lastStatus?: "ok" | "fail";
};

export type SchedulerApi = {
  add(input: { schedule: string; command: string; cwd?: string }): { ok: boolean; message: string };
  list(): Job[];
  remove(id: string): { ok: boolean; message: string };
};

export type ParsedSchedule = { kind: "interval"; ms: number } | { kind: "daily"; h: number; m: number };

export function parseSchedule(s: string): ParsedSchedule | null {
  const t = (s ?? "").trim().toLowerCase();
  let m = t.match(/^every:(\d+)\s*(m|min|mins|minute|minutes|h|hr|hour|hours)$/);
  if (m) {
    const n = parseInt(m[1], 10);
    if (!n) return null;
    const ms = m[2].startsWith("h") ? n * 3_600_000 : n * 60_000;
    return { kind: "interval", ms };
  }
  m = t.match(/^daily:(\d{1,2}):(\d{2})$/);
  if (m) {
    const h = parseInt(m[1], 10);
    const mm = parseInt(m[2], 10);
    if (h > 23 || mm > 59) return null;
    return { kind: "daily", h, m: mm };
  }
  return null;
}

// 実行すべきか。now は呼び出し側から渡す（テスト容易性・内部で Date.now を呼ばない）。
export function isDue(job: Job, nowMs: number): boolean {
  const p = parseSchedule(job.schedule);
  if (!p) return false;
  if (p.kind === "interval") {
    if (!job.lastRun) return true;
    return nowMs - job.lastRun >= p.ms;
  }
  // daily: 今日の HH:MM を過ぎていて、まだ今日分を実行していない
  const due = new Date(nowMs);
  due.setHours(p.h, p.m, 0, 0);
  if (nowMs < due.getTime()) return false;
  if (!job.lastRun) return true;
  return job.lastRun < due.getTime();
}

export function createScheduleServer(api?: SchedulerApi) {
  const guiOnly = "スケジューラの常駐実行はGUI版(IGSHアプリ)でのみ動きます（CLIでは登録できません）。";

  const addTool = tool(
    "schedule_add",
    "定期実行ジョブを登録する。schedule は 'every:30m' / 'every:2h' / 'daily:04:00' 形式。command はシェルコマンド。GUI常駐中に予定時刻で自動実行し、完了をOS通知＋ログ保存する（LLM非介在の決定的実行）。本番影響のあるコマンドは慎重に。",
    {
      schedule: z.string().describe("'every:30m' | 'every:2h' | 'daily:HH:MM'"),
      command: z.string().describe("実行するシェルコマンド"),
      cwd: z.string().optional().describe("実行フォルダ（既定: 現在の作業フォルダ）"),
    },
    async (args) => {
      if (!api) return { content: [{ type: "text", text: guiOnly }] };
      const r = api.add(args);
      return { content: [{ type: "text", text: r.message }] };
    },
    { annotations: { readOnlyHint: false } }
  );

  const listTool = tool(
    "schedule_list",
    "登録済みの定期実行ジョブ一覧を返す（ID・schedule・command・最終実行）。",
    {},
    async () => {
      if (!api) return { content: [{ type: "text", text: guiOnly }] };
      const jobs = api.list();
      const text = jobs.length
        ? jobs
            .map(
              (j) =>
                `#${j.id}  ${j.schedule}  「${j.command}」 cwd=${j.cwd ?? "-"}` +
                (j.lastRun ? `  last=${new Date(j.lastRun).toLocaleString()}(${j.lastStatus ?? "?"})` : "  (未実行)")
            )
            .join("\n")
        : "登録ジョブはありません。";
      return { content: [{ type: "text", text }] };
    },
    { annotations: { readOnlyHint: true } }
  );

  const removeTool = tool(
    "schedule_remove",
    "登録済みジョブをIDで削除する。",
    { id: z.string().describe("schedule_list で表示されるID") },
    async (args) => {
      if (!api) return { content: [{ type: "text", text: guiOnly }] };
      const r = api.remove(args.id);
      return { content: [{ type: "text", text: r.message }] };
    },
    { annotations: { readOnlyHint: false } }
  );

  return createSdkMcpServer({ name: "schedule", version: "0.1.0", tools: [addTool, listTool, removeTool] });
}
