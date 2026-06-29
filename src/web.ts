// 実行道具（核5）: Web 実機検証 / 取得。新規 npm 依存ゼロ（Node24 の global fetch を使う）。
//   - checkSite : 本番URL等の死活確認（HTTP状態・最終URL・<title>・任意の期待文字列照合・応答時間）。
//   - fetchPage : ページ本文をテキスト化して取得（研究・内容確認用・上限つき）。
// どちらも副作用なし（読み取り専用）。ファイル書込なし＝パッケージ(.exe)でも安全。

export type CheckSiteOptions = { url: string; expect?: string; timeoutMs?: number };

export async function checkSite(o: CheckSiteOptions): Promise<{ ok: boolean; message: string }> {
  const url = (o.url ?? "").trim();
  if (!/^https?:\/\//i.test(url)) {
    return { ok: false, message: `URL は http(s):// で始めてください: ${url || "(空)"}` };
  }
  const timeout = o.timeoutMs && o.timeoutMs > 0 ? o.timeoutMs : 15_000;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  const started = Date.now();
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: ctrl.signal,
      headers: { "user-agent": "IGSH-site-check/1" },
    });
    const ms = Date.now() - started;
    const ctype = res.headers.get("content-type") ?? "";
    const isHtml = ctype.includes("text/html");
    let title = "";
    let expectHit: boolean | null = null;
    // タイトル抽出 or 期待文字列照合が要るときだけ本文を読む（無駄な転送を避ける）。
    if (isHtml || o.expect) {
      const body = await res.text();
      const m = body.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      title = m ? m[1].trim().replace(/\s+/g, " ").slice(0, 120) : "";
      if (o.expect) expectHit = body.includes(o.expect);
    }
    const lines = [
      `${res.ok ? "✓" : "✗"} ${res.status} ${res.statusText}  (${ms}ms)`,
      `URL: ${res.url}${res.redirected ? "  ← リダイレクト後" : ""}`,
    ];
    if (title) lines.push(`title: ${title}`);
    if (expectHit !== null) {
      lines.push(expectHit ? `expect: ✓「${o.expect}」を本文に検出` : `expect: ✗「${o.expect}」が本文に無い`);
    }
    const ok = res.ok && (expectHit === null || expectHit === true);
    return { ok, message: lines.join("\n") };
  } catch (e: any) {
    const aborted = e?.name === "AbortError";
    return {
      ok: false,
      message: aborted ? `タイムアウト(${timeout}ms): ${url}` : `取得失敗: ${e?.message ?? String(e)}`,
    };
  } finally {
    clearTimeout(timer);
  }
}

export type FetchPageOptions = { url: string; max?: number };

export async function fetchPage(o: FetchPageOptions): Promise<{ ok: boolean; message: string }> {
  const url = (o.url ?? "").trim();
  if (!/^https?:\/\//i.test(url)) {
    return { ok: false, message: `URL は http(s):// で始めてください: ${url || "(空)"}` };
  }
  const cap = o.max && o.max > 0 ? Math.min(o.max, 20_000) : 4_000;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20_000);
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: ctrl.signal,
      headers: { "user-agent": "IGSH-fetch/1" },
    });
    const body = await res.text();
    const text = htmlToText(body);
    const clipped =
      text.length > cap ? text.slice(0, cap) + `\n…（残り ${text.length - cap} 文字省略）` : text;
    return { ok: res.ok, message: `[${res.status}] ${res.url}\n\n${clipped}` };
  } catch (e: any) {
    const aborted = e?.name === "AbortError";
    return { ok: false, message: aborted ? `タイムアウト: ${url}` : `取得失敗: ${e?.message ?? String(e)}` };
  } finally {
    clearTimeout(timer);
  }
}

// HTML をざっくり可読テキストへ（依存なしの軽量版）。script/style/コメント除去→主要ブロックで改行→タグ除去→主要実体参照復元。
function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<\/(p|div|h[1-6]|li|tr|section|article|header|footer)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
