// electron/main.ts — BrowserWindow + 日本語メニュー + IPC + .env早期ロード
//   + safeStorageトークン管理 + dialogフォルダ選択 + engine起動 + セッション履歴(保存/一覧/再開)。
import {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  safeStorage,
  shell,
  Menu,
  Notification,
  type MenuItemConstructorOptions,
} from "electron";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { existsSync, readFileSync, writeFileSync, rmSync, mkdirSync, readdirSync, renameSync } from "node:fs";
import electronUpdater from "electron-updater";

const { autoUpdater } = electronUpdater;
const __dirname = dirname(fileURLToPath(import.meta.url));

let win: BrowserWindow | null = null;
let engine: import("../src/engine.js").Engine | null = null;
let workCwd = process.cwd();

// 作業フォルダ(cwd)を userData/cwd.txt に永続化（パッケージ版でSystem32等を既定にしない）。
const cwdFile = () => join(app.getPath("userData"), "cwd.txt");
function loadWorkCwd(): string {
  try {
    const p = readFileSync(cwdFile(), "utf8").trim();
    if (p && existsSync(p)) return p;
  } catch {}
  return app.getPath("home");
}
function saveWorkCwd(p: string) {
  try {
    writeFileSync(cwdFile(), p, "utf8");
  } catch {}
}

// パッケージ(.exe)版の claude.exe 実体パス（asar内仮想パスだとspawnがENOENT）。dev時はundefined。
function claudeExePath(): string | undefined {
  return app.isPackaged
    ? join(
        (process as any).resourcesPath,
        "app.asar.unpacked",
        "node_modules",
        "@anthropic-ai",
        "claude-agent-sdk-win32-x64",
        "claude.exe"
      )
    : undefined;
}

const send = (channel: string, payload: unknown) => win?.webContents.send(channel, payload);
const secretFile = () => join(app.getPath("userData"), "secret.bin");

// ───────────────── セッション履歴 ─────────────────
type ChatImage = { media_type: string; data: string };
type SessionItem =
  | { role: "user"; text: string; images?: ChatImage[] }
  | { role: "igsh"; text: string }
  | { role: "note"; text: string };
interface SessionRecord {
  id: string;
  sdkSessionId: string | null;
  title: string;
  createdAt: number;
  updatedAt: number;
  cwd: string;
  items: SessionItem[];
}
let current: SessionRecord | null = null;

