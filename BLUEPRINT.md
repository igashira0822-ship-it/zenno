---

# ZENNO 統合設計図 — 不動産×Web量産起業家のための自律開発OS

チーフアーキテクトによる6角度（現実評価・モデルオーケストレーション・エージェント基盤・ユーザー特化・統合道具拡張・運用信頼性）の設計＋敵対的批評の統合版。各角度の批評で潰された過大主張を訂正済み。

---

## 1. 誠実な結論 ——「世界一の生産AI」になれるか

### 結論を先に: 2つの土俵を絶対に混同しない

**(A)「世界一のモデル」= 否。原理的に不可能。**

ZENNOの中核は Claude Agent SDK = Claude Code本体と完全に同一のエンジン。推論の天井は Anthropic が握り、GPT/Gemini を `fetch` で足しても平均は上がらない。個人がモデル性能でフロンティアを超えることは原理的に不可能で、ここを「世界一」と名乗った瞬間に嘘になる。

- コード生成・推論の地力は本体と**1mmも変わらない**（同一エンジンだから当然）。
- 複数AI合議で「賢くなる」のは、コンパイル通る/テスト緑/型通る といった**機械検証可能な閉じた問題だけ**。オープンな設計判断で多数決・平均を取ると、むしろ弱いモデルに引きずられて品質が下がる（committee effect）。
- マルチAI統合自体に新規性はない（Aider/Cline/OpenRouter/LiteLLM/Cursor が既に提供済み）。

**(B)「このユーザーにとっての世界一の生産システム」= 可能。ただし条件付き。**

フロンティア各社が作るのは「万人向けの汎用エージェント」。彼らは『不動産仲介起業家・1人で構想→本番公開・日本語/全文出力/全許可永続・Next15/Supabase/Vercel/pnpm/Playwright/GAS/Flutter/Electron という固有スタック・20本超の本番プロジェクト』に最適化したものは**絶対に作らない（市場が1人しかいないから）**。ここが唯一勝てる土俵。

ただし、この優位を名乗るための**正確な条件**（批評で訂正された点）:

1. **比較対象は「素のClaude Code」ではなく「Claude Code + 各リポのCLAUDE.md + MCP設定」**。設計各角度が認める通り、提案機能の8割は本体＋丁寧な設定で再現可能。ZENNOの優位は**技術的優位ではなくパッケージング・統合優位**。これを「技術で本体を超えた」と誤認すると方向を誤る。
2. 現状の v0.1（ask_gpt/ask_gemini/ai_council の3ツールを足しただけ）は**差別化として弱い**。これは捨てる。
3. 「3頭脳合体で世界一」という現状の看板は**技術的に誇張**。降ろす。

### 名乗ってよい表現 / 名乗ってはいけない表現

| 名乗ってよい | 名乗ってはいけない |
|---|---|
| Connect社の不動産×Web量産ワークフロー専用の自律実行ハブ | 世界一のモデル / 世界一の生産AI（一般名詞） |
| 全許可×多AI課金×量産という事故りやすい構成での「検証済み出力・見えるコスト・止まる暴走・巻き戻せる失敗」 | コード生成・推論で本体超え |
| 彼固有の業務知識（forrent隠し駅コード等）を焼き込んだ立ち上がりの速さ | コスト優位（API従量課金はサブスク内本体より割高になりうる） |
| 複数リポ横断の量産オペレーション | 100%全自動のブラウザ自動化 |

---

## 2. 真に世界一級になる差別化の核（生き残った差別化だけ）

批評で「薄いラッパー」「再発明」と潰された案を捨て、生き残ったものだけを残す。

### 捨てるもの（批評で潰された）

- ❌ **「3頭脳合体・常時ai_council」** — committee effect とコスト3倍・速度低下・精度希釈。常用は害。
- ❌ **コスト実測ブレーカの自前実装（Anthropic分）** — SDKの `maxBudgetUsd` オプション1行で代替可能。再発明。
- ❌ **既存の `update.bat` 等のワンコマンド済みパイプラインの薄い再ラップ** — 新規価値ゼロ。
- ❌ **夜間LLM自律バッチで本番に書き込む** — CI（GitHub Actions/Vercel preview）で決定的・安価・安全に解ける問題を、LLMの非決定性で解く悪手。
- ❌ **computer-use主役のブラウザ自動化** — 既知サイトは Playwright+保存セッションが桁違いに堅い。
- ❌ **間取り図のAI手描きSVG変換** — MEMORYで却下済。間取りクラウドのトレース運用を尊重。

