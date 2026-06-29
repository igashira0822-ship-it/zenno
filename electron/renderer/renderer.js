// renderer.js — EngineEvent → DOM。自前markdown・スラッシュ配線・トークン保存・フォルダ選択。
const $log = document.getElementById("log");
const $input = document.getElementById("input");
const $send = document.getElementById("btn-send");
const $stop = document.getElementById("btn-stop");
const $modal = document.getElementById("modal");

let streaming = false;
let $typing = null;
let $stream = null;

const scrollEnd = () => {
  $log.scrollTop = $log.scrollHeight;
};
const escapeHtml = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// ── 依存ゼロの軽量シンタックスハイライト（1パス・交互マッチ・XSS安全）──
const HL_KW =
  /\b(const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|class|new|import|export|from|default|await|async|try|catch|finally|throw|typeof|instanceof|interface|type|enum|extends|implements|public|private|protected|readonly|static|def|lambda|elif|print|null|true|false|None|True|False|undefined|this|super|void|yield)\b/;
function highlightCode(raw) {
  const re = new RegExp(
    "(\\/\\*[\\s\\S]*?\\*\\/|\\/\\/[^\\n]*|#[^\\n]*)" + // 1: コメント
      "|(\"(?:\\\\.|[^\"\\\\])*\"|'(?:\\\\.|[^'\\\\])*'|`(?:\\\\.|[^`\\\\])*`)" + // 2: 文字列
      "|" +
      HL_KW.source + // 3: キーワード
      "|\\b(0x[0-9a-fA-F]+|\\d+(?:\\.\\d+)?)\\b", // 4: 数値
    "g"
  );
  let out = "";
  let last = 0;
  let m;
  while ((m = re.exec(raw))) {
    if (m.index < last) continue;
    out += escapeHtml(raw.slice(last, m.index));
    const cls = m[1] ? "tk-com" : m[2] ? "tk-str" : m[3] ? "tk-kw" : "tk-num";
    out += `<span class="${cls}">${escapeHtml(m[0])}</span>`;
    last = m.index + m[0].length;
  }
  return out + escapeHtml(raw.slice(last));
}

