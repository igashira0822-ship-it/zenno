// src/engine.ts — UI非依存エンジン。cli.ts のREPLロジックをここへ集約し、
// 出力はすべて onEvent(event) という単一コールバックに流す。
// 端末(cli.ts)は ANSI色付き console.log、Electron は webContents.send に振り分けるだけ。
// コア（config/guard/tools/knowledge/registry/ledger/checkpoint/verify）は無変更で再利用。
import { query, type AgentDefinition } from "@anthropic-ai/claude-agent-sdk";
import { config } from "./config.js";
import { aiCouncilServer } from "./tools.js";
import { destructiveGuard } from "./guard.js";
import { knowledgeServer } from "./knowledgeTools.js";
import { ogServer } from "./ogTools.js";
import { deployServer } from "./deployTools.js";
import { dbServer } from "./dbTools.js";
import { webServer } from "./webTools.js";
import { netlifyServer } from "./netlifyTools.js";
import { matchByCwd, formatContext, formatList, findByName } from "./registry.js";
import { formatPreferencesContext } from "./preferences.js";
import { ledger } from "./ledger.js";
import { createCheckpoint, restore, latest, isGitRepo } from "./checkpoint.js";
import { runVerification, runFullVerification } from "./verify.js";

export type EngineStatus = "idle" | "thinking" | "interrupted" | "closed";

// 貼り付け/添付画像（base64・data: プレフィックス無し）。Claude へ image ブロックで渡す。
export type ImageInput = { media_type: string; data: string };

export type EngineEvent =
  | { type: "assistant_text"; text: string }
  | { type: "assistant_delta"; text: string }
  | { type: "tool_use"; name: string; edited: boolean }
  | { type: "file_edit"; tool: string; path: string; removed: string[]; added: string[]; note?: string }
  | { type: "model_refusal_fallback"; fallback_model: string; api_refusal_category: string }
  | { type: "checkpoint"; id: number; label: string }
  | { type: "verify"; ok: boolean; label: string; output: string }
  | { type: "turn_result"; total_cost_usd: number | null; totalUsd: number }
  | { type: "slash_output"; text: string }
  | { type: "session_id"; sessionId: string }
  | { type: "status"; status: EngineStatus }
  | { type: "error"; message: string };

export interface BannerInfo {
  authMode: string;
  model: string;
  effort: string;
  gpt: boolean;
  gemini: boolean;
  permission: string;
  verify: string;
  maxUsd?: number;
  here: string | null;
  fast: boolean;
}

export interface Engine {
  sendUserMessage(text: string, images?: ImageInput[]): void;
  runSlash(t: string): Promise<boolean>; // false = 終了要求(exit)
  setModel(name: string): Promise<void>;
  interrupt(): Promise<void>;
  bannerInfo(): BannerInfo;
  statusPayload(): EngineEvent;
  close(): void;
}