### 生き残った差別化の核（4本）

**核1: プロジェクト横断の固有知識前ロード（最大かつ唯一確実）**
彼の20本超の実プロジェクトの path/stack/pkg/deploy/prod/gotchas を構造化し、cwd判定で systemPrompt へ動的注入。これがフロンティアが絶対持たない資産。**ただし正確には「機能の優位」ではなく「彼の運用に最適化された設定資産の優位」**。CLAUDE.md は cwd連動で常に正しい（腐りにくい）という本体側の利点を認めた上で、ZENNO固有の差分は「複数リポ横断知識」のみに限定する。

**核2: 全許可×多AI×量産という事故構成での運用信頼性**
- PreToolUseフックで**破壊コマンドだけ**deny（Windows/PowerShell系とPOSIX系の**二系統**）。bypassPermissions の快適さを壊さず最悪ケースだけ消す。
- 3AI横断のコスト可視化（GPT/Gemini分はREST usage×単価で自前計上。Anthropic分はSDKに任せる）。
- git自動チェックポイント + `/undo` による被害局所化。

**核3: 検証段に資源集中した「生成と検証の分離」**
生成は主モデル単独で速く。検証だけを**決定的チェック主・LLM判定従**で、本番系・課金・契約・SQLの重要パスに限定発火。self-reviewの見逃しクラスを別観点で拾う。

**核4: 彼固有の実行資産の焼き込み（汎用ツールより先に）**
forrent転記（隠し駅コード手順）、OGP量産テンプレ、契約書C103雛形——誰も持たない特化資産。**汎用デプロイ/画像APIより優先する**（差別化の根はここにしかない）。

---

## 3. アーキテクチャ（層ごとに詳細）

> 全体方針: ZENNO本体（src）は薄いまま。固有知識は**ファイル**（registry + ~/.claude メモリ + 各プロジェクト .zenno/）に置き、本体コードに業務ロジックを焼かない。彼が全文編集でき、本体更新で陳腐化しない。

### レイヤー0: 前提検証ゲート（実装前の必須関門）

**現状最大の問題: ANTHROPIC_API_KEY未設定で一度も実走していない。** 全設計が型定義ベースの机上論。これを通すまで他に進まない。

実走1回で確認する項目:
- `effort`/`preset:'claude_code'`/`permissionMode` の実挙動
- `total_cost_usd`/`modelUsage`（camelCase。snake_caseの`model_usage`はcontrol系get_usage専用——混同注意）の実値
- **`allowDangerouslySkipPermissions:true` が config に無い**（SDK上 bypassPermissions に必須）→ そもそも真のbypassで走っているか不明。これを先に潰す。
- Stopフックの**ブロック挙動**（後述の誤読箇所）の実検証

### レイヤー1: 記憶・知識（核1）

```
~/.claude/projects/.../MEMORY.md   ← 単一の真実源（human-readable）
        │ ビルド時に派生（手書きしない）
        ▼
C:\zenno\knowledge\projects.json   ← 読み取り専用キャッシュ（machine-readable）
```

**重要な訂正（批評反映）:**
- registry.json を**手書きしない**。MEMORY.md を単一真実源とし、機械可読部分（path/stack/pkg/deploy/prod）だけを派生生成。二重真実源を作らない。
- **揮発フィールド（`next`等）はキャッシュに入れない**。`integrated-cloud` の `next='2026年7月分の月次請求'` は今日(2026-06-27)時点で即陳腐化する。同期機構が無いまま注入すると、全許可モードで古い前提のまま自律実行する＝害が増幅。
- 各値に `last_verified` 日付を必須化。N日（例14日）超は append時に `[要再検証]` で明示マーク。**「前提として動け」という無条件信頼の指示文は削除。**