// ── 軽量markdown（依存ゼロ・XSS対策込み）──
function renderMarkdown(src) {
  const blocks = [];
  src = src.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    const tag = lang ? `<span class="code-lang">${escapeHtml(lang)}</span>` : "";
    blocks.push(`<pre>${tag}<code class="hl">${highlightCode(code.replace(/\n$/, ""))}</code></pre>`);
    return ` B${blocks.length - 1} `;
  });
  let h = escapeHtml(src);
  h = h.replace(/`([^`]+)`/g, (_, x) => `<code>${x}</code>`);
  h = h.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  h = h.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" data-ext="1">$1</a>');
  const out = [];
  let list = null;
  const closeList = () => {
    if (list) {
      out.push(`</${list}>`);
      list = null;
    }
  };
  for (const line of h.split("\n")) {
    let m;
    if ((m = line.match(/^(#{1,3})\s+(.*)$/))) {
      closeList();
      out.push(`<h${m[1].length}>${m[2]}</h${m[1].length}>`);
    } else if ((m = line.match(/^[-*]\s+(.*)$/))) {
      if (list !== "ul") {
        closeList();
        out.push("<ul>");
        list = "ul";
      }
      out.push(`<li>${m[1]}</li>`);
    } else if ((m = line.match(/^\d+\.\s+(.*)$/))) {
      if (list !== "ol") {
        closeList();
        out.push("<ol>");
        list = "ol";
      }
      out.push(`<li>${m[1]}</li>`);
    } else if (line.trim() === "") {
      closeList();
    } else {
      closeList();
      out.push(`<p>${line}</p>`);
    }
  }
  closeList();
  h = out.join("\n").replace(/ B(\d+) /g, (_, i) => blocks[+i]);
  return h;
}

// ── DOMヘルパ ──
function turn(role, who) {
  const el = document.createElement("div");
  el.className = `turn ${role}`;
  el.innerHTML = `<span class="who">${who}</span>`;
  const body = document.createElement("div");
  body.className = "body";
  el.appendChild(body);
  $log.appendChild(el);
  return body;
}
function imgUrl(im) {
  return `data:${im.media_type};base64,${im.data}`;
}
function addUser(text, images) {
  const body = turn("user", "あなた");
  if (text) {
    const p = document.createElement("div");
    p.className = "u-text";
    p.textContent = text;
    body.appendChild(p);
  }
  if (images && images.length) {
    const wrap = document.createElement("div");
    wrap.className = "u-images";
    for (const im of images) {
      const img = document.createElement("img");
      img.className = "u-img";
      img.src = imgUrl(im);
      wrap.appendChild(img);
    }
    body.appendChild(wrap);
  }
  scrollEnd();
}
function addZennoText(text) {
  const body = turn("zenno", "IGSH ›");
  body.innerHTML = renderMarkdown(text);
  showImagesIn(text, body);
  scrollEnd();
}
// テキスト中のローカル画像パス(.png等)を検出し main 経由で dataURL 化してインライン表示
function showImagesIn(text, bodyEl) {
  const re = /([A-Za-z]:[\\/][^\s"'<>`)]+\.(?:png|jpe?g|gif|webp))/gi;
  const seen = new Set();
  let m;
  while ((m = re.exec(text))) {
    const p = m[1];
    if (seen.has(p)) continue;
    seen.add(p);
    window.zenno
      .readImage(p)
      .then((url) => {
        if (!url) return;
        const img = document.createElement("img");
        img.className = "genimg";
        img.src = url;
        img.title = p;
        bodyEl.appendChild(img);
        scrollEnd();
      })
      .catch(() => {});
  }
}
function addToolLine(name, edited) {
  const el = document.createElement("div");
  el.className = "toolline";
  el.innerHTML = `⚙ ${escapeHtml(name)}${edited ? ' <span class="arg">(編集)</span>' : ""}`;
  $log.appendChild(el);
  scrollEnd();
}
// ── 編集の差分プレビュー（Claude Code 風・赤=削除/緑=追加）──
function addFileEdit(ev) {
  const el = document.createElement("div");
  el.className = "fileedit";
  const rem = (ev.removed || []).map((l) => `<div class="fe-line del">${escapeHtml(l)}</div>`).join("");
  const add = (ev.added || []).map((l) => `<div class="fe-line ins">${escapeHtml(l)}</div>`).join("");
  const note = ev.note ? `<div class="fe-note">${escapeHtml(ev.note)}</div>` : "";
  el.innerHTML =
    `<div class="fe-head"><span class="fe-tool">✎ ${escapeHtml(ev.tool)}</span>` +
    `<span class="fe-path">${escapeHtml(ev.path)}</span></div>` +
    `<div class="fe-body">${rem}${add}</div>${note}`;
  $log.appendChild(el);
  scrollEnd();
}
function addNotice(kind, html) {
  const el = document.createElement("div");
  el.className = `notice ${kind}`;
  el.innerHTML = `<div>${html}</div>`;
  $log.appendChild(el);
  scrollEnd();
}
function addTurnEnd(costUsd) {
  const el = document.createElement("div");
  el.className = "turnend";
  const cost = typeof costUsd === "number" ? ` ($${costUsd.toFixed(4)})` : "";
  el.textContent = `── ターン完了${cost}`;
  $log.appendChild(el);
  scrollEnd();
}
function showTyping() {
  if ($typing) return;
  $typing = document.createElement("div");
  $typing.className = "turn zenno";
  $typing.innerHTML = `<span class="who">IGSH ›</span><div class="typing"><span class="dots"><span></span><span></span><span></span></span>思考中…</div>`;
  $log.appendChild($typing);
  scrollEnd();
}
function hideTyping() {
  if ($typing) {
    $typing.remove();
    $typing = null;
  }
}

// ── ステータスバー ──
function labelModel(m) {
  if (m === "best") return "best";
  if (/fable/i.test(m)) return "Fable5";
  if (/opus/i.test(m)) return "Opus";
  if (/sonnet/i.test(m)) return "Sonnet";
  if (/haiku/i.test(m)) return "Haiku";
  return m;
}
function applyBanner(b) {
  document.getElementById("v-model").textContent = labelModel(b.model);
  document.getElementById("v-auth").textContent = b.authMode;
  document.getElementById("v-effort").textContent = b.effort + (b.fast ? " ⚡" : "");
  document.getElementById("v-gpt").textContent = b.gpt ? "●" : "○";
  document.getElementById("v-gem").textContent = b.gemini ? "●" : "○";
  document.getElementById("v-budget").textContent = b.maxUsd ? `$${b.maxUsd}` : "無制限";
  document.getElementById("v-cwd").textContent = b.here || "登録外";
}

// ── イベント受信（engine の onEvent と1:1）──
window.zenno.onBanner(applyBanner);
window.zenno.onCwd((p) => {
  document.getElementById("v-cwd").textContent = p.split(/[\\/]/).pop() || p;
});
window.zenno.onNeedToken((need) => {
  if (need) openModal();
});

