import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

// 実行道具（核5）: Netlify デプロイ。導入済みの netlify CLI を spawn する薄いラッパー（deploy.ts と同設計）。
// 安全設計（ユーザー合意・vercel と同じ2段構え）:
//   - 既定はドラフト(プレビュー)デプロイ＝即実行（本番に影響しない）
//   - prod デプロイは confirm:true が無い限り実行せず警告だけ返す＝自律実行の暴走だけ止める
// 罠回避: zip 圧縮を一切しない。netlify CLI が dir を直接アップロードするので、
//   「PowerShell Compress-Archive の zip がバックスラッシュ区切りで Netlify Drop を真っ白に壊す」罠を構造的に踏まない。
// コマンドはユーザー入力を混ぜない固定文字列＋cwd 指定（インジェクション無し・deploy.ts と同流儀）。

export type NetlifyDeployOptions = {
  dir?: string;
  prod?: boolean;
  confirm?: boolean;
};

export function netlifyDeploy(o: NetlifyDeployOptions): { ok: boolean; message: string; url?: string } {
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
        `直前に「publishフォルダ・ビルド成否・対象サイト(netlify.toml/リンク)」を必ず確認すること。\n` +
        `※ zip圧縮は行いません（netlify CLI が直接アップロード＝Compress-Archive の zip 破壊罠を回避）。`,
    };
  }

  // publish フォルダは netlify.toml / リンク設定に従う（vercel と同じく cwd ベース・パスをコマンドに混ぜない）。
  const cmd = ["netlify", "deploy", ...(prod ? ["--prod"] : []), "--json"].join(" ");
  const res = spawnSync(cmd, {
    cwd: dir,
    shell: true, // Windows で netlify.cmd を解決。引数は固定文字列でユーザー入力を混ぜない（インジェクション無し）
    encoding: "utf8",
    timeout: 300_000,
  });

  if (res.error) {
    const m =
      (res.error as NodeJS.ErrnoException).code === "ENOENT"
        ? "netlify CLI が見つかりません（`npm i -g netlify-cli` で導入し、`netlify login` と `netlify link` を済ませてください）"
        : res.error.message;
    return { ok: false, message: `netlify 実行失敗: ${m}` };
  }

  const out = `${res.stdout ?? ""}${res.stderr ?? ""}`;
  // --json 出力からURLを拾う（無ければ netlify.app のURLを総当りで）。
  const url =
    out.match(/"(?:deploy_ssl_url|ssl_url|deploy_url|url)":\s*"([^"]+)"/)?.[1] ??
    out.match(/https:\/\/[^\s"]+\.netlify\.app/g)?.pop();

  if (res.status !== 0) {
    return { ok: false, message: `netlify がエラー終了 (code ${res.status}):\n${out.slice(-1500)}` };
  }
  return {
    ok: true,
    message: `${prod ? "本番" : "ドラフト"}デプロイ完了${url ? `: ${url}` : ""}\n${out.slice(-600)}`,
    url,
  };
}