**注入のアーキテクチャ非互換問題（批評で発覚した致命点）と解決:**
- 現 cli.ts は `query()` を起動時1回、ストリーミング入力で単一セッションを張り続ける。systemPrompt は起動時1回しか渡せず、**セッション中に `zenno cd` で cwd を変えても知識は入れ替わらない**。「9プロジェクト横断・切替時に知識入替」という売りは、`append: ${APPEND}\n${projectContext(cwd)}` だけでは実現しない。
- **解決:** セッション中の切替は、registry を読む**インプロセスMCPツール `load_project_context(name)`** としてClaudeに呼ばせる方式に作り替える。これなら単一セッション・文脈維持のまま知識を足せて非互換が解消。起動時注入は「起動cwdの1回注入」に仕様を縮小して整合させる。

**`settingSources` の必須修正と副作用:**
- `settingSources:['project','local']` を `query()` に追加（現状未指定で CLAUDE.md/MEMORY.md が未ロードの疑い）。
- **`'user'` を含めると致命的副作用**: グローバル settings.json の `bypassPermissions+skipDangerousModePermissionPrompt` を読み込み、permissionMode が bypass に固定され、後述の破壊ガードが死ぬ可能性がある。→ `'user'` は外し、bypass挙動はZENNO側 permissionMode で明示制御。
- コンテキスト肥大化対策: **選択中プロジェクト + 直近セッション要約のみ注入**。他19プロジェクトと `~/.claude/projects` 全体の注入は禁止（ノイズ・コスト）。prompt caching を境界に。

### レイヤー2: モデルオーケストレーション（核3）

**SDK機能と自前ラッパーを2層に明確分離（批評の最重要訂正）:**

| SDK公式機能で出来ること | 自前MCPラッパーが必要なこと |
|---|---|
| Anthropic内 agents別モデル分割（Opus/Sonnet/Haiku） | GPT/Gemini/Ollama は**推論モデルとして扱えない**（`AgentDefinition.model` はAnthropic専用セレクタ） |
| Anthropic内 `fallbackModel` チェーン | GPT/ローカルへの縮退（fallbackModelはAnthropicのみ） |
| hooks / `maxBudgetUsd` / `modelUsage`（Anthropic課金） | GPT/Gemini はMCPツール（`ask_gpt`等）+自前try-chain+自前コスト計上 |

→ **「SDK公式の合成で薄い自前ラッパーではない」は誤り。** GPT/Gemini/Ollama部分は結局自前ラッパー。「世界一堅い土台」の誇張を撤回し、ZENNO固有の寄与は**運用ルール層**（council発火規約・重要パス判定・コスト合算）だと位置づけ直す。

**council の作り直し（対称合議→非対称統合）:**
- `ai_council` を廃し、2ツールに分離:
  - `propose_alternatives(problem)`: 設計分岐用。GPT/Geminiに「Claudeと異なる代替案を1つずつ」。
  - `cross_review(artifact)`: 検証用。「問題点・リスク・規約違反のみ」を構造化（項目・深刻度・該当箇所）で返す。
- 返却に「参考意見・最終判断はClaude・多数決ではない」を明記。Claude側は各指摘に「採用/棄却+理由」を必ず出力する**出力契約**で非対称統合を強制（注意書き一文では命令違反耐性が低い）。
- **発火条件を厳格化**: (a)後戻りコスト高の分岐 (b)本番デプロイ前 (c)契約書/課金/セキュリティ のみ。通常作業では呼ばない。自動発火停止、`/council` 明示のみ。
- **格下げの論拠訂正**: 現コードは多数決していない（GPT/Geminiの生回答を連結しClaudeに委ねるだけ）。よって「多数決の罠」ではなく**「信頼境界外ノイズの混入とClaudeの追従バイアス」**が正しい論拠。

**雑用ルーティング（実測してから採用）:**
- drudgeサブエージェント（Haiku/effort:low）で commit文/要約/分類を委譲。
- ただし **LLM-as-router はルーティング判断自体にOpusトークンを食う**。コミット文生成を (a)Opus単独 (b)Haikuサブエージェント (c)Ollama の3経路で各30回実測し、節約が出る経路だけ採用。出なければ破棄。
- **Ollamaは agents経由不可**（MCPツールでしか触れない＝主モデルのトークン節約効果が出ない）。さらにRTX3060ノートでの推論はIDE/ブラウザ/Playwrightとリソース競合（MEMORYのIris Xe直結運用と衝突）。→ Ollamaは「オフライン/無料が要る時だけ」に格下げ。

