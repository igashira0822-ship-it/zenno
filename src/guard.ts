import type { HookCallback } from "@anthropic-ai/claude-agent-sdk";

// 全許可(bypassPermissions)でも「破壊コマンドだけ」を止める安全網。
// PreToolUse フックは権限モードに関わらず発火する → 全許可の快適さを壊さず
// 最悪ケースだけ消せる（設計図 核2）。
//
// 重要(設計図の指摘):
//  - 拒否は permissionDecision:'deny'（decision:'block' はStop系で確実に発火しない）
//  - シェル系ツールの command 文字列だけを検査（Read 等は触らない＝誤爆防止）
//  - Windows/PowerShell系 と POSIX系 の二系統＋OS共通を網羅

type Rule = { re: RegExp; why: string };

// OS共通（可搬な破壊）
const PORTABLE: Rule[] = [
  { re: /\bgit\s+push\b[^\n]*--force(?!-with-lease)\b/i, why: "git push --force（履歴破壊）" },
  { re: /\bgit\s+push\b[^\n]*\s-f(\s|$)/i, why: "git push -f（履歴破壊）" },
  { re: /\bgit\s+reset\s+--hard\b/i, why: "git reset --hard（作業破棄）" },
  { re: /\bgit\s+clean\s+-[a-z]*f/i, why: "git clean -f（未追跡ファイル削除）" },
  { re: /\bsupabase\s+db\s+reset\b/i, why: "supabase db reset（DB全消し）" },
  { re: /\bDROP\s+(TABLE|DATABASE|SCHEMA)\b/i, why: "SQL DROP（テーブル/DB削除）" },
  { re: /\bTRUNCATE\s+TABLE\b/i, why: "SQL TRUNCATE（全行削除）" },
];

// POSIX / bash 系
const POSIX: Rule[] = [
  { re: /\brm\s+(-[a-z]*r[a-z]*f|-[a-z]*f[a-z]*r|-r\s+-f|-f\s+-r)/i, why: "rm -rf（再帰強制削除）" },
  { re: /\bmkfs\.?\w*/i, why: "mkfs（フォーマット）" },
  { re: /\bdd\b[^\n]*\bof=\/dev\//i, why: "dd of=/dev/...（ディスク直書き）" },
  { re: />\s*\/dev\/(sd|nvme|hd)/i, why: "ブロックデバイスへの上書き" },
  { re: /:\s*\(\s*\)\s*\{\s*:\s*\|\s*:/, why: "fork bomb" },
  { re: /\bchmod\s+-R\s+0{3,4}\s+\//, why: "chmod -R 000 /（権限破壊）" },
];

// Windows / PowerShell 系（本人の主環境）
const WINDOWS: Rule[] = [
  { re: /\bRemove-Item\b[^\n]*-Recurse\b[^\n]*-Force\b/i, why: "Remove-Item -Recurse -Force（再帰強制削除）" },
  { re: /\bRemove-Item\b[^\n]*-Force\b[^\n]*-Recurse\b/i, why: "Remove-Item -Force -Recurse（再帰強制削除）" },
  { re: /\b(rd|rmdir)\s+\/s\b/i, why: "rd /s（再帰削除）" },
  { re: /\bdel\s+\/[a-z\s/]*s\b/i, why: "del /s（再帰削除）" },
  { re: /\bformat\s+[a-z]:/i, why: "format ドライブ" },
  { re: /\bFormat-Volume\b/i, why: "Format-Volume（フォーマット）" },
  { re: /\bClear-Disk\b/i, why: "Clear-Disk（ディスク消去）" },
  { re: /\bdiskpart\b/i, why: "diskpart（パーティション操作）" },
];

const ALL: Rule[] = [...PORTABLE, ...POSIX, ...WINDOWS];

function extractShellCommand(toolName: string, toolInput: unknown): string | null {
  if (!toolInput || typeof toolInput !== "object") return null;
  const name = toolName.toLowerCase();
  const isShell =
    name.includes("bash") ||
    name.includes("powershell") ||
    name.includes("shell") ||
    name.includes("exec");
  if (!isShell) return null;
  const cmd = (toolInput as Record<string, unknown>).command;
  return typeof cmd === "string" ? cmd : null;
}

export const destructiveGuard: HookCallback = async (input) => {
  if (input.hook_event_name !== "PreToolUse") return { continue: true };

  const cmd = extractShellCommand(input.tool_name, input.tool_input);
  if (!cmd) return { continue: true };

  for (const rule of ALL) {
    if (rule.re.test(cmd)) {
      return {
        systemMessage: `🛡 ZENNOガード: 破壊的コマンドをブロックしました（${rule.why}）`,
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "deny",
          permissionDecisionReason:
            `ZENNOの安全網がブロックしました: ${rule.why}。` +
            `本当に必要なら、自分の手で直接実行してください（自律実行では止めます）。`,
        },
      };
    }
  }
  return { continue: true };
};