window.zenno.onEvent((ev) => {
  switch (ev.type) {
    case "assistant_text":
      hideTyping();
      if ($stream) {
        $stream.innerHTML = renderMarkdown(ev.text);
        showImagesIn(ev.text, $stream);
        $stream = null;
      } else {
        addZennoText(ev.text);
      }
      scrollEnd();
      break;
    case "assistant_delta":
      hideTyping();
      if (!$stream) {
        $stream = turn("zenno", "IGSH ›");
        $stream._raw = "";
      }
      $stream._raw += ev.text;
      $stream.textContent = $stream._raw;
      scrollEnd();
      break;
    case "tool_use":
      hideTyping();
      addToolLine(ev.name, ev.edited);
      break;
    case "file_edit":
      hideTyping();
      addFileEdit(ev);
      break;
    case "model_refusal_fallback":
      addNotice(
        "fallback",
        `モデル拒否 → <strong>${escapeHtml(ev.fallback_model)}</strong> へ自動退避（分類: ${escapeHtml(
          ev.api_refusal_category
        )}）`
      );
      break;
    case "checkpoint":
      addNotice("dim", `⎌ チェックポイント #${ev.id}（/undo で戻せます）`);
      break;
    case "verify":
      if (ev.ok) addNotice("ok", `✓ 検証OK（${escapeHtml(ev.label)}）`);
      else
        addNotice(
          "warn",
          `⚠ 検証警告（${escapeHtml(ev.label)}）— 直近の編集で問題が出ています:<pre>${escapeHtml(
            ev.output || ""
          )}</pre><div class="hint">/undo で巻き戻し、または続けて修正を指示してください</div>`
        );
      break;
    case "turn_result":
      streaming = false;
      $stream = null;
      $stop.disabled = true;
      hideTyping();
      addTurnEnd(ev.total_cost_usd);
      if (typeof ev.totalUsd === "number") {
        document.getElementById("v-cost").textContent = `$${ev.totalUsd.toFixed(4)}`;
      }
      break;
    case "slash_output":
      addNotice("plain", `<pre>${escapeHtml(ev.text)}</pre>`);
      break;
    case "status":
      if (ev.status === "thinking") {
        streaming = true;
        $stop.disabled = false;
        showTyping();
      } else if (ev.status === "idle") {
        streaming = false;
        $stop.disabled = true;
        hideTyping();
      }
      break;
    case "error":
      hideTyping();
      streaming = false;
      $stop.disabled = true;
      addNotice("warn", `エラー: ${escapeHtml(ev.message)}`);
      break;
  }
});

// ── 送信 ──
function submit() {
  const text = $input.value.trim();
  const images = pendingImages.slice();
  if ((!text && !images.length) || streaming) return;
  if (text.startsWith("/")) {
    // スラッシュコマンドは画像を伴わない（添付は残す）
    if (text.toLowerCase() === "/stop") window.zenno.interrupt();
    else window.zenno.slash(text);
  } else {
    addUser(text, images);
    streaming = true;
    $stop.disabled = false;
    showTyping();
    window.zenno.send(text, images);
    clearPending();
  }
  $input.value = "";
  autoGrow();
}
$input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    submit();
  }
});
$send.addEventListener("click", submit);
function autoGrow() {
  $input.style.height = "auto";
  $input.style.height = Math.min($input.scrollHeight, 180) + "px";
}
$input.addEventListener("input", autoGrow);

// ── 画像の添付（スクショ貼り付け / 📎 / ドラッグ&ドロップ）──
let pendingImages = [];
const $attachPreview = document.getElementById("attach-preview");
const $fileInput = document.getElementById("file-input");