**フォールバック:** Anthropic内は `fallbackModel`（Sonnet）。GPT/ローカルへの縮退は自前try-chain＋縮退中フラグ明示。

### レイヤー3: 実行道具（核4）

3層に分離:
- **(A) 純MCPツール**: `vercel_deploy`（導入済CLIをspawn）/ `gen_og_image`（Satori SVG→PNG、API不要で確実）/ `playwright_run`（保存スクリプト別プロセス実行、storageState永続）/ `supabase_sql`（PAT REST）。
- **(B) サブエージェント**: `listing-agent`（forrent隠し駅コード手順を焼き込み）/ `deploy-agent` / `seo-agent`。親のツール表を汚さず隔離。
- **(C) フック**: SessionStart（プロジェクト文脈オートロード）/ PreToolUse（破壊ガード）/ PostToolUse（デプロイ後200確認）。

**ブラウザ自動化の現実:**
- 主役は Playwright（既知サイト）。computer-use は「未知サイトの一度きり偵察」専用。
- 自己修復ループ（Playwright破損→computer-useでセレクタ再推定）は**game-changerではなくresearch（信頼性未証明）に格下げ**。誤セレクタが無人実行で誤入力を量産するリスク。到達目標は**「人間が最後に確認する半自動」**（差分プレビュー→ワンクリック承認）。無人タスクスケジューラ実行とは本質的に両立しない。

### レイヤー4: 運用信頼性（核2）

**破壊ガード（最優先・真の効果あり）:**
- **批評で発覚したコード誤り**: PreToolUseの拒否は `hookSpecificOutput: { hookEventName:'PreToolUse', permissionDecision:'deny', permissionDecisionReason }`。`decision:'block'` はStop系のレガシー形で確実には発火しない。
- **判定ロジックの訂正**: `JSON.stringify`を正規表現で舐めると誤爆（`bank_transfer.md`をReadしただけでブロック / `transfer`語頻出のintegrated-cloudが片端からブロック）と漏れ（`vercel_deploy`は`prod:true`boolean渡しなのに危険語が`/--prod/`文字列でマッチせず素通り）が両方起きる。→ **`tool_name`で分岐し構造化パラメータを直接検査**（`tool_name==='vercel_deploy' && tool_input.prod===true → deny`）。
- **二系統ブラックリスト必須**: ユーザーはWindows/PowerShell運用。POSIX系（`rm -rf`/`mkfs`/`dd`）だけでなく **Windows系（`Remove-Item -Recurse -Force`/`rd /s /q`/`del /f /s /q`/`format`/`Clear-Disk`）** を検知。可搬な破壊（`git push --force`/`DROP TABLE`/`supabase db reset`）は共通。
- 取引/送金/本番DBキーは**別プロセス・別資格情報に物理隔離**し、ZENNO本体のツール表から外す。

**コスト制御:**
- Anthropic分は **`maxBudgetUsd` オプション**（自前interrupt()ループは廃止）。
- 自前実装は **GPT/Gemini分のREST usage×単価合算のみ**（現 providers.ts は usage を捨てている→拾う改修）。未知モデル名は「単価不明」フォールバック。「概算・Anthropic実測とは精度が違う」とUIで明示区別。

**検証ゲート:**
- **批評で発覚した誤読**: StopフックでブロックしてClaudeに直させる挙動は、`StopHookSpecificOutput` が `decision` を持たず additionalContext は「非エラーfeedback・会話継続」型のため、強制ゲートが型上保証されない。→ **実機検証できるまで `ZENNO_VERIFY=warn`（警告注入のみ・非block）を既定**にする。
- 決定的チェック主（`tsc --noEmit`/lint/build）・LLM判定従。**HTTP200/dev起動チェックは既定から外す**（flaky過ぎ・ゾンビプロセス・ポート衝突で量産速度を殺す）。
- 編集の起きたプロジェクトのみにスコープ。連続ブロック上限3回でループ防止。
- SDKネイティブの `verifier hook` も評価し、自前実装と比較してから決める。

