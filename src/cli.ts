// src/cli.ts — 端末REPL。engine を利用し、EngineEvent を ANSI色付き console.log へ。
// banner ASCIIアートと認証ガード（未設定でexit）は端末専用UIとしてここに残す。
import readline from "node:readline";
import { config } from "./config.js";
import { createEngine, type EngineEvent, type BannerInfo } from "./engine.js";

const c = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  magenta: "\x1b[35m",
  red: "\x1b[31m",
  gray: "\x1b[90m",
};

function banner(b: BannerInfo) {
  console.log(`${c.cyan}${c.bold}
  ██╗ ██████╗ ███████╗██╗  ██╗
  ██║██╔════╝ ██╔════╝██║  ██║
  ██║██║  ███╗███████╗███████║
  ██║██║   ██║╚════██║██╔══██║
  ██║╚██████╔╝███████║██║  ██║
  ╚═╝ ╚═════╝ ╚══════╝╚═╝  ╚═╝${c.reset}`);
  console.log(`${c.dim}  IGSH — Claude の頭脳に GPT / Gemini を合体した統合開発ターミナル${c.reset}\n`);
  const gpt = b.gpt ? `${c.green}●${c.reset}` : `${c.gray}○${c.reset}`;
  const gem = b.gemini ? `${c.green}●${c.reset}` : `${c.gray}○${c.reset}`;
  const budget = b.maxUsd ? `$${b.maxUsd}` : "無制限";
  console.log(
    `  ${c.dim}中核:${c.reset} Claude ${c.green}●${c.reset} (${b.model}・${b.authMode}・effort:${b.effort}${
      b.fast ? `・${c.yellow}⚡Fast${c.reset}` : ""
    })   ${c.dim}合体:${c.reset} GPT ${gpt}  Gemini ${gem}   ${c.dim}権限:${c.reset} ${b.permission}`
  );
  console.log(
    `  ${c.dim}安全網:${c.reset} 破壊ガード ${c.green}●ON${c.reset}  ${c.dim}検証:${c.reset} ${b.verify}  ` +
      `${c.dim}予算:${c.reset} ${budget}  ${c.dim}設定:${c.reset} project/local CLAUDE.md`
  );
  console.log(
    `  ${c.dim}現在地:${c.reset} ` +
      (b.here ? `${c.green}${b.here}${c.reset}（固有知識を前ロード）` : `${c.gray}登録プロジェクト外${c.reset}`)
  );
  console.log(`  ${c.dim}コマンド: /help /undo /cost /verify /model /projects ・終了 exit${c.reset}\n`);
}

if (!config.anthropicKey && !config.oauthToken) {
  console.error(`${c.red}${c.bold}認証が未設定です。${c.reset}
ZENNO の頭脳（Claude）を動かすには認証が要ります。2通りあります。

${c.green}${c.bold}【おすすめ】サブスクで動かす（追加課金ゼロ）${c.reset}
  Claude Pro/Max を契約していれば、API の従量課金なしで動きます。
  1. ターミナルで:  ${c.bold}claude setup-token${c.reset}   （年1回・ブラウザでログイン）
  2. 出たトークンを .env に:  ${c.bold}CLAUDE_CODE_OAUTH_TOKEN=...${c.reset}
  3. もう一度 npm start

${c.dim}【別案】API キーで動かす（従量課金・サブスクとは別請求）
  https://console.anthropic.com/ で発行し .env に:  ANTHROPIC_API_KEY=sk-ant-...${c.reset}`);
  process.exit(1);
}

function main() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  const print = (e: EngineEvent) => {
    switch (e.type) {
      case "assistant_text":
        console.log(`\n${c.magenta}${c.bold}IGSH ›${c.reset} ${e.text}\n`);
        break;
      case "tool_use":
        console.log(`${c.dim}  ⚙ ${e.name}${c.reset}`);
        break;
      case "file_edit": {
        console.log(`${c.cyan}  ✎ ${e.tool}${c.reset} ${c.dim}${e.path}${c.reset}`);
        for (const l of e.removed) console.log(`${c.red}    - ${l}${c.reset}`);
        for (const l of e.added) console.log(`${c.green}    + ${l}${c.reset}`);
        if (e.note) console.log(`${c.gray}    (${e.note})${c.reset}`);
        break;
      }
      case "model_refusal_fallback":
        console.log(
          `${c.yellow}  ⤷ モデル拒否 → ${e.fallback_model} へ自動退避（分類: ${e.api_refusal_category}）${c.reset}`
        );
        break;
      case "checkpoint":
        console.log(`${c.gray}  ⎌ チェックポイント #${e.id}（/undo で戻せます）${c.reset}`);
        break;
      case "verify":
        if (e.ok) console.log(`${c.green}  ✓ 検証OK（${e.label}）${c.reset}`);
        else
          console.log(
            `${c.yellow}⚠ 検証警告（${e.label}）— 直近の編集で問題が出ています:${c.reset}\n${e.output}\n` +
              `${c.dim}（/undo で巻き戻し、または続けて修正を指示してください）${c.reset}`
          );
        break;
      case "turn_result": {
        const cost =
          typeof e.total_cost_usd === "number"
            ? `  ${c.dim}($${e.total_cost_usd.toFixed(4)})${c.reset}`
            : "";
        console.log(`${c.gray}  ── ターン完了${cost}${c.reset}`);
        break;
      }
      case "slash_output":
        console.log("\n" + e.text + "\n");
        break;
      case "status":
        if (e.status === "idle") promptUser();
        break;
      case "error":
        console.error(`\n${c.red}エラー: ${e.message}${c.reset}`);
        break;
    }
  };

  const engine = createEngine({ cwd: process.cwd(), onEvent: print });
  banner(engine.bannerInfo());

  function promptUser() {
    rl.question(`${c.cyan}${c.bold}あなた ›${c.reset} `, async (line) => {
      try {
        const t = line.trim();
        if (t.length === 0) return promptUser();
        if (t.startsWith("/") || ["exit", "quit", ":q"].includes(t.toLowerCase())) {
          const cont = await engine.runSlash(t);
          if (cont) promptUser();
          else {
            rl.close();
            process.exit(0);
          }
          return;
        }
        engine.sendUserMessage(t);
      } catch (e: any) {
        console.error(`${c.red}入力処理エラー: ${e?.message ?? String(e)}${c.reset}`);
        promptUser();
      }
    });
  }

  rl.on("close", () => console.log(`\n${c.dim}またね。${c.reset}`));
  promptUser();
}

main();
