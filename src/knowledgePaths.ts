import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// 知識ファイル（projects.json / preferences.md）の読み書き先を解決する単一の真実源。
//
// 問題: registry.ts / preferences.ts は元々 new URL("../knowledge/...", import.meta.url) で
//   ソース隣の knowledge/ を直接読み書きしていた。これは dev(`npm start` / tsx)では正しいが、
//   パッケージ(.exe)版では knowledge が app.asar 内＝読み取り専用になり、自己強化
//   （remember / update_project）の書き込みが必ず失敗する。
//
// 解決: 「バンドルされた読み取り専用シード」と「書き込み可能な実体」を分離する。
//   - SEED_DIR     : import.meta.url 基準（dev=リポジトリ knowledge/、.exe=app.asar 内 knowledge/）。
//   - writableDir(): ZENNO_KNOWLEDGE_DIR があればそこ（Electron main がパッケージ時に
//                    <userData>/knowledge を渡す）、無ければ SEED_DIR（dev / CLI は従来どおり）。
//   読み取りは「書込先に実体があればそれ／無ければシード」、書き込みは常に書込先。
//   これで初回書き込み時にシード内容を引き継ぎつつ、以降はユーザーの自己強化が勝つ。

const SEED_DIR = fileURLToPath(new URL("../knowledge/", import.meta.url));

function writableDir(): string {
  const o = process.env.ZENNO_KNOWLEDGE_DIR?.trim();
  return o ? o : SEED_DIR;
}

/** 読み取りに使う実パス：書込先に実体があればそれ、無ければバンドルのシード。 */
export function knowledgeReadPath(fileName: string): string {
  const w = join(writableDir(), fileName);
  return existsSync(w) ? w : join(SEED_DIR, fileName);
}

/** 書き込みに使う実パス：書込先ディレクトリを用意して返す（asar 外＝書込可）。 */
export function knowledgeWritePath(fileName: string): string {
  const dir = writableDir();
  try {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  } catch {
    // mkdir 失敗時もパスは返す（呼び出し側の writeFileSync が捕捉してメッセージ化する）
  }
  return join(dir, fileName);
}