**チェックポイント/巻き戻し:**
- git低レベル手順（`git stash create`でスナップショット→専用ref保存、または `commit-tree` でmain HEADを動かさず退避）で `/undo`。素朴な `git checkout` で現行作業を壊さない。effort M→L（要設計）に正直化。
- 非git・巨大バイナリ（Flutter成果物/IPFSキャッシュ/動画）は明示除外。

**可観測性:**
- 重いダッシュボードは作らない。`.zenno/runs/<date>.jsonl` 構造化ログ + 起動時1行サマリ（`今日$X(Claude$a/GPT$b/Gemini$c)・検証N回(失敗M)・ブロックK件・直近CP hh:mm`）。
- **無人実行（--task）には通知必須**: 「静かな失敗」が一番高くつく。既存のLINE/GAS通知文化に送出。二重起動ロック・冪等キーも最小実装。

---

## 4. 段階的ロードマップ

### Now（v0 — ゲートと正直化、ここを通すまで機能を積まない）

| 施策 | なぜ効くか |
|---|---|
| **P0: 実走1回でSDK挙動・コスト実測** | 全設計が机上論。effort/preset/permissionMode/total_cost_usd/Stopブロック挙動を実測しないと砂上の楼閣。`allowDangerouslySkipPermissions` 欠落も先に潰す。 |
| **P0: 看板の正直化**（README/banner/systemPrompt） | 「世界一」「3頭脳統合」「積極的にai_council」を削除。�le誠実さが角度の存在意義である以上、看板が嘘のまま他改善を積むのは自己矛盾。**最優先**（旧設計のpriority4は誤り）。 |
| **P0: 破壊ガードの正しいSDK形＋二系統＋構造化判定** | 全許可×本番実データの最大実害リスク。誤った`decision:'block'`/正規表現舐めだと守れず誤爆。Windows系欠落だと本人環境を守れない。 |

### v1（差別化の土台 — 固有知識と運用信頼性）

| 施策 | なぜ効くか |
|---|---|
| **`settingSources:['project','local']` + MEMORY.md索引注入** | CLAUDE.md/MEMORY.md未ロードの最大の穴を塞ぐ最小修正。`'user'`は外しガード死を防ぐ。 |
| **registry（MEMORY.md派生・読取専用）+ `load_project_context` MCPツール** | 横断知識を単一セッション・文脈維持で注入。アーキ非互換を解消。揮発フィールドは入れない。 |
| **コスト可視化（GPT/Gemini自前計上 + maxBudgetUsd）** | 3系統従量課金×全許可×自律の青天井リスクを実測で抑える。本体に無い唯一のコスト独自価値。 |
| **git自動チェックポイント + /undo** | 全許可×自律で複数ファイル一気書換の最大の安全網。被害局所化。 |
| **council非対称化（propose/cross_review分離・発火限定）** | committee effect回避。検証段に資源集中し見逃しクラスを拾う。常時合議の害を除去。 |
| **検証ゲート（warn既定・決定的チェック・重要パス限定）** | 「動く完成版を全文で」という嗜好に直結。LLM judge主柱化の誇張を避ける。 |
| **1行起動サマリ + JSONL** | 量産家の行動を変える最小可観測性。豪華UIは負債。 |

### v2（特化資産と量産 — 効果実証後）

| 施策 | なぜ効くか |
|---|---|
| **特化資産の焼き込み（forrent転記/OGP量産/契約書C103）** | 誰も持たない差別化の根。汎用ツールより**優先**。 |
| **`vercel_deploy` / `gen_og_image`（Satori）** | 最後の1マイル（作って終わり→動かす）。OGPはSEO/CTRに即効・API不要で確実。 |
| **`playwright_run` + listing-agent（半自動・承認ゲート付き）** | 既存suumo-scraper資産再利用。隠し駅コード手順を焼き込み。**人間最終確認前提**。 |
| **ワンショット --task + 通知** | 既存自動化文化（GAS/VPS/cron）に乗る。ただし**本番への自律書込みは禁止**、read-only要約のみ。 |
| **リポ横断並列ディスパッチャ** | Next/Vercel量産・SEOサイト増殖に直撃。ただし**手動逐次で需要確認後に並列化**（YAGNI）。 |
| **雑用ルーティング** | commit文/分類をHaiku/ローカルへ。ただし**実測でオーバーヘッド<節約を確認後**に採用。 |

