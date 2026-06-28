// electron/start.cjs — Electronメインのブートストラップ。
// パッケージ(.exe)版: tsc済みの main.js が隣にあれば tsx 無しで直接読む（devDepsは同梱されない）。
// 開発版: main.ts しか無いので tsx の ESM ローダーを登録してから読む。
const { existsSync } = require("node:fs");
const { join } = require("node:path");

const compiled = join(__dirname, "main.js");
if (existsSync(compiled)) {
  import("./main.js").catch((e) => {
    console.error("[IGSH] main.js の読み込みに失敗しました:", e);
    process.exit(1);
  });
} else {
  const { register } = require("tsx/esm/api");
  register();
  import("./main.ts").catch((e) => {
    console.error("[IGSH] main.ts の読み込みに失敗しました:", e);
    process.exit(1);
  });
}
