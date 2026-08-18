# mcp-server-sample — メモを保存・検索する最小の MCP サーバー

メモを保存・検索するだけの、最小の MCP サーバーです。外部システムへは一切繋ぎません。
保存先は同じフォルダの `notes.json` 1ファイルだけです。

MCP の3つのプリミティブを、1つずつ持たせてあります。

| プリミティブ | 誰が決めるか | このサーバーでの中身 |
|---|---|---|
| **Tools** | モデルが判断する | `add_note`（メモを追加）／`search_notes`（メモを検索） |
| **Resources** | AI アプリが取得して渡す | `notes://all`（保存済みメモの全件） |
| **Prompts** | ユーザーが明示的に選ぶ | `weekly_review`（今週のふりかえり） |

## 必要なもの

- **Node.js 24 以上**（LTS。`node --version` で確認）
- git

## セットアップ

```bash
git clone https://github.com/utakatano/mcp-server-sample.git
cd mcp-server-sample
npm install
```

`npm install` が通れば準備完了です。**この時点では起動しません。**
MCP サーバーは AI アプリが起動するので、自分でターミナルから走らせる必要はありません。

## AI アプリに繋ぐ

### Claude Code

```bash
claude mcp add notes -- node /絶対パス/mcp-server-sample/index.js
```

`claude mcp list` で `✔ Connected` と出れば繋がっています。

### Claude Desktop

設定 → Developer → 「Edit Config」で `claude_desktop_config.json` を開き、次を追記します。

```json
{
  "mcpServers": {
    "notes": {
      "command": "node",
      "args": ["/絶対パス/mcp-server-sample/index.js"]
    }
  }
}
```

保存したら **Claude Desktop を完全に終了して起動し直します**（ウィンドウを閉じるだけでは反映されません）。

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

## 動作確認

```
「来週までにネットワーク構成を確認する」とメモして
```

```
「ネットワーク」を含むメモを探して
```

`notes.json` が作られ、中身が増えていくのが確認できます。

## 保存先を変える

環境変数 `NOTES_FILE` に絶対パスを渡すと、保存先を変えられます。

```json
{
  "mcpServers": {
    "notes": {
      "command": "node",
      "args": ["/絶対パス/mcp-server-sample/index.js"],
      "env": { "NOTES_FILE": "/絶対パス/my-notes.json" }
    }
  }
}
```

## 繋がらないとき

まず**ログ**を見ます。原因はたいていここに出ています。

```bash
tail -20 ~/Library/Logs/Claude/mcp-server-notes.log   # macOS
# Windows: %APPDATA%\Claude\logs\mcp-server-notes.log
```

`Server started and connected successfully` のあとにエラーが続いていないかを見てください。

| ログに出ているもの | 原因 | 対処 |
|---|---|---|
| `Cannot find module '/.../index.js'` | `args` のパスが違う | リポジトリ直下で `pwd` を実行し、その出力＋`/index.js` を貼り直す |
| `spawn node ENOENT` | AI アプリから `node` が見つからない。nvm / volta などで PATH がシェルの設定にしかない場合に起きる | `which node` の出力（絶対パス）を `command` にそのまま書く |
| `Cannot find package '@modelcontextprotocol/server'` | 依存が入っていない | リポジトリ直下で `npm ci` |
| ログが空、または更新されない | 設定が読み込まれていない | JSON の構文（カンマ・括弧）を確認し、**Claude Desktop を完全に終了**（macOS は ⌘Q）してから起動し直す |

**サーバー側か AI アプリ側かの切り分け**は、手元で直接叩くのが速いです。

```bash
printf '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28"}}}\n' \
  | node /絶対パス/mcp-server-sample/index.js
```

`add_note` と `search_notes` を含む JSON が返れば**サーバーは正常**です。その場合は AI アプリ側の設定（パス・JSON の書き方・再起動）を疑ってください。

## サプライチェーン対策

npm パッケージの乗っ取りを想定した設定を `.npmrc` に入れてあります。`npm install` / `npm ci` のたびに効きます。

| 設定 | 何をするか |
|---|---|
| `ignore-scripts=true` | インストール時に依存パッケージのライフサイクルスクリプト（`postinstall` など）を実行しない。乗っ取られたパッケージが最初に使う実行経路を塞ぐ。`npm start` / `npm run` は従来どおり動く（pre / post スクリプトだけが走らなくなる） |
| `save-exact=true` | `npm install <pkg>` が `package.json` に `^` を付けず、完全固定で書く |
| `min-release-age=7` | 公開から7日を過ぎたバージョンだけをインストールする。npm はこれを `before=<7日前の日時>` に変換して依存を解決する |

依存は `package.json` で**完全固定**（`@modelcontextprotocol/server` は `2.0.0`、`zod` は `4.4.3`）、
`package-lock.json` に `integrity` ハッシュ付きで記録してあります。
**lock のとおりに入れたいときは `npm install` ではなく `npm ci` を使ってください。**

依存を更新するときは、意図して1つずつ上げます。

```bash
npm outdated
npm install @modelcontextprotocol/server@2.1.0   # save-exact により完全固定で書かれる
npm ls --all                                      # 増えた依存を目で確認する
```

## ライセンス

MIT
