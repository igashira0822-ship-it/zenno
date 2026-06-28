import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

// 検証ゲート（核3）。設計図の指示:
//  - 決定的チェック主（tsc/lint）。flakyなHTTP200/dev起動チェックは既定で含めない。
//  - 既定は warn（非ブロック）。実機検証できるまで強制ブロックはしない。
//  - 編集が起きたプロジェクトにスコープ。

export type VerifyResult = { ran: boolean; ok: boolean; label: string; output: string };

function pkgManager(dir: string): string {
  if (existsSync(join(dir, "pnpm-lock.yaml"))) return "pnpm";
  if (existsSync(join(dir, "yarn.lock"))) return "yarn";
  return "npm";
}

/** 一番速い決定的チェックを選ぶ（typecheck > tsc > lint）。build は遅いので既定で使わない */
export function pickCheck(dir: string): { cmd: string; label: string } | null {
  const pkgPath = join(dir, "package.json");
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
      const scripts: Record<string, string> = pkg.scripts ?? {};
      const pm = pkgManager(dir);
      for (const s of ["typecheck", "type-check", "tsc", "lint"]) {
        if (scripts[s]) return { cmd: `${pm} run ${s}`, label: s };
      }
    } catch {
      /* ignore */
    }
  }
  if (existsSync(join(dir, "tsconfig.json"))) {
    return { cmd: "npx --no-install tsc --noEmit", label: "tsc --noEmit" };
  }
  return null;
}

// package.json の指定スクリプトを検出するヘルパ（無ければ null）。
function pickScript(
  dir: string,
  names: string[],
  reject?: RegExp
): { cmd: string; label: string } | null {
  const pkgPath = join(dir, "package.json");
  if (!existsSync(pkgPath)) return null;
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
    const scripts: Record<string, string> = pkg.scripts ?? {};
    const pm = pkgManager(dir);
    for (const s of names) {
      if (scripts[s] && !(reject && reject.test(scripts[s]))) {
        return { cmd: `${pm} run ${s}`, label: s };
      }
    }
  } catch {
    /* ignore */
  }
  return null;
}

/** test スクリプトを検出（`no test specified` のプレースホルダは除外）。 */
export function pickTest(dir: string): { cmd: string; label: string } | null {
  return pickScript(dir, ["test"], /no test specified/i);
}

/** build スクリプトを検出（重いので深い検証でのみ使う）。 */
export function pickBuild(dir: string): { cmd: string; label: string } | null {
  return pickScript(dir, ["build", "build:js"]);
}

function tail(s: string, n = 30): string {
  const lines = s.trim().split(/\r?\n/);
  return lines.length > n ? lines.slice(-n).join("\n") : lines.join("\n");
}

// 1ステップ実行（成功=stdout、失敗=stdout+stderr の末尾を返す）。
function runStep(
  dir: string,
  step: { cmd: string; label: string },
  timeoutMs: number
): VerifyResult {
  try {
    const out = execSync(step.cmd, {
      cwd: dir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: timeoutMs,
    });
    return { ran: true, ok: true, label: step.label, output: tail(out) };
  } catch (e: any) {
    const out =
      (e?.stdout?.toString?.() ?? "") + "\n" + (e?.stderr?.toString?.() ?? "");
    return { ran: true, ok: false, label: step.label, output: tail(out) };
  }
}

// 既定の自動ゲート: 一番速い決定的チェック1つだけ（毎ターン後に warn・非ブロック）。
export function runVerification(dir: string, timeoutMs = 120_000): VerifyResult {
  const check = pickCheck(dir);
  if (!check) return { ran: false, ok: true, label: "(検証可能なチェックなし)", output: "" };
  return runStep(dir, check, timeoutMs);
}

/**
 * 深い検証（オンデマンド・/verify full）: 型/lint → test → build を順に実行し、
 * 最初の失敗で止める（fail-fast）。「typecheckは通るが実際は壊れてる」を捕まえる。
 * 毎ターンには重いので自動ゲートには入れない。
 */
export function runFullVerification(dir: string, timeoutMs = 300_000): VerifyResult {
  const steps = [pickCheck(dir), pickTest(dir), pickBuild(dir)].filter(
    (s): s is { cmd: string; label: string } => s !== null
  );
  if (!steps.length) return { ran: false, ok: true, label: "(検証可能なチェックなし)", output: "" };
  const trail: string[] = [];
  for (const step of steps) {
    const r = runStep(dir, step, timeoutMs);
    trail.push(`${r.ok ? "✓" : "✗"}${step.label}`);
    if (!r.ok) return { ran: true, ok: false, label: trail.join(" → "), output: r.output };
  }
  return { ran: true, ok: true, label: trail.join(" → "), output: "" };
}
