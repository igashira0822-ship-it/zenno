import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

// 実行道具（核4）: Vercel デプロイ。導入済みの vercel CLI を spawn する薄いラッパー。
// 安全設計（ユーザー合意）:
//   - preview デプロイは即実行（本番に影響しない）
//   - prod デプロイは「不可逆破壊」ではない（再デプロイ/ロールバック可）ので破壊ガードでは止めない
//   - 代わりに confirm:true が無い限り実行せず警告だけ返す2段構え＝自律実行の暴走だけ止める

export type DeployOptions = {
  dir?: string;
  prod?: boolean;
  confirm?: boolean;
};

export function vercelDeploy(o: DeployOptions): { ok: boolean; message: string; url?: string } {
  const dir = o.dir ?? process.cwd();
  if (!existsSync(dir)) return { ok: false, message: `対象フォルダがありません: ${dir}` };

  const prod = o.prod === true;

  // 2段構え: 本番は confirm 必須
  if (prod && o.confirm !== true) {
    return {
      ok: false,
      message:
        `⚠ 本番デプロイ(--prod)です。対象: ${dir}\n` +
        `実行するには confirm:true を付けて再度呼んでください。` +
        `直前に「差分・ビルド成否・デプロイ先プロジェクト」を必ず確認すること。`,
    };
  }

  const cmd = ["vercel", ...(prod ? ["--prod"] : []), "--yes"].join(" ");
  const res = spawnSync(cmd, {
    cwd: dir,
    shell: true, // Windows で vercel.cmd を解決。引数は固定文字列でユーザー入力を混ぜない（インジェクション無し）
    encoding: "utf8",
    timeout: 180_000,
  });

  if (res.error) {
    const m =
      (res.error as NodeJS.ErrnoException).code === "ENOENT"
        ? "vercel CLI が見つかりません（`npm i -g vercel` か、プロジェクトに導入してください）"
        : res.error.message;
    return { ok: false, message: `vercel 実行失敗: ${m}` };
  }

  const out = `${res.stdout ?? ""}${res.stderr ?? ""}`;
  const url = out.match(/https:\/\/[^\s]+\.vercel\.app/g)?.pop();

  if (res.status !== 0) {
    return { ok: false, message: `vercel がエラー終了 (code ${res.status}):\n${out.slice(-1500)}` };
  }
  return {
    ok: true,
    message: `${prod ? "本番" : "プレビュー"}デプロイ完了${url ? `: ${url}` : ""}\n${out.slice(-600)}`,
    url,
  };
}
