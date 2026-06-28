# 全脳（ZENNO）

**Claude Code のエンジンを中核に、GPT・Gemini など複数の生産AIを"道具"として合体させた、統合ターミナル開発エージェント。**

世界一の生産AIを目指す、自分専用の最強開発ツールの v0.1。

```
        ┌──────────────────────────────────────────────┐
        │   ZENNO ターミナル ← あなたが話す所             │
        ├──────────────────────────────────────────────┤
        │   頭脳 = Claude Agent SDK（＝Code のエンジン）   │
        │   ・ファイル読み書き / シェル / 検索 / git        │
        │   ・エージェントループ・権限・MCP・サブエージェント │
        ├──────────────────────────────────────────────┤
        │   合体レイヤー（道具として接続）                  │
        │   ・ask_gpt    … GPT に意見を聞く               │
        │   ・ask_gemini … Gemini に意見を聞く             │
        │   ・ai_council … 両方に同時に投げて回答を集約     │
        └──────────────────────────────────────────────┘
```

Claude の頭脳が、難しい判断のときに自分で「GPT と Gemini にも聞こう」と道具を呼び、3つの知能を統合して答えを出す——これが「全部の頭脳を合体」の正体です。

---

## 実装済みの差別化機能（APIキー無しで単体検証済み）

> 設計の決定版は [BLUEPRINT.md](BLUEPRINT.md)（6角度の設計＋批評を統合）。「汎用の世界一」は名乗らず、**Connect社の量産ワークフロー専用の自律実行ハブ**として勝つ、という結論に基づく。

- **モデル仕様: Claude Fable 5 + ultracode**
  - 既定 `best`（Fable5アクセス可ならFable5・不可なら課金ゼロのOpusへ自動降格）、深さ `effort: xhigh`。
  - Fable5固有の地雷を回避：`thinking`/`budget_tokens` は送らない（adaptive自動）、refusal時は `claude-opus-4-8` へ自動退避（`fallbackModel`）。**30日データ保持必須・ZDR不可・Opusの約2倍課金**に注意。
  - systemPrompt に Fable5向け調整（ゴール先行・最小変更・進捗の接地・敵対的検証）を内蔵。SDK実フィールドで裏取り済み（verdict: sound）。
- **核1: プロジェクト横断の固有知識・前ロード**（最大の差別化）
  - 起動フォルダから現在のプロジェクトを自動判定（longest-prefix）し、その固有知識だけを注入。
  - `load_project_context` / `list_projects` ツールで、別プロジェクトに切り替えても文脈を読み直せる。
  - 例: `ぱくるんです` を開けば「forrentの正URL・隠し駅コード手順」を最初から把握。フロンティアモデルが持たない資産。
  - 知識は `knowledge/projects.json`（`MEMORY.md` 由来の読み取り専用キャッシュ・`last_verified` で古さを警告）。**単体9/9検証済**。
- **核2: 全許可でも事故らない破壊ガード**
  - `bypassPermissions`（全許可）でも、`rm -rf` / `Remove-Item -Recurse -Force` / `git push --force` / `DROP TABLE` / `supabase db reset` / `format` 等の破壊コマンドだけを止める（Windows/POSIX二系統）。
  - 安全コマンド（`--force-with-lease`・単発削除）や非シェルツールは誤爆させない。**単体16/16検証済**。
- **核3: gitチェックポイント＋`/undo`**
  - 各ターンの前に自動スナップショット（`git stash create`）。`/undo` で直前に戻す（追跡ファイルのみ・新規ファイルは保持＝破壊しない）。**単体6/6検証済**。
- **核4: 検証ゲート（warn既定）**
  - 編集が起きたターンの後に決定的チェック（`typecheck`/`tsc`/`lint`）を自動実行して警告（非ブロック）。flakyなdev/HTTPチェックは含めない。`/verify` で手動実行も可。
- **多AIコスト可視化**: GPT/Gemini分は usage×単価で自前計上・Claude分はSDK実測。`/cost` で合算表示。**台帳の集計を単体検証済**。
- **スラッシュコマンド**: `/help /undo /cost /verify /projects /project /model /stop`（`/model`=実行中のモデル切替、`/stop`=中断）。
- **コスト上限**: `ZENNO_MAX_USD` で Anthropic 分の自動停止。
- **正しい全許可**: `allowDangerouslySkipPermissions` を付与（v0.1で欠落＝真の全許可で走れていなかったのを修正）。

---

## セットアップ

### 1. 依存をインストール
```bash
cd C:\zenno
npm install
```

### 2. 認証を設定
`.env.example` を `.env` にコピーして、下の**どちらか一方**を書く。