---

## 5. 厳しいトレードオフとリスク（率直に）

**戦略レベルの最大リスク:**
- **堀が浅い（移植可能）**: 差別化の中身は projects.json + MEMORY.md + CLAUDE.md + フック数本という**移植可能なテキストファイル群**。本体にコピーすれば再現できる。ZENNO別バイナリを保守する正当化は「統合・パッケージング優位」のみ。→ **まず「本体 + 彼専用 .claude/」で同価値が出ないか実証し、出ない差分（横断オーケストレーション）だけを薄いCLIとして残す**ことを真剣に検討。保守負債を1/10にし「再ラップ批判」を正面から無効化する。
- **本体追従コスト**: SDK/本体は頻繁更新。汎用機能を自作すると陳腐化・二重メンテ。差別化は固有ワークフロー層のみに限定する規律が必須。

**運用レベルのリスク:**
- **記憶の陳腐化が最大の害**: MEMORY自身が「9日前・要現コード検証」と警告——これは仮説でなく現に起きている。全許可×本番データで古いSupabase ID/URL/スキーマを真実扱いすると金銭・信用事故。`last_verified`マークと無条件信頼指示の削除で対抗するが、運用規律依存は残る。
- **全許可の完全安全は不可能**: OSサンドボックス無しでブラックリストは難読化・別経路を取りこぼす。「絶対安全」は名乗らず**被害局所化（ガード+チェックポイント）が現実解**。
- **API二重課金**: 中核がAnthropic従量（サブスク別）＋GPT/Gemini課金。量産常用で本体（サブスク内）より割高になりうる。**コスト優位は名乗れない**。
- **検証ゲートのflaky無限ループ**: 環境依存・ポート衝突で誤失敗するとClaudeが直し続けトークンを溶かす。3回ブレーカ＋warn既定モードが必須。
- **半自動の上限**: ブラウザ自動化はサイトUI変更で恒常的に壊れる。100%全自動は嘘。人間最終確認が上限で、無人実行とは両立しない。

**実装レベルの確定バグ（必修正）:**
- PreToolUse拒否は `permissionDecision:'deny'`（`decision:'block'`は誤り）
- Stop検証ゲートのブロック挙動は型上未保証 → 実機検証まで warn既定
- `modelUsage`（camelCase）と `model_usage`（control系）の混同
- cwd判定は **longest-prefix match**（`suumo-scraper` と `suumo-scraper/electron-app` の誤選択防止。現 `find` は最初の一致で止まるバグ）
- スキル有効化は `skills:'all'` オプションが必須（`settingSources` だけでは動かない）
- config に `allowDangerouslySkipPermissions:true` 欠落（bypass成立の前提）

---

## 総括（一文）

ZENNOは「最も賢い1手」では世界一になれない（同一エンジンゆえ原理的に不可能）。だが**「Connect社の固有知識を前ロードし、全許可なのに事故らず、コストが見え、失敗を巻き戻せ、検証済み出力を返す——彼の量産ワークフローに密着した自律実行ハブ」としては、本体に対して誠実に明確な優位を主張できる**。その優位は技術的ブレークスルーではなくパッケージング・統合・運用規律の積み重ねであり、汎用の世界一は決して名乗らない——これがZENNOの唯一の勝ち筋であり、誠実な設計の核である。

---

主要な実装ファイルの参照先（すべて絶対パス）: `C:\zenno\src\cli.ts`（query配線・systemPrompt・hooks・maxBudgetUsd追加）、`C:\zenno\src\config.ts`（allowDangerouslySkipPermissions・予算env）、`C:\zenno\src\providers.ts`（usage取得改修）、`C:\zenno\src\tools.ts`（council分割）、新規 `C:\zenno\src\guard.ts`（二系統破壊ガード）/ `registry.ts`（MEMORY.md派生）/ `ledger.ts` / `verify.ts` / `checkpoint.ts`、`C:\zenno\knowledge\projects.json`（読取専用キャッシュ）、`C:\Users\user\.claude\projects\C--\memory\MEMORY.md`（単一真実源）。