function clearPending() {
  pendingImages = [];
  renderPending();
}
function renderPending() {
  $attachPreview.innerHTML = "";
  if (!pendingImages.length) {
    $attachPreview.hidden = true;
    return;
  }
  $attachPreview.hidden = false;
  pendingImages.forEach((im, i) => {
    const cell = document.createElement("div");
    cell.className = "att-thumb";
    const img = document.createElement("img");
    img.src = imgUrl(im);
    const x = document.createElement("button");
    x.className = "att-x";
    x.title = "外す";
    x.textContent = "×";
    x.addEventListener("click", () => {
      pendingImages.splice(i, 1);
      renderPending();
    });
    cell.appendChild(img);
    cell.appendChild(x);
    $attachPreview.appendChild(cell);
  });
}
function fileToImage(file) {
  return new Promise((resolve) => {
    if (!file || !file.type.startsWith("image/")) return resolve(null);
    const r = new FileReader();
    r.onload = () => {
      const m = /^data:([^;]+);base64,(.*)$/.exec(String(r.result));
      resolve(m ? { media_type: m[1], data: m[2] } : null);
    };
    r.onerror = () => resolve(null);
    r.readAsDataURL(file);
  });
}
async function addFiles(files) {
  for (const f of files) {
    const im = await fileToImage(f);
    if (im) pendingImages.push(im);
  }
  renderPending();
}
// スクショ等の貼り付け
$input.addEventListener("paste", (e) => {
  const items = e.clipboardData && e.clipboardData.items;
  if (!items) return;
  const files = [];
  for (const it of items) {
    if (it.kind === "file" && it.type.startsWith("image/")) {
      const f = it.getAsFile();
      if (f) files.push(f);
    }
  }
  if (files.length) {
    e.preventDefault(); // 画像はテキスト貼り付けさせない
    addFiles(files);
  }
});
// 📎 でファイル選択
document.getElementById("btn-attach").addEventListener("click", () => $fileInput.click());
$fileInput.addEventListener("change", () => {
  if ($fileInput.files && $fileInput.files.length) addFiles(Array.from($fileInput.files));
  $fileInput.value = "";
});
// ドラッグ&ドロップ
const $composer = document.getElementById("composer");
$composer.addEventListener("dragover", (e) => {
  if (e.dataTransfer && Array.from(e.dataTransfer.types).includes("Files")) {
    e.preventDefault();
    $composer.classList.add("drag");
  }
});
$composer.addEventListener("dragleave", () => $composer.classList.remove("drag"));
$composer.addEventListener("drop", (e) => {
  $composer.classList.remove("drag");
  const files = e.dataTransfer ? Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith("image/")) : [];
  if (files.length) {
    e.preventDefault();
    addFiles(files);
  }
});

// ── ツールバー ──
document.querySelectorAll(".tool[data-cmd]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const cmd = btn.dataset.cmd;
    if (cmd === "/stop") window.zenno.interrupt();
    else window.zenno.slash(cmd);
  });
});
document.getElementById("btn-cwd").addEventListener("click", async () => {
  const dir = await window.zenno.pickFolder();
  if (dir) document.getElementById("v-cwd").textContent = dir.split(/[\\/]/).pop() || dir;
});

// 外部リンクは shell.openExternal 経由（レンダラ内遷移させない）
$log.addEventListener("click", (e) => {
  const a = e.target.closest('a[data-ext="1"]');
  if (a) {
    e.preventDefault();
    window.zenno.openLink(a.getAttribute("href"));
  }
});

// ── トークン設定モーダル ──
const $tokenInput = document.getElementById("token-input");
const $encWarn = document.getElementById("enc-warn");
async function openModal() {
  const st = await window.zenno.tokenStatus();
  $encWarn.classList.toggle("hidden", st.encAvailable);
  $tokenInput.value = "";
  try {
    const s = await window.zenno.getSettings();
    document.getElementById("set-model").value = s.model || "best";
    document.getElementById("set-effort").value = s.effort || "xhigh";
    document.getElementById("set-fast").checked = !!s.fast;
    document.getElementById("set-budget").value = s.maxUsd ? String(s.maxUsd) : "";
  } catch {}
  $modal.classList.remove("hidden");
  $tokenInput.focus();
}
function closeModal() {
  $modal.classList.add("hidden");
}
document.getElementById("btn-settings").addEventListener("click", openModal);
document.getElementById("token-cancel").addEventListener("click", closeModal);
document.getElementById("token-save").addEventListener("click", async () => {
  const t = $tokenInput.value.trim();
  if (!t) return;
  try {
    await window.zenno.saveToken(t);
    closeModal();
  } catch (e) {
    $encWarn.textContent = "保存失敗: " + (e?.message || e);
    $encWarn.classList.remove("hidden");
  }
});
document.getElementById("token-clear").addEventListener("click", async () => {
  await window.zenno.clearToken();
  closeModal();
});
document.getElementById("link-doc").addEventListener("click", (e) => {
  e.preventDefault();
  window.zenno.openLink("https://docs.claude.com/en/docs/claude-code/setup-token");
});
// 動作設定を保存（.env更新 → アプリ再起動で反映）
document.getElementById("settings-save").addEventListener("click", async () => {
  const maxUsd = parseFloat(document.getElementById("set-budget").value);
  await window.zenno.saveSettings({
    model: document.getElementById("set-model").value,
    effort: document.getElementById("set-effort").value,
    fast: document.getElementById("set-fast").checked,
    maxUsd: Number.isFinite(maxUsd) && maxUsd > 0 ? maxUsd : null,
  });
});

