import { execFileSync } from "node:child_process";

// git自動チェックポイント＋/undo（核2）。
// 設計図の指示: 素朴な git checkout で現行作業を壊さない。
// 方式: 各ターン前に `git stash create`（作業ツリーを触らずスナップショットの
// コミットを作る）→ そのSHAを保持。/undo は `git checkout <sha> -- .` で
// 追跡ファイルだけをスナップショット時点に戻す（新規ファイルは消さない＝安全側）。

export type Checkpoint = {
  id: number;
  label: string;
  time: string;
  restoreRef: string;
  dirty: boolean;
};

function git(cwd: string, args: string[]): { ok: boolean; out: string } {
  try {
    const out = execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return { ok: true, out };
  } catch {
    return { ok: false, out: "" };
  }
}

export function isGitRepo(cwd: string): boolean {
  const r = git(cwd, ["rev-parse", "--is-inside-work-tree"]);
  return r.ok && r.out === "true";
}

let counter = 0;
const stack: Checkpoint[] = [];

/** ターン前のスナップショットを作る。gitでない/コミットが無い場合は null */
export function createCheckpoint(cwd: string, label: string): Checkpoint | null {
  if (!isGitRepo(cwd)) return null;
  const head = git(cwd, ["rev-parse", "HEAD"]);
  const stash = git(cwd, ["stash", "create"]);
  const sha = stash.ok ? stash.out : "";

  let restoreRef: string;
  let dirty: boolean;
  if (sha) {
    git(cwd, ["stash", "store", "-m", `zenno:${label}`, sha]); // gc回避で保持
    restoreRef = sha;
    dirty = true;
  } else if (head.ok && head.out) {
    restoreRef = head.out; // 変更なし → HEADの追跡状態が復元先
    dirty = false;
  } else {
    return null; // コミットが無い等で snapshot 不能
  }

  const cp: Checkpoint = {
    id: ++counter,
    label,
    time: new Date().toISOString(),
    restoreRef,
    dirty,
  };
  stack.push(cp);
  return cp;
}

export function latest(): Checkpoint | null {
  return stack.length ? stack[stack.length - 1] : null;
}

export function listCheckpoints(): Checkpoint[] {
  return [...stack];
}

/** 追跡ファイルをチェックポイント時点に戻す（新規ファイルは保持＝破壊しない） */
export function restore(cwd: string, cp: Checkpoint): { ok: boolean; message: string } {
  if (!isGitRepo(cwd)) return { ok: false, message: "gitリポジトリではありません" };
  const r = git(cwd, ["checkout", cp.restoreRef, "--", "."]);
  if (!r.ok) {
    return { ok: false, message: "復元に失敗しました（コンフリクト等）。git status で手動確認してください" };
  }
  return {
    ok: true,
    message: `チェックポイント #${cp.id}「${cp.label}」に戻しました（追跡ファイルのみ・新規ファイルは保持）`,
  };
}