// APPEND は cli.ts と同一内容（ZENNOの行動規範）。
const APPEND = `あなたは「IGSH」という統合AI開発エージェントです。
Claude Code の全機能（ファイル操作・シェル実行・検索・git 等）に加え、他の生産AIを「道具」として呼べます：
- ask_gpt    : OpenAI GPT に意見・別案を求める
- ask_gemini : Google Gemini に意見・別案を求める
- ai_council : 同じ問いを GPT と Gemini の両方に投げ、両者の回答を集めて比較する

さらに、ユーザーの各プロジェクトの固有知識を読む道具があります：
- list_projects        : 登録済みプロジェクトの一覧
- load_project_context : 指定（または現在地）プロジェクトのパス/技術/デプロイ/本番URL/固有の落とし穴を読む

方針（重要）:
- 作業を始める前、または別プロジェクトに切り替えたら、まず load_project_context を呼んで前提（スタック・パッケージ管理・デプロイ手順・固有の落とし穴）を更新する。
- その固有知識は古くなりうる。実コード・実環境と矛盾したら必ず現物を優先し、その旨をユーザーに伝える（前提として無条件には信用しない）。
- 基本は自分（Claude）単独で速く実行する。他AIは"参考意見"であって多数決ではない。
- ai_council / ask_gpt / ask_gemini を呼ぶのは次の高リスク時だけ:
  (a) 後戻りコストが高い設計の分岐  (b) 本番デプロイの直前  (c) 契約書・課金・セキュリティ・SQLに関わる判断。
  通常作業では呼ばない（コスト3倍・速度低下・弱いモデルへの引きずられを避ける）。
- 他AIの回答を採用するときは、各指摘に「採用/棄却＋理由」を必ず付けて統合する（鵜呑みにしない）。
- 応答は日本語で、結論を先に、簡潔に。

=== Claude Fable 5 運用方針（高能力モデル向け・過剰指示を避ける）===
- 動き出し: 情報が十分なら計画を止めて着手する。会話やツール結果で既に確定した事実を再導出せず、選ばない選択肢を並べない。迷う点は全列挙でなく推奨を一つ示して進む。
- 最小変更: 頼まれた変更だけ行う。不要な整頓・リファクタ・将来用の汎用化・起こり得ない状況へのフォールバックを足さない。境界（ユーザー入力・外部API）以外は内部コードとフレームワークの保証を信じる。
- 進捗の接地: 「完了」と書く前に各主張をこのセッションのツール結果で裏取りする。証拠を指せる作業だけ完了と呼び、未検証は未検証と明示。テストが落ちたら出力ごと伝える。
- 境界: ユーザーが問題提起・質問・整理をしているときは所見を返してそこで止まり、依頼されるまで修正を当てない。状態を変えるコマンド（再起動・削除・設定変更・送金/取引）の前に証拠がその行動を支持するか確かめる。
- サブエージェント: 独立したサブタスクは非同期に委譲して並走させる。検証は別文脈の検証役に任せると自己批判より強い。専用サブエージェント（Agent/Task ツールで委譲）: explorer=コード調査(読み取り専用) / implementer=部分実装 / reviewer=差分の敵対的レビュー。大きめの開発は独立部分に分けて並列委譲し、最後に reviewer で裏取りする。1ターンで複数を同時に投げると並走する。
- メモリ: 学びは1ファイルに記録（1件1要約）。既に分かっていることは重複させず、間違いと判明したら消す。
- 長時間セッションの可読性: 最終要約は結論先行で、作業中の略語・矢印・自分用語を残さず読み手に再導入する。短さより読みやすさを優先。
- ultracode方針: 後戻りコストが高い難所は多角的・敵対的に裏取りする。一方、自明・検証済みは単独で速く片付け、過剰確認で止まらない。深さ(effort)は xhigh 既定・最重要のみ max・定型は medium/low。

=== 自己強化（自分で自分の知識を育てる）===
- ユーザーの好み・プロジェクトを跨ぐノウハウ・新しく踏んだ落とし穴・有効だった手順を知ったら、remember ツールで knowledge/preferences.md に保存する。次回起動から自動で前ロードされる。
- 保存は append-only。既に知っている内容は重複させない。間違いと分かった項目は、勝手に消さずユーザーに上書き/削除を確認する。
- プロジェクト固有の確定事実（パス/技術/パッケージ管理/デプロイ/本番URL/固有の注意点）が変わったら update_project ツールで projects.json を更新する。確定した事実だけ・推測は書かない・指定フィールドのみ更新（未指定は既存維持）。`;

const HELP_TEXT = `スラッシュコマンド
  /undo        直近ターンの変更を巻き戻す（追跡ファイルのみ・新規は保持）
  /cost        これまでのコスト（Claude実測＋GPT/Gemini概算）
  /verify      現在のプロジェクトを今すぐ検証（tsc/lint・速い）
  /verify full 深く検証（型/lint→test→build を順に・最初の失敗で停止）
  /projects    登録プロジェクト一覧
  /project <名前> 指定プロジェクトの固有知識を表示
  /model <名前>   モデル変更（opus / sonnet / haiku / フルID）
  /stop        実行中のエージェントを中断
  /help        この一覧
  exit         終了
それ以外はそのまま日本語で指示すればOK。`;