// ── 左サイドバー: 最近の項目（セッション履歴）──
const $sessionList = document.getElementById("session-list");

function clearLog() {
  $log.innerHTML = "";
  hideTyping();
}
function renderTranscript(items) {
  clearLog();
  for (const it of items || []) {
    if (it.role === "user") addUser(it.text, it.images);
    else if (it.role === "igsh") addZennoText(it.text);
    else addNotice("plain", `<pre>${escapeHtml(it.text)}</pre>`);
  }
}
function relTime(ms) {
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 60) return "たった今";
  if (s < 3600) return `${Math.floor(s / 60)}分前`;
  if (s < 86400) return `${Math.floor(s / 3600)}時間前`;
  return `${Math.floor(s / 86400)}日前`;
}
// 1項目を生成（archived=true なら復元ボタン、false ならアーカイブボタン。両方に削除）。
function makeSessionItem(s, archived) {
  const el = document.createElement("div");
  el.className = "side-item";
  const main = document.createElement("button");
  main.className = "si-main";
  main.innerHTML =
    `<span class="si-title">${escapeHtml(s.title || "（無題）")}</span>` +
    `<span class="si-time">${relTime(s.updatedAt)}</span>`;
  main.addEventListener("click", () => window.zenno.openSession(s.id));

  const actions = document.createElement("div");
  actions.className = "si-actions";

  const act = document.createElement("button");
  act.className = "si-act";
  if (archived) {
    act.title = "復元";
    act.textContent = "↩";
    act.addEventListener("click", async (e) => {
      e.stopPropagation();
      await window.zenno.unarchiveSession(s.id);
      refreshSidebar();
    });
  } else {
    act.title = "アーカイブ（一覧から隠すが残す）";
    act.textContent = "📦";
    act.addEventListener("click", async (e) => {
      e.stopPropagation();
      await window.zenno.archiveSession(s.id);
      refreshSidebar();
    });
  }
  actions.appendChild(act);

  const del = document.createElement("button");
  del.className = "si-act si-del";
  del.title = "完全に削除";
  del.textContent = "🗑";
  del.addEventListener("click", async (e) => {
    e.stopPropagation();
    if (confirm(`「${s.title || "（無題）"}」を完全に削除しますか？（元に戻せません）`)) {
      await window.zenno.deleteSession(s.id);
      refreshSidebar();
    }
  });
  actions.appendChild(del);

  el.appendChild(main);
  el.appendChild(actions);
  return el;
}

function renderSessions(list) {
  $sessionList.innerHTML = "";
  if (!list || !list.length) {
    const e = document.createElement("div");
    e.className = "side-empty";
    e.textContent = "まだ履歴はありません";
    $sessionList.appendChild(e);
    return;
  }
  for (const s of list) $sessionList.appendChild(makeSessionItem(s, false));
}

// ── アーカイブ表示トグル ──
const $archiveList = document.getElementById("archive-list");
const $archiveToggle = document.getElementById("btn-archive-toggle");
const $archiveCount = document.getElementById("archive-count");
let archiveOpen = false;

async function refreshSidebar() {
  try {
    renderSessions(await window.zenno.listSessions());
  } catch {}
  let arch = [];
  try {
    arch = (await window.zenno.listArchived()) || [];
  } catch {}
  $archiveCount.textContent = arch.length ? `(${arch.length})` : "";
  $archiveList.innerHTML = "";
  if (archiveOpen) {
    if (!arch.length) {
      const e = document.createElement("div");
      e.className = "side-empty";
      e.textContent = "アーカイブは空です";
      $archiveList.appendChild(e);
    } else {
      for (const s of arch) $archiveList.appendChild(makeSessionItem(s, true));
    }
  }
}

$archiveToggle.addEventListener("click", () => {
  archiveOpen = !archiveOpen;
  $archiveList.hidden = !archiveOpen;
  $archiveToggle.classList.toggle("open", archiveOpen);
  refreshSidebar();
});

// メインからの一覧 push でも件数を保つため refreshSidebar 経由で再描画。
window.zenno.onSessions(() => refreshSidebar());
window.zenno.onLoadTranscript(renderTranscript);
window.zenno.onClearLog(clearLog);
document.getElementById("btn-new").addEventListener("click", () => window.zenno.newSession());
refreshSidebar();

$stop.disabled = true;
$input.focus();