const sessionsDir = () => join(app.getPath("userData"), "igsh-sessions");
function ensureSessionsDir() {
  const d = sessionsDir();
  if (!existsSync(d)) mkdirSync(d, { recursive: true });
  return d;
}
// アーカイブは sessionsDir 直下の archive/ サブフォルダへ退避する。
// listSessions は *.json のみ拾う（"archive" フォルダは .json で終わらないので自動的に一覧から外れる）。
const archiveDir = () => join(sessionsDir(), "archive");
function ensureArchiveDir() {
  const d = archiveDir();
  if (!existsSync(d)) mkdirSync(d, { recursive: true });
  return d;
}
function newSessionRecord(cwd: string): SessionRecord {
  const now = Date.now();
  return {
    id: `${now}-${Math.floor((now % 1000) + 1)}`,
    sdkSessionId: null,
    title: "新しいセッション",
    createdAt: now,
    updatedAt: now,
    cwd,
    items: [],
  };
}
function saveCurrent() {
  if (!current) return;
  try {
    ensureSessionsDir();
    current.updatedAt = Date.now();
    writeFileSync(join(sessionsDir(), `${current.id}.json`), JSON.stringify(current));
  } catch {}
}
function appendItem(item: SessionItem) {
  if (!current) return;
  current.items.push(item);
  if (item.role === "user" && (current.title === "新しいセッション" || !current.title)) {
    const t = item.text.trim() || (item.images?.length ? "🖼 画像" : "");
    if (t) current.title = t.slice(0, 40);
  }
  saveCurrent();
}
function listSessions(): Array<Pick<SessionRecord, "id" | "title" | "createdAt" | "updatedAt" | "cwd">> {
  try {
    ensureSessionsDir();
    return readdirSync(sessionsDir())
      .filter((f) => f.endsWith(".json"))
      .map((f) => {
        try {
          const r = JSON.parse(readFileSync(join(sessionsDir(), f), "utf8")) as SessionRecord;
          return { id: r.id, title: r.title, createdAt: r.createdAt, updatedAt: r.updatedAt, cwd: r.cwd };
        } catch {
          return null;
        }
      })
      .filter((x): x is NonNullable<typeof x> => !!x)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}
function loadSession(id: string): SessionRecord | null {
  // 通常／アーカイブのどちらに居ても開けるよう両方を探す。
  for (const dir of [sessionsDir(), archiveDir()]) {
    const p = join(dir, `${id}.json`);
    if (existsSync(p)) {
      try {
        return JSON.parse(readFileSync(p, "utf8")) as SessionRecord;
      } catch {
        return null;
      }
    }
  }
  return null;
}

// アーカイブ済みセッションの一覧（archive/ サブフォルダのみ・updatedAt 降順）。
function listArchived(): Array<Pick<SessionRecord, "id" | "title" | "createdAt" | "updatedAt" | "cwd">> {
  try {
    const d = archiveDir();
    if (!existsSync(d)) return [];
    return readdirSync(d)
      .filter((f) => f.endsWith(".json"))
      .map((f) => {
        try {
          const r = JSON.parse(readFileSync(join(d, f), "utf8")) as SessionRecord;
          return { id: r.id, title: r.title, createdAt: r.createdAt, updatedAt: r.updatedAt, cwd: r.cwd };
        } catch {
          return null;
        }
      })
      .filter((x): x is NonNullable<typeof x> => !!x)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

// id のセッションを archive/ へ退避（一覧から外れるが残る・復元可）。
function archiveSession(id: string): boolean {
  try {
    const src = join(sessionsDir(), `${id}.json`);
    if (!existsSync(src)) return false;
    ensureArchiveDir();
    renameSync(src, join(archiveDir(), `${id}.json`));
    return true;
  } catch {
    return false;
  }
}
// archive/ から通常へ戻す。
function unarchiveSession(id: string): boolean {
  try {
    const src = join(archiveDir(), `${id}.json`);
    if (!existsSync(src)) return false;
    ensureSessionsDir();
    renameSync(src, join(sessionsDir(), `${id}.json`));
    return true;
  } catch {
    return false;
  }
}
// 完全削除（通常・アーカイブのどちらにあっても消す・元に戻せない）。
function deleteSession(id: string): boolean {
  let removed = false;
  for (const dir of [sessionsDir(), archiveDir()]) {
    const p = join(dir, `${id}.json`);
    try {
      if (existsSync(p)) {
        rmSync(p);
        removed = true;
      }
    } catch {}
  }
  // 表示中セッションを消したら、保存で復活しないよう参照を切る。
  if (removed && current?.id === id) current = null;
  return removed;
}
const pushSessionList = () => send("igsh:sessions", listSessions());

// ───────────────── トークン: safeStorage ─────────────────
function saveToken(token: string) {
  if (!safeStorage.isEncryptionAvailable()) throw new Error("OSの暗号化が使えません（safeStorage利用不可）");
  writeFileSync(secretFile(), safeStorage.encryptString(token.trim()));
}
function loadToken(): string | null {
  const f = secretFile();
  if (!existsSync(f)) return null;
  try {
    return safeStorage.decryptString(readFileSync(f));
  } catch {
    return null;
  }
}
function clearToken() {
  try {
    rmSync(secretFile());
  } catch {}
}

// ───────────────── .env 早期ロード ─────────────────
function loadEnvEarly() {
  for (const p of [
    join(process.cwd(), ".env"),
    join(app.getAppPath(), ".env"),
    join(dirname(app.getPath("exe")), ".env"),
  ]) {
    if (existsSync(p)) {
      try {
        process.loadEnvFile(p);
        break;
      } catch {}
    }
  }
}

// ───────────────── .env の動作設定（model/effort/fast/予算）─────────────────
function envPath(): string {
  for (const p of [
    join(process.cwd(), ".env"),
    join(app.getAppPath(), ".env"),
    join(dirname(app.getPath("exe")), ".env"),
  ]) {
    if (existsSync(p)) return p;
  }
  return join(process.cwd(), ".env");
}
// 1キーを置換/追記/削除（他行＝トークン等は保持・BOMなしUTF-8）
function setEnvVar(content: string, key: string, value: string | null): string {
  const kept = content.split(/\r?\n/).filter((l) => l.trim() !== "" && !l.startsWith(`${key}=`));
  if (value !== null && value !== "") kept.push(`${key}=${value}`);
  return kept.join("\n") + "\n";
}

async function disposeEngine() {
  if (!engine) return;
  try {
    await engine.interrupt();
  } catch {}
  engine.close();
  engine = null;
}

// engine起動。record を渡すと過去セッションを再開、無ければ新規。
async function startEngine(record?: SessionRecord) {
  const token = loadToken();
  if (token) {
    process.env.CLAUDE_CODE_OAUTH_TOKEN = token;
    process.env.ANTHROPIC_API_KEY = "";
  }
  const { config } = await import("../src/config.js");
  if (!config.anthropicKey && !config.oauthToken) {
    send("zenno:event", {
      type: "error",
      message: "認証未設定: 設定画面でトークン（claude setup-token の出力）を保存してください",
    });
    send("zenno:need_token", true);
    return;
  }
  await disposeEngine();

  current = record ?? newSessionRecord(workCwd);
  const resume = record?.sdkSessionId ?? undefined;

  const { createEngine } = await import("../src/engine.js");
  engine = createEngine({
    cwd: current.cwd,
    resume,
    pathToClaudeCodeExecutable: claudeExePath(), // パッケージ版でのみ実体パス指定
    onEvent: (e) => {
      // 履歴へ記録（表示はそのまま relay）
      if (e.type === "session_id") {
        if (current) {
          current.sdkSessionId = e.sessionId;
          saveCurrent();
        }
      } else if (e.type === "assistant_text") {
        appendItem({ role: "igsh", text: e.text });
      } else if (e.type === "slash_output") {
        appendItem({ role: "note", text: e.text });
      } else if (e.type === "turn_result") {
        pushSessionList();
        // 長時間タスクの「静かな失敗」を防ぐ: 非フォーカス時に完了をOS通知
        if (win && !win.isFocused() && Notification.isSupported()) {
          const usd = typeof e.totalUsd === "number" ? `  合計 $${e.totalUsd.toFixed(4)}` : "";
          new Notification({ title: "IGSH — 完了", body: `ターンが完了しました${usd}` }).show();
        }
      }
      send("zenno:event", e);
    },
  });
  send("zenno:banner", engine.bannerInfo());
  send("zenno:cwd", current.cwd);
  // 過去セッションを開いた場合は保存済みトランスクリプトを描画
  if (record) send("igsh:load_transcript", record.items);
  else send("igsh:clear_log", true);
  pushSessionList();
}

// ───────────────── 日本語メニュー ─────────────────
function buildMenu() {
  const template: MenuItemConstructorOptions[] = [
    {
      label: "ファイル",
      submenu: [
        { label: "新規セッション", accelerator: "CmdOrCtrl+N", click: () => void startEngine() },
        { type: "separator" },
        { label: "終了", role: "quit" },
      ],
    },
    {
      label: "編集",
      submenu: [
        { label: "元に戻す", role: "undo" },
        { label: "やり直し", role: "redo" },
        { type: "separator" },
        { label: "切り取り", role: "cut" },
        { label: "コピー", role: "copy" },
        { label: "貼り付け", role: "paste" },
        { label: "すべて選択", role: "selectAll" },
      ],
    },
    {
      label: "表示",
      submenu: [
        { label: "再読み込み", role: "reload" },
        { label: "開発者ツール", role: "toggleDevTools" },
        { type: "separator" },
        { label: "実際のサイズ", role: "resetZoom" },
        { label: "拡大", role: "zoomIn" },
        { label: "縮小", role: "zoomOut" },
        { type: "separator" },
        { label: "全画面表示の切替", role: "togglefullscreen" },
      ],
    },
    {
      label: "ウィンドウ",
      submenu: [
        { label: "最小化", role: "minimize" },
        { label: "閉じる", role: "close" },
      ],
    },
    {
      label: "ヘルプ",
      submenu: [
        {
          label: "更新を確認",
          click: async () => {
            if (!app.isPackaged) {
              await dialog.showMessageBox(win!, {
                message: "開発版です。自動更新はパッケージ版(.exe)でのみ動作します。",
              });
              return;
            }
            try {
              await autoUpdater.checkForUpdates();
            } catch (e: any) {
              await dialog.showMessageBox(win!, { message: "更新確認に失敗: " + (e?.message ?? e) });
            }
          },
        },
        { type: "separator" },
        {
          label: "設計図 BLUEPRINT を開く",
          click: () => shell.openPath(join(__dirname, "..", "BLUEPRINT.md")),
        },
        {
          label: "認証トークンの取得方法",
          click: () => shell.openExternal("https://docs.claude.com/en/docs/claude-code/setup-token"),
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

async function createWindow() {
  loadEnvEarly();
  // パッケージ(.exe)版は同梱 knowledge が app.asar 内＝読み取り専用。自己強化
  // （remember / update_project）の書き込み先を userData/knowledge へリダイレクトする
  // （src/knowledgePaths.ts が ZENNO_KNOWLEDGE_DIR を参照。dev では未設定＝リポジトリ直書き）。
  if (app.isPackaged) {
    process.env.ZENNO_KNOWLEDGE_DIR = join(app.getPath("userData"), "knowledge");
  }
  buildMenu();
  win = new BrowserWindow({
    width: 1180,
    height: 780,
    backgroundColor: "#0d1117",
    title: "IGSH",
    webPreferences: {
      preload: join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  await win.loadFile(join(__dirname, "renderer", "index.html"));
  workCwd = loadWorkCwd(); // 永続化した作業フォルダ（無ければhome）。System32等を既定にしない
  await startEngine(); // 認証判定はstartEngine内（safeStorage or .env、無ければneed_token送出）
  setupAutoUpdate();
}

// 自動更新（パッケージ版のみ）。GitHub Releases 等の publish 設定が無いと feed 取得に失敗するため、
// すべて握りつぶして dev/未設定では完全に no-op にする（配信ホスト整備後にそのまま有効化される）。
function setupAutoUpdate() {
  if (!app.isPackaged) return;
  try {
    autoUpdater.autoDownload = true;
    autoUpdater.on("update-downloaded", (info: { version: string }) => {
      send("zenno:event", {
        type: "slash_output",
        text: `更新 v${info.version} をダウンロードしました。次回起動時に自動適用されます。`,
      });
    });
    autoUpdater.on("error", () => {});
    autoUpdater.checkForUpdatesAndNotify().catch(() => {});
  } catch {}
}

// GPUシェーダーのディスクキャッシュ移動が "アクセス拒否(0x5)" で失敗する環境向けに無効化
// （userData/GPUCache の rename 失敗ログを回避。GPU描画自体は通常どおり・初回起動が僅かに遅くなるだけ）。
app.commandLine.appendSwitch("disable-gpu-shader-disk-cache");

// 多重起動防止（二重ウィンドウ・混乱を防ぐ）。2つ目の起動は既存ウィンドウをフォーカスして自分は終了する。
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
  app.whenReady().then(createWindow);
}
app.on("window-all-closed", async () => {
  await disposeEngine();
  app.quit();
});

// ───────────────── IPC ─────────────────
ipcMain.handle("zenno:token_status", () => ({
  hasToken: !!loadToken(),
  encAvailable: safeStorage.isEncryptionAvailable(),
}));
ipcMain.handle("zenno:save_token", async (_e, token: string) => {
  saveToken(token);
  await startEngine();
  return true;
});
ipcMain.handle("zenno:clear_token", async () => {
  clearToken();
  await disposeEngine();
  return true;
});
ipcMain.handle(
  "zenno:user_message",
  (_e, payload: { text: string; images?: ChatImage[] }) => {
    appendItem({ role: "user", text: payload.text, images: payload.images });
    engine?.sendUserMessage(payload.text, payload.images);
  }
);
ipcMain.handle("zenno:slash", async (_e, cmd: string) => {
  const cont = await engine?.runSlash(cmd);
  if (cont === false) {
    await disposeEngine();
    app.quit();
  }
  return cont;
});
ipcMain.handle("zenno:set_model", (_e, name: string) => engine?.setModel(name));
ipcMain.handle("zenno:interrupt", () => engine?.interrupt());
ipcMain.handle("zenno:open_link", (_e, url: string) => shell.openExternal(url));
ipcMain.handle("zenno:pick_folder", async () => {
  const r = await dialog.showOpenDialog(win!, {
    title: "IGSH の作業フォルダを選択",
    properties: ["openDirectory", "createDirectory"],
  });
  if (r.canceled || !r.filePaths[0]) return null;
  workCwd = r.filePaths[0];
  saveWorkCwd(workCwd); // 次回起動時にこのフォルダを既定にする
  await startEngine(); // 新セッションで新フォルダの固有知識を前ロード
  return workCwd;
});
// セッション履歴
ipcMain.handle("igsh:list_sessions", () => listSessions());
ipcMain.handle("igsh:new_session", async () => {
  await startEngine();
  return true;
});
ipcMain.handle("igsh:open_session", async (_e, id: string) => {
  const rec = loadSession(id);
  if (!rec) return false;
  workCwd = rec.cwd || workCwd;
  saveWorkCwd(workCwd);
  await startEngine(rec);
  return true;
});
ipcMain.handle("igsh:list_archived", () => listArchived());
ipcMain.handle("igsh:archive_session", (_e, id: string) => {
  const ok = archiveSession(id);
  pushSessionList();
  return ok;
});
ipcMain.handle("igsh:unarchive_session", (_e, id: string) => {
  const ok = unarchiveSession(id);
  pushSessionList();
  return ok;
});
ipcMain.handle("igsh:delete_session", (_e, id: string) => {
  const ok = deleteSession(id);
  pushSessionList();
  return ok;
});
// 動作設定の取得 / 保存（保存は .env を書いてアプリ再起動で反映）
ipcMain.handle("igsh:get_settings", async () => {
  const { config } = await import("../src/config.js");
  return { model: config.model, effort: config.effort, fast: config.fast, maxUsd: config.maxUsd ?? null };
});
// 生成画像をインライン表示するため、ローカル画像を data URL 化して返す（拡張子・存在・サイズを検査）
ipcMain.handle("igsh:read_image", async (_e, p: string) => {
  try {
    if (!/\.(png|jpe?g|gif|webp)$/i.test(p) || !existsSync(p)) return null;
    const buf = readFileSync(p);
    if (buf.length > 8 * 1024 * 1024) return null;
    const ext = p.split(".").pop()!.toLowerCase();
    return `data:image/${ext === "jpg" ? "jpeg" : ext};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
});
ipcMain.handle(
  "igsh:save_settings",
  async (_e, s: { model?: string; effort?: string; fast?: boolean; maxUsd?: number | null }) => {
    const p = envPath();
    let content = existsSync(p) ? readFileSync(p, "utf8") : "";
    if (s.model !== undefined) content = setEnvVar(content, "ZENNO_MODEL", s.model || null);
    if (s.effort !== undefined) content = setEnvVar(content, "ZENNO_EFFORT", s.effort || null);
    if (s.fast !== undefined) content = setEnvVar(content, "ZENNO_FAST", s.fast ? "1" : "0");
    if (s.maxUsd !== undefined)
      content = setEnvVar(content, "ZENNO_MAX_USD", s.maxUsd && s.maxUsd > 0 ? String(s.maxUsd) : null);
    writeFileSync(p, content, "utf8");
    app.relaunch();
    app.exit(0);
    return true;
  }
);