```bash
copy .env.example .env
```

**【おすすめ】サブスクで動かす（追加課金ゼロ）**
Claude Pro/Max を契約していれば、API の従量課金なしで動きます。
```bash
claude setup-token          # 年1回・ブラウザでログイン → トークンが出る
```
出たトークンを `.env` に：
```
CLAUDE_CODE_OAUTH_TOKEN=sk-ant-oat01-...
```
※ Agent SDK の利用はサブスクの**別枠の月次クレジット**で賄われます（2026/6/15〜）。個人/社内利用はOK、**他人への配布/販売だけ Anthropic の許可が必要**。

**【別案】API キーで動かす（従量課金・別請求）**
```
ANTHROPIC_API_KEY=sk-ant-...   # https://console.anthropic.com/ で発行
```
> OAuth と API キーを両方書くと **API キー（課金）が優先**されます。サブスクで使うなら API キーは書かないこと。

**他AIは任意**（無くても Claude 単独で動く。その道具は「未接続」表示）：
```
OPENAI_API_KEY=sk-...    # GPT
GEMINI_API_KEY=AIza...   # Gemini
```

### 3. 起動
```bash
npm start
```

---

## 使い方

起動したらそのまま日本語で話しかけるだけ。例：

- `このフォルダの中身を見て、何のプロジェクトか説明して`
- `src の中のバグを探して直して`
- `この認証まわりの設計、GPT と Gemini にも意見を聞いて、3つの案を統合した最適解を出して`
  → Claude が `ai_council` を呼び、3つの頭脳の意見を統合します。

終了は `exit` / `quit` / `Ctrl+C`。

---

## 設定（.env）

| 変数 | 既定 | 説明 |
|---|---|---|
| `ANTHROPIC_API_KEY` | （必須） | 中核 Claude の API キー |
| `ZENNO_MODEL` | `best` | 使う Claude モデル。`best`=Fable5アクセス可ならFable5・不可ならOpus自動降格。`claude-fable-5`でFable固定 |
| `ZENNO_FALLBACK_MODEL` | `claude-opus-4-8` | refusal/過負荷時の自動退避先 |
| `ZENNO_EFFORT` | `xhigh` | 思考の深さ low/medium/high/xhigh/max（ultracode=xhigh） |
| `ZENNO_PERMISSION` | `bypassPermissions` | 権限。全許可で自律実行。慎重にするなら `acceptEdits` |
| `ZENNO_MAX_USD` | （無制限） | Anthropic分のコスト上限（USD）。超えると自動停止 |
| `ZENNO_VERIFY` | `warn` | 検証ゲート。`warn`=編集後に自動検証して警告 / `off`=手動(`/verify`)のみ |
| `OPENAI_API_KEY` / `OPENAI_MODEL` | — / `gpt-5` | GPT 合体用 |
| `GEMINI_API_KEY` / `GEMINI_MODEL` | — / `gemini-2.5-pro` | Gemini 合体用 |

> ⚠️ `bypassPermissions` は、確認なしでシェルコマンドやファイル編集を実行します。
> 自分専用ツール向けの全許可モードです。慎重に動かしたいときは `ZENNO_PERMISSION=acceptEdits` に。

---

## 次のロードマップ（BLUEPRINT.md準拠）

**v1（運用信頼性）✅ 実装・単体検証済み**
- 核1 固有知識の前ロード（registry＋`load_project_context`）
- 核2 破壊ガード（二系統16/16）
- 核3 gitチェックポイント＋`/undo`（6/6）
- 核4 検証ゲート（warn既定）
- 多AIコスト可視化（`/cost`）・スラッシュコマンド層

**すぐ次（P0・要APIキー）**
- 実APIキーで**実走1回** → SDK実挙動・コストを実測（唯一の起動ゲート）

**v2（特化資産・効果実証後）**
- 特化資産の焼き込み（forrent転記 / OGP量産 / 契約書C103）
- `vercel_deploy` / `gen_og_image`(Satori) / `playwright_run`（半自動・承認ゲート付）
- リポ横断並列ディスパッチャ、雑用ルーティング（実測で節約確認後のみ）

---

## 仕組み（技術メモ）

- 中核: [`@anthropic-ai/claude-agent-sdk`](https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk) の `query()`。Claude Code 本体と同じエンジン。
- 合体: `tool()` + `createSdkMcpServer()` で、GPT/Gemini 呼び出しを **インプロセスのMCPツール**として登録。Claude が必要に応じて呼ぶ。
- 入力: ストリーミング入力（async generator）で1セッションを維持 → 会話の文脈が続く。
- 言語: TypeScript / Node.js（`tsx` で直接実行）。
