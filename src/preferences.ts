import { readFileSync, writeFileSync } from "node:fs";
import { knowledgeReadPath, knowledgeWritePath } from "./knowledgePaths.js";

// 自己強化（核1の拡張）。
// projects.json は「プロジェクト固有の確定事実（path/stack/deploy/prod）」専用。
// このモジュールが扱う preferences.md は、それに乗らない横断知識:
//   - ユーザーの好み（作業スタイル）
//   - プロジェクトを跨ぐ技術ノウハウ
//   - ハマりどころ（gotcha）
//   - 手順（workflow）
// IGSH 起動時に常時前ロードし、IGSH 自身が remember ツールで append-only 追記する
// ＝「会話で学ぶ→自分で保存→次回起動で自分が前ロード」という自己強化ループの貯水池。

export type Category = "preference" | "note" | "gotcha" | "workflow";

// remember のカテゴリキー → preferences.md の見出し（完全一致が必須）。
const SECTION_BY_KEY: Record<Category, string> = {
  preference: "好み（ユーザーの作業スタイル）",
  note: "横断ノウハウ（プロジェクトを跨ぐ技術メモ）",
  gotcha: "固有の落とし穴（gotcha）",
  workflow: "ワークフロー（手順・段取り）",
};

// ファイルが無いとき用の最小テンプレ（見出しは SECTION_BY_KEY と一致させる）。
const INITIAL_TEMPLATE = `# IGSH 横断ナレッジ & ユーザー設定（preferences）

## ${SECTION_BY_KEY.preference}

## ${SECTION_BY_KEY.note}

## ${SECTION_BY_KEY.gotcha}

## ${SECTION_BY_KEY.workflow}
`;

/** 生のテキスト（無ければ空文字）。 */
export function loadPreferences(): string {
  try {
    return readFileSync(knowledgeReadPath("preferences.md"), "utf8");
  } catch {
    return "";
  }
}

/** Claude に常時注入する文脈ブロック（空なら注入しない）。 */
export function formatPreferencesContext(): string {
  const t = loadPreferences().trim();
  if (!t) return "";
  return (
    `\n\n--- 横断ナレッジ＆ユーザー設定（preferences・常時前ロード）---\n${t}\n` +
    `（この知識も古くなりうる。実コード・実環境と矛盾したら現物を優先し、その旨をユーザーに伝えること。）`
  );
}

const today = () => new Date().toISOString().slice(0, 10);

/** 新しい学びを該当セクションへ append-only で追記する。 */
export function appendMemory(
  category: Category,
  title: string,
  content: string,
  project?: string
): { ok: boolean; message: string } {
  const section = SECTION_BY_KEY[category];
  if (!section) return { ok: false, message: `不明なカテゴリ: ${category}` };

  let text: string;
  try {
    text = readFileSync(knowledgeReadPath("preferences.md"), "utf8");
  } catch {
    text = INITIAL_TEMPLATE;
  }

  const tag = project ? `（${project}）` : "";
  const line = `- [${today()}] **${title}**${tag} — ${content}`;
  const heading = `## ${section}`;
  const idx = text.indexOf(heading);

  if (idx === -1) {
    // 見出しごと末尾に新設
    text = text.replace(/\s*$/, "\n") + `\n${heading}\n${line}\n`;
  } else {
    // 見出し直下（次の "## " 見出しの手前）に挿入
    const after = idx + heading.length;
    const nextIdx = text.indexOf("\n## ", after);
    const insertAt = nextIdx === -1 ? text.length : nextIdx;
    const before = text.slice(0, insertAt).replace(/\s*$/, "");
    const rest = text.slice(insertAt);
    text = `${before}\n${line}\n${rest}`;
  }

  try {
    writeFileSync(knowledgeWritePath("preferences.md"), text, "utf8");
  } catch (e: any) {
    // 書込先は asar 外（userData/knowledge）へリダイレクト済みだが、念のため失敗は静かにしない。
    return { ok: false, message: `保存失敗（書き込み不可かも）: ${e?.message ?? String(e)}` };
  }
  return { ok: true, message: `保存しました【${section}】: ${title}（次回起動から前ロード）` };
}