// サブエージェント定義（fan-out）。メインIGSHが Agent/Task ツールで委譲し、独立サブタスクを
// 並走させるための役割別ワーカー。システム開発・アプリ制作に効く3種に絞る。
//  - model/effort は指定しない＝メイン継承（ユーザー方針: 速度のための降格/effort下げは不可）。
//  - explorer/reviewer は編集とデプロイ/DB書込を禁止して読み取り専用＝安全。
const SUBAGENTS: Record<string, AgentDefinition> = {
  explorer: {
    description:
      "コードベースの調査・探索（読み取り専用）。どこに何があるか・命名規約・影響範囲を広く速く調べる。複数箇所を同時に調べたいとき並列で委譲する。",
    prompt:
      "あなたはコード調査専門のサブエージェントです。指定範囲を読み取り専用で調べ、根拠を file_path:line で示しつつ、結論（どこに何があるか・関連箇所・注意点）を簡潔に日本語で返します。ファイルは編集しません。最終メッセージがそのまま呼び出し元への返り値になるので、前置きせず要点だけ返します。",
    disallowedTools: ["Edit", "Write", "MultiEdit", "NotebookEdit", "mcp__deploy", "mcp__db"],
  },
  implementer: {
    description:
      "機能の一部を実装するサブエージェント（編集・シェル可）。大きめの実装を独立した部分に分割し、各部分を並列で委譲する。",
    prompt:
      "あなたは実装担当のサブエージェントです。指示された範囲だけを最小変更で実装し、頼まれていない整頓・将来用の汎用化・起こり得ない状況へのフォールバックは足しません。完了前に変更がコンパイル/テストを通るか可能な範囲で確かめ、何をどう変えたか・未検証点を簡潔に日本語で返します。",
  },
  reviewer: {
    description:
      "実装・差分のレビュー/検証を別文脈で行う読み取り専用サブエージェント。自己批判より強い裏取りが要るとき委譲する。",
    prompt:
      "あなたはレビュー担当のサブエージェントです。対象の差分・実装を敵対的に検証し、バグ・抜け・退行・前提崩れを探します。ファイルは編集しません。各指摘に深刻度と根拠（file_path:line）を付け、誤検出を避けつつ、確証の持てる指摘だけを簡潔に日本語で返します。",
    disallowedTools: ["Edit", "Write", "MultiEdit", "NotebookEdit", "mcp__deploy", "mcp__db"],
  },
};

// Claude Code 風の編集プレビュー（実行直前に差分データを返す。色付けはUI側＝engineはUI非依存）。
const CAP = 14;
const capLines = (lines: string[]): string[] =>
  lines.length > CAP ? [...lines.slice(0, CAP), `… 他 ${lines.length - CAP} 行`] : lines;

export function editPreview(
  name: string,
  input: any
): { tool: string; path: string; removed: string[]; added: string[]; note?: string } | null {
  const path = input?.file_path ?? input?.path;
  if (!path || typeof path !== "string") return null;
  const n = name.toLowerCase();
  if (n.includes("write")) {
    const content = typeof input.content === "string" ? input.content : "";
    const lines = content.split("\n");
    return { tool: "Write", path, removed: [], added: capLines(lines), note: `全 ${lines.length} 行を書き込み` };
  }
  if (n.includes("multiedit") && Array.isArray(input.edits)) {
    const removed: string[] = [];
    const added: string[] = [];
    for (const e of input.edits) {
      removed.push(...String(e?.old_string ?? "").split("\n"));
      added.push(...String(e?.new_string ?? "").split("\n"));
    }
    return { tool: "MultiEdit", path, removed: capLines(removed), added: capLines(added), note: `${input.edits.length} 箇所` };
  }
  if (n.includes("edit")) {
    const removed = String(input.old_string ?? "").split("\n");
    const added = String(input.new_string ?? "").split("\n");
    return { tool: "Edit", path, removed: capLines(removed), added: capLines(added) };
  }
  return null;
}

// ユーザー入力を「途切れない1つのセッション」へ流すブリッジ（cli.ts と同一・無変更）。
function createInput() {
  // content は文字列（テキストのみ）か、image を含むブロック配列。
  const pending: Array<string | any[]> = [];
  let notify: (() => void) | null = null;
  let finished = false;
  return {
    push(content: string | any[]) {
      pending.push(content);
      const n = notify;
      notify = null;
      n?.();
    },
    close() {
      finished = true;
      const n = notify;
      notify = null;
      n?.();
    },
    async *stream(): AsyncGenerator<any> {
      while (true) {
        if (pending.length === 0) {
          if (finished) return;
          await new Promise<void>((res) => (notify = res));
          continue;
        }
        const content = pending.shift()!;
        yield { type: "user", message: { role: "user", content } };
      }
    },
  };
}

