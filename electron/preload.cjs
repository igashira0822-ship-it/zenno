// electron/preload.cjs — contextBridge で window.zenno.* を最小公開。
// CommonJS(.cjs) で書く: サンドボックス化された preload では require('electron') が使え、
// ESM .ts/.js は読み込めない（tsxローダーは preload コンテキストに届かない）ため。
const { contextBridge, ipcRenderer } = require("electron");

const eventListeners = new Set();
ipcRenderer.on("zenno:event", (_e, payload) => eventListeners.forEach((fn) => fn(payload)));

let bannerCb = null;
let cwdCb = null;
let needTokenCb = null;
let sessionsCb = null;
let loadTranscriptCb = null;
let clearLogCb = null;
ipcRenderer.on("zenno:banner", (_e, b) => bannerCb && bannerCb(b));
ipcRenderer.on("zenno:cwd", (_e, p) => cwdCb && cwdCb(p));
ipcRenderer.on("zenno:need_token", (_e, v) => needTokenCb && needTokenCb(v));
ipcRenderer.on("igsh:sessions", (_e, list) => sessionsCb && sessionsCb(list));
ipcRenderer.on("igsh:load_transcript", (_e, items) => loadTranscriptCb && loadTranscriptCb(items));
ipcRenderer.on("igsh:clear_log", () => clearLogCb && clearLogCb());

contextBridge.exposeInMainWorld("zenno", {
  // レンダラ → メイン
  send: (text) => ipcRenderer.invoke("zenno:user_message", text),
  slash: (cmd) => ipcRenderer.invoke("zenno:slash", cmd),
  setModel: (name) => ipcRenderer.invoke("zenno:set_model", name),
  interrupt: () => ipcRenderer.invoke("zenno:interrupt"),
  pickFolder: () => ipcRenderer.invoke("zenno:pick_folder"),
  // トークン
  tokenStatus: () => ipcRenderer.invoke("zenno:token_status"),
  saveToken: (t) => ipcRenderer.invoke("zenno:save_token", t),
  clearToken: () => ipcRenderer.invoke("zenno:clear_token"),
  openLink: (u) => ipcRenderer.invoke("zenno:open_link", u),
  // セッション履歴
  listSessions: () => ipcRenderer.invoke("igsh:list_sessions"),
  newSession: () => ipcRenderer.invoke("igsh:new_session"),
  openSession: (id) => ipcRenderer.invoke("igsh:open_session", id),
  listArchived: () => ipcRenderer.invoke("igsh:list_archived"),
  archiveSession: (id) => ipcRenderer.invoke("igsh:archive_session", id),
  unarchiveSession: (id) => ipcRenderer.invoke("igsh:unarchive_session", id),
  deleteSession: (id) => ipcRenderer.invoke("igsh:delete_session", id),
  // 動作設定
  getSettings: () => ipcRenderer.invoke("igsh:get_settings"),
  saveSettings: (s) => ipcRenderer.invoke("igsh:save_settings", s),
  readImage: (p) => ipcRenderer.invoke("igsh:read_image", p),
  // メイン → レンダラ
  onEvent: (cb) => {
    eventListeners.add(cb);
    return () => eventListeners.delete(cb);
  },
  onBanner: (cb) => {
    bannerCb = cb;
  },
  onCwd: (cb) => {
    cwdCb = cb;
  },
  onNeedToken: (cb) => {
    needTokenCb = cb;
  },
  onSessions: (cb) => {
    sessionsCb = cb;
  },
  onLoadTranscript: (cb) => {
    loadTranscriptCb = cb;
  },
  onClearLog: (cb) => {
    clearLogCb = cb;
  },
});
