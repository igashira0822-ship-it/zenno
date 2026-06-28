// projects.json の健全性チェック（穴Aの可視化）。
//   - path が実在するか（C:/F:/D: の実パスのみ。GAS等の "(GAS / クラウド)" はスキップ）
//   - last_verified が14日超なら要再検証（registry.ts の staleTag と同じ閾値）
//   - name/path 欠落・name 重複
// 使い方: npm run sync:check  （警告があれば exit 1）
import { existsSync } from "node:fs";
import { loadProjects } from "../src/registry.js";

const projects = loadProjects();
console.log(`projects.json: ${projects.length} 件をチェック\n`);

let warn = 0;
const now = Date.now();

for (const p of projects) {
  const issues: string[] = [];
  if (!p.name) issues.push("name 欠落");
  if (!p.path) issues.push("path 欠落");
  else if (/^[a-zA-Z]:[\\/]/.test(p.path) && !existsSync(p.path)) issues.push(`path 不在: ${p.path}`);

  if (!p.last_verified) issues.push("last_verified 不明");
  else {
    const t = new Date(p.last_verified + "T00:00:00").getTime();
    const days = Number.isNaN(t) ? NaN : Math.floor((now - t) / 86_400_000);
    if (Number.isNaN(days)) issues.push(`last_verified 不正: ${p.last_verified}`);
    else if (days > 14) issues.push(`要再検証 (${days}日前)`);
  }

  if (issues.length) {
    warn++;
    console.log(`  ⚠ ${p.name ?? "(無名)"}: ${issues.join(" / ")}`);
  }
}

const counts = new Map<string, number>();
for (const p of projects) {
  const k = (p.name ?? "").toLowerCase();
  counts.set(k, (counts.get(k) ?? 0) + 1);
}
for (const [n, c] of counts) {
  if (c > 1) {
    warn++;
    console.log(`  ⚠ name 重複: ${n} ×${c}`);
  }
}

console.log(warn === 0 ? "\n✅ 問題なし" : `\n— ${warn} 件の警告`);
process.exit(warn === 0 ? 0 : 1);