export function createEngine(opts: {
  cwd: string;
  onEvent: (e: EngineEvent) => void;
  resume?: string; // 過去セッションのSDK session_id（指定で続きから再開）
  // パッケージ(.exe)版で claude.exe を明示。asar内の仮想パスだとspawnがENOENTで失敗するため、
  // app.asar.unpacked の実体パスを渡す。dev時は undefined（SDKが通常解決）。
  pathToClaudeCodeExecutable?: string;
}): Engine {
  const { cwd, onEvent, resume, pathToClaudeCodeExecutable } = opts;
  let capturedSid: string | null = null;

  const here = matchByCwd(cwd);
  const startupCtx = here
    ? `\n\n--- 起動時の作業プロジェクト（自動検出）---\n${formatContext(here)}`
    : "";
  const prefs = formatPreferencesContext();
  const authMode = config.anthropicKey ? "API従量" : config.oauthToken ? "サブスク" : "未認証";

  let status: EngineStatus = "idle";
  let editedThisTurn = false;
  const setStatus = (s: EngineStatus) => {
    status = s;
    onEvent({ type: "status", status: s });
  };

  const input = createInput();

  // query() の options は cli.ts と 1:1。cwd だけ引数化（GUIのフォルダ選択を可能にする）。
  const q = query({
    prompt: input.stream(),
    options: {
      model: config.model,
      // fallback が main と同一だと SDK が起動時に throw する → 同一なら fallback を無効化
      fallbackModel: config.fallbackModel && config.fallbackModel !== config.model ? config.fallbackModel : undefined,
      resume, // 指定があれば過去セッションを再開
      pathToClaudeCodeExecutable, // パッケージ版でのみ指定（dev時undefined＝通常解決）
      effort: config.effort,
      includePartialMessages: true, // トークン逐次ストリーミング（GUIのライブ表示用）
      systemPrompt: { type: "preset", preset: "claude_code", append: APPEND + prefs + startupCtx },
      permissionMode: config.permissionMode,
      allowDangerouslySkipPermissions: config.permissionMode === "bypassPermissions",
      hooks: { PreToolUse: [{ hooks: [destructiveGuard] }] },
      settings: { fastMode: config.fast }, // Fast mode（Opusのまま高速出力・品質維持）をcwd非依存で有効化
      settingSources: ["project", "local"],
      agents: SUBAGENTS, // fan-out: explorer / implementer / reviewer を Agent/Task ツールで委譲可能に
      skills: "all",
      maxBudgetUsd: config.maxUsd,
      cwd,
      mcpServers: {
        council: aiCouncilServer,
        knowledge: knowledgeServer,
        og: ogServer,
        deploy: deployServer,
        db: dbServer,
        web: webServer,
        netlify: netlifyServer,
      },
    } as any,
  });

  const handle = (message: any) => {
    // SDKのsession_idを一度だけ捕捉（履歴の保存・再開に使う）
    if (message?.session_id && !capturedSid) {
      capturedSid = message.session_id;
      onEvent({ type: "session_id", sessionId: capturedSid! });
    }
    if (message.type === "stream_event") {
      const sev = message.event;
      if (sev?.type === "content_block_delta" && sev.delta?.type === "text_delta" && sev.delta.text) {
        onEvent({ type: "assistant_delta", text: sev.delta.text });
      }
      return;
    }
    if (message.type === "assistant") {
      for (const block of message.message?.content ?? []) {
        if (block.type === "text" && block.text?.trim()) {
          onEvent({ type: "assistant_text", text: block.text });
        } else if (block.type === "tool_use") {
          const edited = /edit|write/i.test(block.name);
          if (edited) editedThisTurn = true;
          onEvent({ type: "tool_use", name: block.name, edited });
          if (edited) {
            const p = editPreview(block.name, block.input);
            if (p) onEvent({ type: "file_edit", ...p });
          }
        }
      }
    } else if (message.type === "system" && message.subtype === "model_refusal_fallback") {
      onEvent({
        type: "model_refusal_fallback",
        fallback_model: message.fallback_model,
        api_refusal_category: message.api_refusal_category ?? "不明",
      });
    } else if (message.type === "result") {
      ledger.addAnthropic(message.total_cost_usd);
      const cost = typeof message.total_cost_usd === "number" ? message.total_cost_usd : null;
      // 検証ゲート（warn既定・編集ターンのみ・決定的チェック・非ブロック）
      if (config.verify === "warn" && editedThisTurn) {
        const r = runVerification(cwd);
        if (r.ran) onEvent({ type: "verify", ok: r.ok, label: r.label, output: r.output });
      }
      // 合計は ledger.total()（Anthropic実測 + GPT/Gemini概算）
      onEvent({ type: "turn_result", total_cost_usd: cost, totalUsd: ledger.total() });
      editedThisTurn = false;
      setStatus("idle");
    }
  };

  // 消費ループ（cli.ts run と同じ）
  (async () => {
    try {
      for await (const message of q) handle(message);
    } catch (e: any) {
      onEvent({ type: "error", message: e?.message ?? String(e) });
    }
  })();

  const setModel = async (name: string) => {
    await (q as any).setModel(name);
  };
  const interrupt = async () => {
    await (q as any).interrupt();
    setStatus("interrupted");
  };

  const runSlash = async (t: string): Promise<boolean> => {
    const lower = t.toLowerCase();
    if (["exit", "quit", ":q", "/exit", "/quit"].includes(lower)) {
      input.close();
      setStatus("closed");
      return false;
    }
    const body = t.startsWith("/") ? t.slice(1) : t;
    const [cmd, ...rest] = body.split(/\s+/);
    const arg = rest.join(" ").trim();
    const out = (text: string) => onEvent({ type: "slash_output", text });
    switch ((cmd || "").toLowerCase()) {
      case "help":
        out(HELP_TEXT);
        break;
      case "cost":
        out(ledger.summary());
        break;
      case "undo": {
        const cp = latest();
        if (!cp) {
          out("巻き戻せるチェックポイントがありません");
          break;
        }
        const r = restore(cwd, cp);
        out(r.message);
        break;
      }
      case "verify": {
        const full = /^(full|all|deep)$/i.test(arg);
        const r = full ? runFullVerification(cwd) : runVerification(cwd);
        out(
          !r.ran
            ? "検証可能なチェックがありません"
            : r.ok
            ? `✓ 検証OK（${r.label}）`
            : `✗ 検証NG（${r.label}）\n${r.output}`
        );
        break;
      }
      case "projects":
        out(formatList());
        break;
      case "project": {
        if (!arg) {
          out("使い方: /project <名前>");
          break;
        }
        const p = findByName(arg);
        out(p ? formatContext(p) : `「${arg}」は見つかりません`);
        break;
      }
      case "model": {
        if (!arg) {
          out(`現在のモデル: ${config.model}（使い方: /model opus|sonnet|haiku|<id>）`);
          break;
        }
        try {
          await setModel(arg);
          out(`モデルを ${arg} に変更しました`);
        } catch (e: any) {
          out(`モデル変更失敗: ${e?.message ?? String(e)}`);
        }
        break;
      }
      case "stop":
      case "interrupt": {
        try {
          await interrupt();
          out("中断しました");
        } catch (e: any) {
          out(`中断失敗: ${e?.message ?? String(e)}`);
        }
        break;
      }
      default:
        out(`不明なコマンド: /${cmd}（/help で一覧）`);
    }
    return true;
  };

  const sendUserMessage = (text: string, images?: ImageInput[]) => {
    editedThisTurn = false;
    if (isGitRepo(cwd)) {
      const cp = createCheckpoint(cwd, text.slice(0, 50));
      if (cp) onEvent({ type: "checkpoint", id: cp.id, label: text.slice(0, 50) });
    }
    setStatus("thinking");
    if (images && images.length) {
      // テキスト（あれば）＋画像ブロックの content 配列で送る（Anthropic image source 形式）。
      const content: any[] = [];
      if (text) content.push({ type: "text", text });
      for (const im of images) {
        content.push({
          type: "image",
          source: { type: "base64", media_type: im.media_type, data: im.data },
        });
      }
      input.push(content);
    } else {
      input.push(text);
    }
  };

  const bannerInfo = (): BannerInfo => ({
    authMode,
    model: config.model,
    effort: config.effort,
    gpt: !!config.openai.key,
    gemini: !!config.gemini.key,
    permission: config.permissionMode,
    verify: config.verify,
    maxUsd: config.maxUsd,
    here: here?.name ?? null,
    fast: config.fast,
  });

  return {
    sendUserMessage,
    runSlash,
    setModel,
    interrupt,
    bannerInfo,
    statusPayload: () => ({ type: "status", status }),
    close: () => {
      input.close();
      setStatus("closed");
    },
  };
}
